import type { NormalizedMessageStatusEvent } from '../../types/messageStatusEvent.js';

type WhatsAppStatusValue = {
  metadata?: {
    phone_number_id?: string;
  };
  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;
    errors?: Array<{
      code?: number;
      title?: string;
      message?: string;
    }>;
  }>;
};

function normalizeStatus(value: string | undefined): NormalizedMessageStatusEvent['status'] | null {
  if (!value) return null;
  if (value === 'sent') return 'sent';
  if (value === 'delivered') return 'delivered';
  if (value === 'read') return 'read';
  if (value === 'failed') return 'failed';
  return null;
}

export function parseWhatsAppStatuses(
  value: unknown,
  rawPayload: Record<string, unknown>,
): NormalizedMessageStatusEvent[] {
  const parsed = ((value as WhatsAppStatusValue) ?? {}) as WhatsAppStatusValue;
  const externalAccountId = parsed.metadata?.phone_number_id;
  const statuses = parsed.statuses ?? [];
  const events: NormalizedMessageStatusEvent[] = [];
  for (const item of statuses) {
    const status = normalizeStatus(item.status);
    if (!item.id || !status) continue;
    const firstError = item.errors?.[0];
    events.push({
      channel: 'whatsapp',
      externalMessageId: item.id,
      status,
      occurredAt: item.timestamp
        ? new Date(Number.parseInt(item.timestamp, 10) * 1000).toISOString()
        : new Date().toISOString(),
      externalAccountId,
      errorCode: firstError?.code?.toString(),
      errorMessage: firstError?.message ?? firstError?.title,
      rawPayload,
    });
  }
  return events;
}
