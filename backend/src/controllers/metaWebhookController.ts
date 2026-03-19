import type { Request, Response } from 'express';

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import type { MetaWebhookPayload } from '../types/meta.js';
import { verifyMetaSignature } from '../utils/verifyMetaSignature.js';
import { ConversationIngestionService } from '../services/conversationIngestionService.js';
import { MessageStatusService } from '../services/messageStatusService.js';
import { MetaWebhookService } from '../services/metaWebhookService.js';

const metaWebhookService = new MetaWebhookService();
const ingestionService = new ConversationIngestionService();
const messageStatusService = new MessageStatusService();

export function verifyMetaWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    token === env.metaWebhookVerifyToken &&
    typeof challenge === 'string'
  ) {
    logger.info('Meta webhook verified');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('Meta webhook verification failed');
  res.sendStatus(403);
}

export async function handleMetaWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.header('x-hub-signature-256');
  const isValid = verifyMetaSignature(
    env.metaAppSecret,
    signature,
    req.rawBody as Buffer | undefined,
  );

  if (!isValid) {
    logger.warn('Meta webhook rejected due to invalid signature');
    res.sendStatus(401);
    return;
  }

  const payload = (req.body as MetaWebhookPayload) ?? {};
  const object = payload.object ?? 'unknown';
  const inboundEvents = metaWebhookService.extractInboundEvents(payload);
  const statusEvents = metaWebhookService.extractStatusEvents(payload);

  res.status(200).json({
    ok: true,
    accepted: inboundEvents.length + statusEvents.length,
    inbound: inboundEvents.length,
    statuses: statusEvents.length,
  });

  for (const event of inboundEvents) {
    try {
      await ingestionService.ingestInboundEvent(event);
    } catch (error) {
      logger.error('Inbound event ingestion failed', {
        channel: event.channel,
        external_message_id: event.externalMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const statusEvent of statusEvents) {
    try {
      await messageStatusService.applyStatusEvent(statusEvent);
    } catch (error) {
      logger.error('Message status reconcile failed', {
        channel: statusEvent.channel,
        external_message_id: statusEvent.externalMessageId,
        status: statusEvent.status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (inboundEvents.length === 0 && statusEvents.length === 0) {
    logger.debug('Meta webhook received no parsable events', { object });
  }
}
