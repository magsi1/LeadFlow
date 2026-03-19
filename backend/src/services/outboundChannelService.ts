import { logger } from '../lib/logger.js';

type OutboundMessageInput = {
  integrationAccountId: string;
  conversationId: string;
  toExternalUserId: string;
  text: string;
};

export class OutboundChannelService {
  async sendWhatsAppMessage(input: OutboundMessageInput): Promise<void> {
    // TODO: Implement WhatsApp Cloud API send using Graph endpoint + token management.
    logger.info('Outbound WhatsApp send placeholder', {
      integration_account_id: input.integrationAccountId,
      conversation_id: input.conversationId,
    });
  }

  async sendInstagramMessage(input: OutboundMessageInput): Promise<void> {
    // TODO: Implement Instagram messaging send via Meta Graph APIs where permitted.
    logger.info('Outbound Instagram send placeholder', {
      integration_account_id: input.integrationAccountId,
      conversation_id: input.conversationId,
    });
  }

  async sendFacebookMessage(input: OutboundMessageInput): Promise<void> {
    // TODO: Implement Facebook Messenger send via Send API.
    logger.info('Outbound Facebook send placeholder', {
      integration_account_id: input.integrationAccountId,
      conversation_id: input.conversationId,
    });
  }
}
