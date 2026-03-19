import { supabase } from '../lib/supabaseAdmin.js';
import { logger } from '../lib/logger.js';
import type { NormalizedInboundEvent } from '../types/normalizedInboundEvent.js';
import { ActivityLogService } from './activityLogService.js';

type AssignmentRuleRow = {
  id: string;
  rule_type: 'round_robin' | 'least_busy' | 'manual_default' | 'channel_based' | 'city_based';
  conditions: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  fallback_member_id: string | null;
};

type WorkspaceMemberRow = {
  id: string;
  profile_id: string;
  role: string;
  status: string;
  assignment_capacity: number | null;
};

export class AssignmentRuleEngineService {
  private readonly activityService = new ActivityLogService();

  async assignForInboundConversation(args: {
    workspaceId: string;
    conversationId: string;
    leadId?: string | null;
    event: NormalizedInboundEvent;
  }): Promise<string | null> {
    const rules = await this.fetchActiveRules(args.workspaceId);
    const members = await this.fetchEligibleMembers(args.workspaceId);
    if (members.length === 0) return null;

    for (const rule of rules) {
      const profileId = await this.evaluateRule(rule, members, args.workspaceId, args.event);
      if (!profileId) continue;
      await this.applyAssignment(args.workspaceId, args.conversationId, args.leadId, profileId, rule.id);
      return profileId;
    }

    // Fallback to first active sales/admin member.
    const fallback = members[0]?.profile_id;
    if (fallback) {
      await this.applyAssignment(args.workspaceId, args.conversationId, args.leadId, fallback, 'fallback');
      return fallback;
    }
    return null;
  }

  private async applyAssignment(
    workspaceId: string,
    conversationId: string,
    leadId: string | null | undefined,
    profileId: string,
    ruleId: string,
  ): Promise<void> {
    await supabase
      .from('conversations')
      .update({ assigned_to: profileId })
      .eq('workspace_id', workspaceId)
      .eq('id', conversationId);

    if (leadId) {
      await supabase
        .from('leads')
        .update({ assigned_to: profileId })
        .eq('workspace_id', workspaceId)
        .eq('id', leadId);
    }

    await this.activityService.create({
      type: 'auto_assignment_applied',
      description: 'Auto-assignment rule applied',
      workspaceId,
      leadId: leadId ?? null,
      conversationId,
      metadata: {
        assignee_profile_id: profileId,
        rule_id: ruleId,
      },
    });
  }

  private async fetchActiveRules(workspaceId: string): Promise<AssignmentRuleRow[]> {
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('id, rule_type, conditions, config, fallback_member_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error || !data) {
      logger.warn('Failed to fetch assignment rules', { workspace_id: workspaceId, error: error?.message });
      return [];
    }
    return data as AssignmentRuleRow[];
  }

  private async fetchEligibleMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('id, profile_id, role, status, assignment_capacity')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .in('role', ['sales', 'manager', 'admin', 'owner']);
    if (error || !data) {
      logger.warn('Failed to fetch eligible workspace members', {
        workspace_id: workspaceId,
        error: error?.message,
      });
      return [];
    }
    return data as WorkspaceMemberRow[];
  }

  private async evaluateRule(
    rule: AssignmentRuleRow,
    members: WorkspaceMemberRow[],
    workspaceId: string,
    event: NormalizedInboundEvent,
  ): Promise<string | null> {
    const config = rule.config ?? {};
    const conditions = rule.conditions ?? {};

    if (rule.rule_type === 'manual_default') {
      const profileId = (config['assigneeProfileId'] as string | undefined) ?? null;
      return this.isEligible(profileId, members) ? profileId : null;
    }

    if (rule.rule_type === 'channel_based') {
      const channelMapping = (config['channelMap'] as Record<string, unknown>) ?? {};
      const profileId = channelMapping[event.channel]?.toString();
      return this.isEligible(profileId, members) ? profileId! : null;
    }

    if (rule.rule_type === 'city_based') {
      const expectedCity = conditions['city']?.toString().toLowerCase();
      const actualCity = event.metadata['city']?.toString().toLowerCase();
      if (expectedCity == null || expectedCity !== actualCity) return null;
      const profileId = (config['assigneeProfileId'] as string | undefined) ?? null;
      return this.isEligible(profileId, members) ? profileId : null;
    }

    if (rule.rule_type === 'least_busy') {
      return this.pickLeastBusy(workspaceId, members);
    }

    // round_robin as default strategy.
    return this.pickRoundRobin(workspaceId, rule.id, members);
  }

  private isEligible(profileId: string | null | undefined, members: WorkspaceMemberRow[]): boolean {
    if (!profileId) return false;
    return members.some((m) => m.profile_id === profileId);
  }

  private async pickLeastBusy(
    workspaceId: string,
    members: WorkspaceMemberRow[],
  ): Promise<string | null> {
    if (members.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const member of members) {
      const { count } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('assigned_to', member.profile_id)
        .neq('status', 'closed');
      counts[member.profile_id] = count ?? 0;
    }
    members.sort((a, b) => (counts[a.profile_id] ?? 0) - (counts[b.profile_id] ?? 0));
    return members[0]?.profile_id ?? null;
  }

  private async pickRoundRobin(
    workspaceId: string,
    ruleId: string,
    members: WorkspaceMemberRow[],
  ): Promise<string | null> {
    if (members.length === 0) return null;
    const { data } = await supabase
      .from('activities')
      .select('metadata, created_at')
      .eq('workspace_id', workspaceId)
      .eq('type', 'auto_assignment_applied')
      .eq('metadata->>rule_id', ruleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastProfileId = (data as { metadata?: { assignee_profile_id?: string } } | null)?.metadata
      ?.assignee_profile_id;
    if (!lastProfileId) return members[0]?.profile_id ?? null;

    const currentIdx = members.findIndex((m) => m.profile_id === lastProfileId);
    const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % members.length;
    return members[nextIdx].profile_id;
  }
}
