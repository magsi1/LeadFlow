import type { Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import { IntegrationAccountService } from '../services/integrationAccountService.js';

const service = new IntegrationAccountService();

export async function listIntegrationAccounts(_req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = _req.workspaceAuth?.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ ok: false, error: 'workspace_context_required' });
      return;
    }
    const data = await service.list(workspaceId);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    logger.error('List integration accounts failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, error: 'failed_to_list_integration_accounts' });
  }
}

export async function upsertIntegrationAccount(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.workspaceAuth?.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ ok: false, error: 'workspace_context_required' });
      return;
    }
    const body = req.body as {
      id?: string;
      channel: 'whatsapp' | 'instagram' | 'facebook';
      displayName: string;
      externalAccountId?: string;
      externalPhoneNumberId?: string;
      status?: 'connected' | 'disconnected' | 'error' | 'pending';
      config?: Record<string, unknown>;
    };

    if (!body.channel || !body.displayName) {
      res.status(400).json({ ok: false, error: 'channel_and_displayName_required' });
      return;
    }

    const data = await service.upsert(workspaceId, body);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    logger.error('Upsert integration account failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, error: 'failed_to_upsert_integration_account' });
  }
}
