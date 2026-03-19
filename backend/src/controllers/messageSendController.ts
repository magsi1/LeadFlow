import type { Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import { OutboundMessageService } from '../services/outboundMessageService.js';

const outboundService = new OutboundMessageService();

export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.workspaceAuth;
    if (!auth) {
      res.status(400).json({ ok: false, error: 'workspace_context_required' });
      return;
    }
    const body = req.body as {
      conversationId?: string;
      body?: string;
      text?: string;
      messageType?: string;
      clientMessageId?: string;
    };
    const conversationId = body.conversationId?.trim();
    const messageBody = (body.body ?? body.text ?? '').trim();

    if (!conversationId || !messageBody) {
      res.status(400).json({ ok: false, error: 'conversationId_and_body_required' });
      return;
    }

    const result = await outboundService.send({
      workspaceId: auth.workspaceId,
      actorProfileId: auth.profileId,
      conversationId,
      body: messageBody,
      messageType: body.messageType ?? 'text',
      clientMessageId: body.clientMessageId,
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Outbound send failed', { error: message });
    res.status(422).json({ ok: false, error: message });
  }
}

export async function retryMessage(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.workspaceAuth;
    if (!auth) {
      res.status(400).json({ ok: false, error: 'workspace_context_required' });
      return;
    }
    const messageId = req.params.id;
    if (!messageId) {
      res.status(400).json({ ok: false, error: 'message_id_required' });
      return;
    }
    const result = await outboundService.retry(auth.workspaceId, auth.profileId, messageId);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Outbound retry failed', {
      message_id: req.params.id,
      error: message,
    });
    res.status(422).json({ ok: false, error: message });
  }
}
