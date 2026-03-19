import { Router } from 'express';

import {
  createWorkspaceInvitation,
  listAssignmentRules,
  listMyWorkspaces,
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  updateWorkspaceMemberStatus,
} from '../controllers/workspaceAdminController.js';
import {
  requireAuthenticatedProfile,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from '../middleware/workspaceAuth.js';

export const workspacesRouter = Router();

workspacesRouter.get('/', requireAuthenticatedProfile, listMyWorkspaces);
workspacesRouter.get(
  '/:workspaceId/members',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin', 'manager']),
  listWorkspaceMembers,
);
workspacesRouter.patch(
  '/:workspaceId/members/:profileId/role',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin']),
  updateWorkspaceMemberRole,
);
workspacesRouter.patch(
  '/:workspaceId/members/:profileId/status',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin']),
  updateWorkspaceMemberStatus,
);
workspacesRouter.post(
  '/:workspaceId/invitations',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin']),
  createWorkspaceInvitation,
);
workspacesRouter.get(
  '/:workspaceId/assignment-rules',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin', 'manager']),
  listAssignmentRules,
);
