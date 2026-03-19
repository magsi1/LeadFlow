import { sendFacebookText, resolveFacebookPageAccessToken } from '../adapters/channels/facebookSender.js';
import { sendInstagramText, resolveInstagramAccessToken } from '../adapters/channels/instagramSender.js';
import {
  sendWhatsAppText,
  resolveWhatsAppAccessToken,
  resolveWhatsAppPhoneNumberId,
} from '../adapters/channels/whatsappSender.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabaseAdmin.js';
import type { ChannelType } from '../types/normalizedInboundEvent.js';
import { ActivityLogService } from './activityLogService.js';

type SendMessageInput = {
  workspaceId: string;
  actorProfileId: string;
  conversationId: string;
  body: string;
  messageType?: string;
  clientMessageId?: string;
};

type SendMessageResult = {
  messageId: string;
  status: 'pending' | 'sent' | 'failed';
  externalMessageId?: string;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

type ConversationRow = {
  id: string;
  workspace_id: string | null;
  channel: ChannelType;
  customer_phone: string | null;
  external_user_id: string | null;
  customer_name: string | null;
  lead_id: string | null;
  integration_account_id: string | null;
};

type IntegrationRow = {
  id: string;
  channel: ChannelType;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  external_account_id: string | null;
  external_phone_number_id: string | null;
  config: Record<string, unknown> | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  body: string;
  message_type: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

export class OutboundMessageService {
  private readonly activityService = new ActivityLogService();

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const body = input.body.trim();
    if (!body) {
      throw new Error('message_body_required');
    }

    const existingClientMessage = await this.findByClientMessageId(
      input.conversationId,
      input.clientMessageId,
    );
    if (existingClientMessage) {
      return {
        messageId: existingClientMessage.id,
        status: (existingClientMessage.status as 'pending' | 'sent' | 'failed') ?? 'sent',
      };
    }

    const conversation = await this.fetchConversation(input.workspaceId, input.conversationId);
    const integration = await this.fetchIntegration(input.workspaceId, conversation);

    const pending = await this.insertPendingMessage({
      conversation,
      body,
      messageType: input.messageType ?? 'text',
      clientMessageId: input.clientMessageId,
    });
    await this.activityService.create({
      type: 'outbound_message_queued',
      description: 'Outbound message queued',
      workspaceId: conversation.workspace_id,
      leadId: conversation.lead_id,
      conversationId: conversation.id,
      metadata: {
        message_id: pending.id,
        actor_profile_id: input.actorProfileId,
      },
    });

    const sendResult = await this.sendToChannel({
      channel: conversation.channel,
      conversation,
      integration,
      text: body,
    });

    if ('errorMessage' in sendResult) {
      await this.markFailed(pending.id, sendResult.errorCode, sendResult.errorMessage);
      await this.activityService.create({
        type: 'message_send_failed',
        description: `Outbound message failed: ${sendResult.errorMessage}`,
        workspaceId: conversation.workspace_id,
        leadId: conversation.lead_id,
        conversationId: conversation.id,
        metadata: {
          message_id: pending.id,
          retryable: sendResult.retryable,
          error_code: sendResult.errorCode,
          actor_profile_id: input.actorProfileId,
        },
      });
      return {
        messageId: pending.id,
        status: 'failed',
        retryable: sendResult.retryable,
        errorCode: sendResult.errorCode,
        errorMessage: sendResult.errorMessage,
      };
    }

    await this.markSent(pending.id, sendResult.externalMessageId, sendResult.rawResponse);
    await this.updateConversationSummary(conversation.id, body);
    await this.activityService.create({
      type: 'message_sent',
      description: 'Outbound message sent',
      workspaceId: conversation.workspace_id,
      leadId: conversation.lead_id,
      conversationId: conversation.id,
      metadata: {
        message_id: pending.id,
        external_message_id: sendResult.externalMessageId,
        channel: conversation.channel,
        actor_profile_id: input.actorProfileId,
      },
    });

    return {
      messageId: pending.id,
      status: 'sent',
      externalMessageId: sendResult.externalMessageId,
    };
  }

  async retry(workspaceId: string, actorProfileId: string, messageId: string): Promise<SendMessageResult> {
    const message = await this.fetchMessage(workspaceId, messageId);
    if (!message) throw new Error('message_not_found');
    if (message.status !== 'failed') {
      throw new Error('only_failed_messages_can_be_retried');
    }

    const result = await this.send({
      workspaceId,
      actorProfileId,
      conversationId: message.conversation_id,
      body: message.body,
      messageType: message.message_type ?? 'text',
      clientMessageId: `retry_${message.id}_${Date.now()}`,
    });

    await this.activityService.create({
      type: result.status === 'sent' ? 'outbound_retry_succeeded' : 'outbound_retry_attempted',
      description:
        result.status === 'sent'
          ? 'Failed message retry succeeded'
          : 'Failed message retry attempted',
      workspaceId,
      conversationId: message.conversation_id,
      metadata: {
        retry_source_message_id: message.id,
        result_status: result.status,
      },
    });

    return result;
  }

  private async fetchConversation(workspaceId: string, conversationId: string): Promise<ConversationRow> {
    const { data, error } = await supabase
      .from('conversations')
      .select(
        'id, workspace_id, channel, customer_phone, external_user_id, customer_name, lead_id, integration_account_id',
      )
      .eq('workspace_id', workspaceId)
      .eq('id', conversationId)
      .single();
    if (error || !data) {
      throw new Error(`conversation_not_found:${conversationId}`);
    }
    return data as ConversationRow;
  }

  private async fetchIntegration(workspaceId: string, conversation: ConversationRow): Promise<IntegrationRow> {
    let query = supabase
      .from('integration_accounts')
      .select(
        'id, channel, status, external_account_id, external_phone_number_id, config',
      )
      .eq('workspace_id', workspaceId)
      .eq('channel', conversation.channel)
      .in('status', ['connected', 'pending'])
      .limit(1);

    if (conversation.integration_account_id) {
      query = query.eq('id', conversation.integration_account_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      throw new Error(`integration_account_not_connected:${conversation.channel}`);
    }
    return data as IntegrationRow;
  }

  private async insertPendingMessage(args: {
    conversation: ConversationRow;
    body: string;
    messageType: string;
    clientMessageId?: string;
  }): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: args.conversation.id,
        direction: 'outbound',
        body: args.body,
        message_type: args.messageType,
        sent_at: new Date().toISOString(),
        sender_name: 'LeadFlow Agent',
        channel: args.conversation.channel,
        status: 'pending',
        client_message_id: args.clientMessageId ?? null,
        metadata: {
          transport: 'meta_graph',
        },
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`pending_message_insert_failed:${error?.message ?? 'unknown'}`);
    }
    return data as { id: string };
  }

  private async sendToChannel(args: {
    channel: ChannelType;
    conversation: ConversationRow;
    integration: IntegrationRow;
    text: string;
  }) {
    const config = args.integration.config ?? {};
    if (args.channel === 'whatsapp') {
      const toPhone = args.conversation.customer_phone ?? args.conversation.external_user_id;
      if (!toPhone) {
        return { errorMessage: 'missing_recipient_phone', retryable: false };
      }
      const accessToken = resolveWhatsAppAccessToken(config);
      const phoneNumberId = resolveWhatsAppPhoneNumberId(
        config,
        args.integration.external_phone_number_id,
      );
      if (!accessToken || !phoneNumberId) {
        return { errorMessage: 'whatsapp_credentials_missing', retryable: false };
      }
      return sendWhatsAppText({
        toPhoneNumber: toPhone,
        text: args.text,
        accessToken,
        phoneNumberId,
      });
    }

    if (args.channel === 'facebook') {
      const recipientPsid = args.conversation.external_user_id;
      const pageId = args.integration.external_account_id;
      if (!recipientPsid || !pageId) {
        return { errorMessage: 'facebook_recipient_or_page_missing', retryable: false };
      }
      const accessToken = resolveFacebookPageAccessToken(config);
      if (!accessToken) {
        return { errorMessage: 'facebook_access_token_missing', retryable: false };
      }
      return sendFacebookText({
        recipientPsid,
        pageId,
        text: args.text,
        accessToken,
      });
    }

    const recipientId = args.conversation.external_user_id;
    const pageId = args.integration.external_account_id;
    if (!recipientId || !pageId) {
      return { errorMessage: 'instagram_recipient_or_page_missing', retryable: false };
    }
    const accessToken = resolveInstagramAccessToken(config);
    if (!accessToken) {
      return { errorMessage: 'instagram_access_token_missing', retryable: false };
    }
    return sendInstagramText({
      recipientId,
      pageId,
      text: args.text,
      accessToken,
    });
  }

  private async markSent(
    messageId: string,
    externalMessageId: string,
    providerResponse: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({
        status: 'sent',
        external_message_id: externalMessageId,
        metadata: {
          provider_response: providerResponse,
        },
        error_code: null,
        error_message: null,
        failed_at: null,
      })
      .eq('id', messageId);
    if (error) {
      logger.warn('Failed to mark message as sent', {
        message_id: messageId,
        error: error.message,
      });
    }
  }

  private async markFailed(
    messageId: string,
    errorCode: string | undefined,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('messages')
      .update({
        status: 'failed',
        error_code: errorCode ?? null,
        error_message: errorMessage,
        failed_at: now,
      })
      .eq('id', messageId);
    if (error) {
      logger.warn('Failed to mark message as failed', {
        message_id: messageId,
        error: error.message,
      });
    }
  }

  private async updateConversationSummary(conversationId: string, body: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('conversations')
      .update({
        last_message_preview: body,
        last_message_at: now,
        updated_at: now,
      })
      .eq('id', conversationId);
    if (error) {
      logger.warn('Failed updating conversation summary after outbound send', {
        conversation_id: conversationId,
        error: error.message,
      });
    }
  }

  private async findByClientMessageId(
    conversationId: string,
    clientMessageId: string | undefined,
  ): Promise<{ id: string; status: string | null } | null> {
    if (!clientMessageId) return null;
    const { data, error } = await supabase
      .from('messages')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .eq('client_message_id', clientMessageId)
      .maybeSingle();
    if (error) return null;
    return (data as { id: string; status: string | null } | null) ?? null;
  }

  private async fetchMessage(workspaceId: string, messageId: string): Promise<MessageRow | null> {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, body, message_type, status, metadata, conversations!inner(workspace_id)')
      .eq('conversations.workspace_id', workspaceId)
      .eq('id', messageId)
      .maybeSingle();
    if (error) return null;
    return (data as MessageRow | null) ?? null;
  }
}
