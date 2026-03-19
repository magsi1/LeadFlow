import type { MetaMessagingEvent } from '../../types/meta.js';
import type { NormalizedInboundEvent } from '../../types/normalizedInboundEvent.js';

export function parseFacebookMessagingEvent(
  event: MetaMessagingEvent,
  entryId: string | undefined,
  rawPayload: Record<string, unknown>,
): NormalizedInboundEvent | null {
  const messageId = event.message?.mid;
  const senderId = event.sender?.id;
  if (!messageId || !senderId) return null;

  const text = event.message?.text ?? '[Unsupported message]';
  const sentAt = event.timestamp
    ? new Date(event.timestamp).toISOString()
    : new Date().toISOString();

  return {
    channel: 'facebook',
    externalAccountId: entryId,
    externalConversationId: senderId,
    externalMessageId: messageId,
    customerExternalId: senderId,
    customerHandle: senderId,
    messageText: text,
    messageType: 'text',
    direction: 'inbound',
    sentAt,
    rawPayload,
    attachments: [],
    metadata: {
      recipient_id: event.recipient?.id,
    },
  };
}
