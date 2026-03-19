import crypto from 'node:crypto';

import { supabase } from '../lib/supabaseAdmin.js';

export class WorkspaceAdminService {
  async listWorkspaces(profileId: string) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, status, workspaces:workspace_id(*)')
      .eq('profile_id', profileId)
      .eq('status', 'active');
    if (error) throw new Error(`list_workspaces_failed:${error.message}`);
    return (data ?? []).map((row) => row.workspaces).filter(Boolean);
  }

  async listMembers(workspaceId: string) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('*, profiles:profile_id(*)')
      .eq('workspace_id', workspaceId)
      .order('created_at');
    if (error) throw new Error(`list_members_failed:${error.message}`);
    return data ?? [];
  }

  async updateMemberRole(workspaceId: string, profileId: string, role: string) {
    const { error } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspaceId)
      .eq('profile_id', profileId);
    if (error) throw new Error(`update_member_role_failed:${error.message}`);
  }

  async updateMemberStatus(workspaceId: string, profileId: string, status: string) {
    const { error } = await supabase
      .from('workspace_members')
      .update({ status })
      .eq('workspace_id', workspaceId)
      .eq('profile_id', profileId);
    if (error) throw new Error(`update_member_status_failed:${error.message}`);
  }

  async createInvitation(args: {
    workspaceId: string;
    email: string;
    role: string;
    invitedBy: string;
  }) {
    const token = crypto.randomBytes(24).toString('hex');
    const { data, error } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: args.workspaceId,
        email: args.email.trim().toLowerCase(),
        role: args.role,
        invited_by: args.invitedBy,
        token,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (error || !data) throw new Error(`create_invitation_failed:${error?.message}`);
    return data;
  }

  async listAssignmentRules(workspaceId: string) {
    const { data, error } = await supabase
      .from('assignment_rules')
      .select()
      .eq('workspace_id', workspaceId)
      .order('created_at');
    if (error) throw new Error(`list_assignment_rules_failed:${error.message}`);
    return data ?? [];
  }
}
