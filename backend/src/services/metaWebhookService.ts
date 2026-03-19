import { parseFacebookMessagingEvent } from '../adapters/channels/facebookAdapter.js';
import { parseInstagramMessagingEvent } from '../adapters/channels/instagramAdapter.js';
import { parseWhatsAppChange } from '../adapters/channels/whatsappAdapter.js';
import { parseWhatsAppStatuses } from '../adapters/channels/whatsappStatusAdapter.js';
import { logger } from '../lib/logger.js';
import type { MetaEntry, MetaWebhookPayload } from '../types/meta.js';
import type { NormalizedMessageStatusEvent } from '../types/messageStatusEvent.js';
import type { NormalizedInboundEvent } from '../types/normalizedInboundEvent.js';

function asRecord(value: unknown): Record<string, unknown> {
  return (value as Record<string, unknown>) ?? {};
}

export class MetaWebhookService {
  extractInboundEvents(payload: MetaWebhookPayload): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    const object = payload.object ?? '';

    for (const entry of payload.entry ?? []) {
      events.push(...this.extractFromChanges(object, entry));
      events.push(...this.extractFromMessaging(object, entry));
    }
    return events;
  }

  extractStatusEvents(payload: MetaWebhookPayload): NormalizedMessageStatusEvent[] {
    const events: NormalizedMessageStatusEvent[] = [];
    const object = payload.object ?? '';

    for (const entry of payload.entry ?? []) {
      events.push(...this.extractStatusFromChanges(object, entry));
      events.push(...this.extractStatusFromMessaging(object, entry));
    }
    return events;
  }

  private extractFromChanges(object: string, entry: MetaEntry): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];

    for (const change of entry.changes ?? []) {
      if (object === 'whatsapp_business_account' && change.field === 'messages') {
        const rawPayload = {
          object,
          entry_id: entry.id,
          change,
        };
        events.push(...parseWhatsAppChange(change.value, rawPayload));
        continue;
      }

      if (change.field === 'messages') {
        // TODO: Expand parsing for additional Meta surfaces as needed.
        const asValue = asRecord(change.value);
        const messaging = (asValue.messaging as Array<Record<string, unknown>>) ?? [];
        for (const item of messaging) {
          const candidate = this.parseMessagingByObject(
            object,
            item as {
              sender?: { id?: string };
              recipient?: { id?: string };
              timestamp?: number;
              message?: { mid?: string; text?: string };
            },
            entry.id,
            { object, entry_id: entry.id, change, item },
          );
          if (candidate) events.push(candidate);
        }
        continue;
      }

      logger.debug('Skipping unsupported change field', {
        object,
        field: change.field,
        entry_id: entry.id,
      });
    }

    return events;
  }

  private extractStatusFromChanges(
    object: string,
    entry: MetaEntry,
  ): NormalizedMessageStatusEvent[] {
    const events: NormalizedMessageStatusEvent[] = [];

    for (const change of entry.changes ?? []) {
      if (object === 'whatsapp_business_account' && change.field === 'messages') {
        const rawPayload = {
          object,
          entry_id: entry.id,
          change,
        };
        events.push(...parseWhatsAppStatuses(change.value, rawPayload));
      }
    }

    return events;
  }

  private extractFromMessaging(object: string, entry: MetaEntry): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    for (const event of entry.messaging ?? []) {
      const candidate = this.parseMessagingByObject(
        object,
        event,
        entry.id,
        { object, entry_id: entry.id, event },
      );
      if (candidate) events.push(candidate);
    }
    return events;
  }

  private extractStatusFromMessaging(
    object: string,
    entry: MetaEntry,
  ): NormalizedMessageStatusEvent[] {
    const events: NormalizedMessageStatusEvent[] = [];
    for (const event of entry.messaging ?? []) {
      const timestamp = event.delivery?.watermark ?? event.read?.watermark ?? event.timestamp;
      const occurredAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

      for (const mid of event.delivery?.mids ?? []) {
        events.push({
          channel: object === 'instagram' ? 'instagram' : 'facebook',
          externalMessageId: mid,
          status: 'delivered',
          occurredAt,
          externalAccountId: entry.id,
          rawPayload: { object, entry_id: entry.id, event },
        });
      }

      const readMid = event.read?.mid;
      if (readMid) {
        events.push({
          channel: object === 'instagram' ? 'instagram' : 'facebook',
          externalMessageId: readMid,
          status: 'read',
          occurredAt,
          externalAccountId: entry.id,
          rawPayload: { object, entry_id: entry.id, event },
        });
      }
    }
    return events;
  }

  private parseMessagingByObject(
    object: string,
    event: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string; is_echo?: boolean };
    },
    entryId: string | undefined,
    rawPayload: Record<string, unknown>,
  ): NormalizedInboundEvent | null {
    if (!event?.message || event.message.is_echo === true) return null;

    if (object === 'instagram') {
      return parseInstagramMessagingEvent(event, entryId, rawPayload);
    }
    if (object === 'page') {
      // Meta page webhooks can carry Messenger or Instagram-related signals.
      // TODO: Expand channel detection with app-scoped account mapping.
      return parseFacebookMessagingEvent(event, entryId, rawPayload);
    }

    return null;
  }
}
