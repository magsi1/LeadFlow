export type ChannelType = 'whatsapp' | 'instagram' | 'facebook';
export type MessageDirection = 'inbound' | 'outbound';

export type InboundAttachment = {
  type: string;
  url?: string;
  id?: string;
  mimeType?: string;
};

export type NormalizedInboundEvent = {
  channel: ChannelType;
  externalAccountId?: string;
  externalConversationId?: string;
  externalMessageId: string;
  customerExternalId?: string;
  customerName?: string;
  customerHandle?: string;
  customerPhone?: string;
  messageText: string;
  messageType: string;
  direction: MessageDirection;
  sentAt: string;
  rawPayload: Record<string, unknown>;
  attachments: InboundAttachment[];
  metadata: Record<string, unknown>;
};
