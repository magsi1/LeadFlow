import type { NormalizedInboundEvent } from '../../types/normalizedInboundEvent.js';

type WhatsAppValue = {
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { id?: string; mime_type?: string };
    video?: { id?: string; mime_type?: string };
    document?: { id?: string; mime_type?: string };
  }>;
};

function asWhatsAppValue(value: unknown): WhatsAppValue {
  return (value as WhatsAppValue) ?? {};
}

export function parseWhatsAppChange(
  value: unknown,
  rawPayload: Record<string, unknown>,
): NormalizedInboundEvent[] {
  const parsed = asWhatsAppValue(value);
  const phoneNumberId = parsed.metadata?.phone_number_id;
  const contact = parsed.contacts?.[0];

  return (parsed.messages ?? [])
    .filter((m) => Boolean(m.id) && Boolean(m.from))
    .map((m) => {
      const messageType = m.type ?? 'text';
      const text =
        m.text?.body ??
        (messageType === 'image'
          ? '[Image]'
          : messageType === 'video'
            ? '[Video]'
            : messageType === 'document'
              ? '[Document]'
              : '[Unsupported message]');

      const attachments: NormalizedInboundEvent['attachments'] = [];
      if (m.image?.id) {
        attachments.push({
          type: 'image',
          id: m.image.id,
          mimeType: m.image.mime_type,
        });
      }
      if (m.video?.id) {
        attachments.push({
          type: 'video',
          id: m.video.id,
          mimeType: m.video.mime_type,
        });
      }
      if (m.document?.id) {
        attachments.push({
          type: 'document',
          id: m.document.id,
          mimeType: m.document.mime_type,
        });
      }

      const sentAt = m.timestamp
        ? new Date(Number.parseInt(m.timestamp, 10) * 1000).toISOString()
        : new Date().toISOString();

      return {
        channel: 'whatsapp',
        externalAccountId: phoneNumberId,
        externalConversationId: m.from,
        externalMessageId: m.id as string,
        customerExternalId: m.from,
        customerName: contact?.profile?.name,
        customerPhone: m.from,
        messageText: text,
        messageType,
        direction: 'inbound',
        sentAt,
        rawPayload,
        attachments,
        metadata: {
          display_phone_number: parsed.metadata?.display_phone_number,
        },
      } satisfies NormalizedInboundEvent;
    });
}
