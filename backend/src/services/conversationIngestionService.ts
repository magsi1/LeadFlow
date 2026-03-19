import { supabase } from '../lib/supabaseAdmin.js';
import { logger } from '../lib/logger.js';
import type { ChannelType, NormalizedInboundEvent } from '../types/normalizedInboundEvent.js';
import { AssignmentRuleEngineService } from './assignmentRuleEngineService.js';

type IntegrationAccount = {
  id: string;
  workspace_id: string | null;
  channel: ChannelType;
  display_name: string;
  external_account_id: string | null;
  external_phone_number_id: string | null;
  status: string;
};

type ConversationRow = {
  id: string;
  lead_id: string | null;
  unread_count: number | null;
  assigned_to: string | null;
};

type FindOrCreateConversationResult = {
  row: ConversationRow;
  isNew: boolean;
};

export class ConversationIngestionService {
  private readonly autoCreateLead = process.env.AUTO_CREATE_LEAD_FROM_INBOUND === 'true';
  private readonly assignmentEngine = new AssignmentRuleEngineService();

  async ingestInboundEvent(event: NormalizedInboundEvent): Promise<void> {
    const duplicate = await this.findMessageByExternalId(event.externalMessageId);
    if (duplicate) {
      logger.info('Duplicate inbound event skipped', {
        channel: event.channel,
        external_message_id: event.externalMessageId,
      });
      return;
    }

    const integrationAccount = await this.findIntegrationAccount(event);
    if (!integrationAccount) {
      logger.warn('Inbound event skipped: integration account not mapped', {
        channel: event.channel,
        external_account_id: event.externalAccountId,
        external_message_id: event.externalMessageId,
      });
      return;
    }

    const workspaceId = integrationAccount.workspace_id;
    if (!workspaceId) {
      logger.warn('Inbound event skipped: integration workspace missing', {
        integration_account_id: integrationAccount.id,
      });
      return;
    }

    const conversationResult = await this.findOrCreateConversation(
      event,
      integrationAccount.id,
      workspaceId,
    );
    const conversation = conversationResult.row;
    const leadId = await this.findOrCreateLead(event, conversation);

    await this.insertInboundMessage(event, conversation.id);
    await this.updateConversationLastMessage(conversation.id, event.messageText, event.sentAt);
    if (!conversationResult.isNew) {
      await this.incrementUnreadCount(conversation.id, conversation.unread_count ?? 0);
    }
    await this.createInboundMessageActivity(event, conversation.id, leadId, integrationAccount.id);
    if (conversation.assigned_to == null) {
      await this.assignmentEngine.assignForInboundConversation(
        {
          workspaceId,
          conversationId: conversation.id,
          leadId,
          event,
        },
      );
    }
  }

  async findIntegrationAccount(event: NormalizedInboundEvent): Promise<IntegrationAccount | null> {
    let query = supabase
      .from('integration_accounts')
      .select('id, workspace_id, channel, display_name, external_account_id, external_phone_number_id, status')
      .eq('channel', event.channel)
      .in('status', ['connected', 'pending'])
      .limit(1);

    if (event.externalAccountId) {
      query = query.or(
        `external_account_id.eq.${event.externalAccountId},external_phone_number_id.eq.${event.externalAccountId}`,
      );
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.error('Integration lookup failed', {
        channel: event.channel,
        error: error.message,
      });
      return null;
    }
    return data as IntegrationAccount | null;
  }

  async findOrCreateConversation(
    event: NormalizedInboundEvent,
    integrationAccountId: string,
    workspaceId: string,
  ): Promise<FindOrCreateConversationResult> {
    const existing = await this.findConversation(event, integrationAccountId);
    if (existing) {
      return { row: existing, isNew: false };
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        channel: event.channel,
        workspace_id: workspaceId,
        integration_account_id: integrationAccountId,
        external_conversation_id: event.externalConversationId ?? event.customerExternalId,
        external_user_id: event.customerExternalId,
        customer_name: event.customerName,
        customer_handle: event.customerHandle,
        customer_phone: event.customerPhone,
        status: 'open',
        priority: 'cold',
        unread_count: 1,
        last_message_preview: event.messageText,
        last_message_at: event.sentAt,
      })
      .select('id, lead_id, unread_count, assigned_to')
      .single();

    if (error || !data) {
      throw new Error(`Conversation create failed: ${error?.message ?? 'unknown error'}`);
    }

    await this.createConversationCreatedActivity(data.id);
    return { row: data as ConversationRow, isNew: true };
  }

  async insertInboundMessage(event: NormalizedInboundEvent, conversationId: string): Promise<void> {
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      direction: 'inbound',
      body: event.messageText,
      message_type: event.messageType,
      channel: event.channel,
      status: 'received',
      sent_at: event.sentAt,
      sender_name: event.customerName ?? event.customerHandle ?? event.customerPhone ?? 'Customer',
      external_message_id: event.externalMessageId,
      raw_payload: event.rawPayload,
      metadata: {
        ...event.metadata,
        attachments: event.attachments,
        customer_external_id: event.customerExternalId,
      },
    });
    if (error) {
      throw new Error(`Message insert failed: ${error.message}`);
    }
  }

  async updateConversationLastMessage(
    conversationId: string,
    messageText: string,
    sentAt: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({
        last_message_preview: messageText,
        last_message_at: sentAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
    if (error) {
      throw new Error(`Conversation summary update failed: ${error.message}`);
    }
  }

  async incrementUnreadCount(conversationId: string, currentUnread: number): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: currentUnread + 1 })
      .eq('id', conversationId);
    if (error) {
      throw new Error(`Unread increment failed: ${error.message}`);
    }
  }

  async createInboundMessageActivity(
    event: NormalizedInboundEvent,
    conversationId: string,
    leadId: string | null,
    integrationAccountId: string,
  ): Promise<void> {
    const { error } = await supabase.from('activities').insert({
      lead_id: leadId,
      conversation_id: conversationId,
      type: 'inbound_message_received',
      description: `Incoming ${event.channel} message received`,
      metadata: {
        channel: event.channel,
        external_message_id: event.externalMessageId,
        integration_account_id: integrationAccountId,
        preview: event.messageText.substring(0, 160),
      },
    });
    if (error) {
      throw new Error(`Activity insert failed: ${error.message}`);
    }
  }

  private async findMessageByExternalId(externalMessageId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('external_message_id', externalMessageId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('Idempotency lookup failed; continuing to insert path', {
        error: error.message,
        external_message_id: externalMessageId,
      });
      return null;
    }
    return (data as { id: string } | null) ?? null;
  }

  private async findConversation(
    event: NormalizedInboundEvent,
    integrationAccountId: string,
  ): Promise<ConversationRow | null> {
    let query = supabase
      .from('conversations')
      .select('id, lead_id, unread_count, assigned_to')
      .eq('integration_account_id', integrationAccountId)
      .limit(1);

    if (event.channel === 'whatsapp') {
      if (event.customerPhone) {
        query = query.eq('customer_phone', event.customerPhone);
      } else if (event.customerExternalId) {
        query = query.eq('external_user_id', event.customerExternalId);
      }
    } else if (event.customerExternalId) {
      query = query.eq('external_user_id', event.customerExternalId);
    } else if (event.externalConversationId) {
      query = query.eq('external_conversation_id', event.externalConversationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.error('Conversation lookup failed', {
        channel: event.channel,
        error: error.message,
      });
      return null;
    }
    return data as ConversationRow | null;
  }

  private async findOrCreateLead(
    event: NormalizedInboundEvent,
    conversation: ConversationRow,
  ): Promise<string | null> {
    if (conversation.lead_id) return conversation.lead_id;
    if (!this.autoCreateLead) return null;

    const { data, error } = await supabase
      .from('leads')
      .insert({
        workspace_id: await this.readConversationWorkspaceId(conversation.id),
        name: event.customerName ?? event.customerHandle ?? event.customerPhone ?? 'Unknown',
        phone: event.customerPhone,
        source_channel: event.channel,
        status: 'new',
        priority: 'cold',
        notes: `Auto-created from inbound ${event.channel} message.`,
        conversation_id: conversation.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      logger.error('Auto lead create failed', { error: error?.message });
      return null;
    }

    const leadId = (data as { id: string }).id;
    await supabase.from('conversations').update({ lead_id: leadId }).eq('id', conversation.id);
    await supabase.from('activities').insert({
      lead_id: leadId,
      conversation_id: conversation.id,
      type: 'lead_created_from_conversation',
      description: `Lead auto-created from ${event.channel} conversation`,
      metadata: {
        channel: event.channel,
        external_message_id: event.externalMessageId,
      },
    });
    return leadId;
  }

  private async readConversationWorkspaceId(conversationId: string): Promise<string | null> {
    const { data } = await supabase
      .from('conversations')
      .select('workspace_id')
      .eq('id', conversationId)
      .maybeSingle();
    return (data as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  }

  private async createConversationCreatedActivity(conversationId: string): Promise<void> {
    const { error } = await supabase.from('activities').insert({
      conversation_id: conversationId,
      type: 'conversation_created',
      description: 'Conversation created from inbound channel event',
      metadata: {},
    });
    if (error) {
      logger.warn('conversation_created activity insert failed', { error: error.message });
    }
  }
}
