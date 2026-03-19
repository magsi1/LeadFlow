import { Router } from 'express';

import { retryMessage, sendMessage } from '../controllers/messageSendController.js';
import { requireWorkspaceMember, requireWorkspaceRole } from '../middleware/workspaceAuth.js';

export const messagesRouter = Router();

messagesRouter.post(
  '/send',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin', 'manager', 'sales']),
  sendMessage,
);
messagesRouter.post(
  '/:id/retry',
  requireWorkspaceMember,
  requireWorkspaceRole(['owner', 'admin', 'manager', 'sales']),
  retryMessage,
);
