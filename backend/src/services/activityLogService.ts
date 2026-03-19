import { supabase } from '../lib/supabaseAdmin.js';
import { logger } from '../lib/logger.js';

type ActivityInput = {
  type: string;
  description: string;
  leadId?: string | null;
  conversationId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
};

export class ActivityLogService {
  async create(input: ActivityInput): Promise<void> {
    const { error } = await supabase.from('activities').insert({
      type: input.type,
      description: input.description,
      workspace_id: input.workspaceId ?? null,
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      logger.warn('Activity log insert failed', {
        type: input.type,
        error: error.message,
      });
    }
  }
}
