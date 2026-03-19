import { Router } from 'express';

import {
  listIntegrationAccounts,
  upsertIntegrationAccount,
} from '../controllers/integrationAccountController.js';
import { requireWorkspaceMember, requireWorkspaceRole } from '../middleware/workspaceAuth.js';

export const integrationsRouter = Router();

integrationsRouter.get(
  '/accounts',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin']),
  listIntegrationAccounts,
);
integrationsRouter.post(
  '/accounts',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin']),
  upsertIntegrationAccount,
);
