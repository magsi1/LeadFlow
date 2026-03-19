import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabaseAdmin.js';
import type { NormalizedMessageStatusEvent } from '../types/messageStatusEvent.js';
import { ActivityLogService } from './activityLogService.js';

type MessageStatusRow = {
  id: string;
  conversation_id: string;
  status: string | null;
  workspace_id?: string | null;
};

export class MessageStatusService {
  private readonly activityService = new ActivityLogService();

  async applyStatusEvent(event: NormalizedMessageStatusEvent): Promise<void> {
    const message = await this.findMessage(event.externalMessageId);
    if (!message) {
      logger.warn('Status callback ignored: message not found', {
        external_message_id: event.externalMessageId,
        status: event.status,
      });
      return;
    }

    const current = (message.status ?? 'sent').toLowerCase();
    if (current === event.status) {
      logger.debug('Duplicate status callback ignored', {
        message_id: message.id,
        status: event.status,
      });
      return;
    }

    const patch: Record<string, unknown> = {
      status: event.status,
      error_code: null,
      error_message: null,
    };
    if (event.status === 'delivered') {
      patch['delivered_at'] = event.occurredAt;
    } else if (event.status === 'read') {
      patch['read_at'] = event.occurredAt;
    } else if (event.status === 'failed') {
      patch['failed_at'] = event.occurredAt;
      patch['error_code'] = event.errorCode ?? null;
      patch['error_message'] = event.errorMessage ?? 'message_delivery_failed';
    }

    const { error } = await supabase.from('messages').update(patch).eq('id', message.id);
    if (error) {
      throw new Error(`status_update_failed:${error.message}`);
    }

    await this.activityService.create({
      type: this.activityTypeFor(event.status),
      description: this.activityDescriptionFor(event.status, event.channel),
      workspaceId: message.workspace_id ?? null,
      conversationId: message.conversation_id,
      metadata: {
        channel: event.channel,
        external_message_id: event.externalMessageId,
      },
    });
  }

  private activityTypeFor(status: NormalizedMessageStatusEvent['status']): string {
    switch (status) {
      case 'sent':
        return 'message_sent';
      case 'delivered':
        return 'message_delivered';
      case 'read':
        return 'message_read';
      case 'failed':
        return 'message_failed';
      default:
        return 'message_sent';
    }
  }

  private activityDescriptionFor(
    status: NormalizedMessageStatusEvent['status'],
    channel: string,
  ): string {
    switch (status) {
      case 'sent':
        return `Outbound ${channel} message accepted`;
      case 'delivered':
        return `Outbound ${channel} message delivered`;
      case 'read':
        return `Outbound ${channel} message read`;
      case 'failed':
        return `Outbound ${channel} message failed`;
      default:
        return `Outbound ${channel} message accepted`;
    }
  }

  private async findMessage(externalMessageId: string): Promise<MessageStatusRow | null> {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, status, conversations!inner(workspace_id)')
      .eq('external_message_id', externalMessageId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as {
      id: string;
      conversation_id: string;
      status: string | null;
      conversations?: { workspace_id?: string | null };
    };
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      status: row.status,
      workspace_id: row.conversations?.workspace_id ?? null,
    };
  }
}
