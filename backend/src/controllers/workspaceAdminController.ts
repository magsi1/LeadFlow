import type { Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import { WorkspaceAdminService } from '../services/workspaceAdminService.js';

const service = new WorkspaceAdminService();

export async function listMyWorkspaces(req: Request, res: Response): Promise<void> {
  try {
    const profileId = req.workspaceAuth?.profileId;
    if (!profileId) {
      res.status(400).json({ ok: false, error: 'workspace_context_required' });
      return;
    }
    const workspaces = await service.listWorkspaces(profileId);
    res.status(200).json({ ok: true, workspaces });
  } catch (error) {
    logger.error('List workspaces failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'list_workspaces_failed' });
  }
}

export async function listWorkspaceMembers(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    const members = await service.listMembers(workspaceId);
    res.status(200).json({ ok: true, members });
  } catch (error) {
    logger.error('List workspace members failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'list_workspace_members_failed' });
  }
}

export async function updateWorkspaceMemberRole(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    const profileId = req.params.profileId;
    const role = (req.body as { role?: string })?.role;
    if (!role) {
      res.status(400).json({ ok: false, error: 'role_required' });
      return;
    }
    await service.updateMemberRole(workspaceId, profileId, role);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Update member role failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'update_member_role_failed' });
  }
}

export async function updateWorkspaceMemberStatus(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    const profileId = req.params.profileId;
    const status = (req.body as { status?: string })?.status;
    if (!status) {
      res.status(400).json({ ok: false, error: 'status_required' });
      return;
    }
    await service.updateMemberStatus(workspaceId, profileId, status);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Update member status failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'update_member_status_failed' });
  }
}

export async function createWorkspaceInvitation(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    const invitedBy = req.workspaceAuth?.profileId;
    const body = req.body as { email?: string; role?: string };
    if (!invitedBy || !body.email || !body.role) {
      res.status(400).json({ ok: false, error: 'email_role_and_context_required' });
      return;
    }
    const invitation = await service.createInvitation({
      workspaceId,
      email: body.email,
      role: body.role,
      invitedBy,
    });
    res.status(200).json({ ok: true, invitation });
  } catch (error) {
    logger.error('Create workspace invitation failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'create_workspace_invitation_failed' });
  }
}

export async function listAssignmentRules(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    const rules = await service.listAssignmentRules(workspaceId);
    res.status(200).json({ ok: true, rules });
  } catch (error) {
    logger.error('List assignment rules failed', { error: String(error) });
    res.status(500).json({ ok: false, error: 'list_assignment_rules_failed' });
  }
}
