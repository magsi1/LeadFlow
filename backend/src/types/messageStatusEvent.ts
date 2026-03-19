import type { ChannelType } from './normalizedInboundEvent.js';

export type OutboundDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type NormalizedMessageStatusEvent = {
  channel: ChannelType;
  externalMessageId: string;
  status: OutboundDeliveryStatus;
  occurredAt: string;
  externalAccountId?: string;
  errorCode?: string;
  errorMessage?: string;
  rawPayload: Record<string, unknown>;
};
