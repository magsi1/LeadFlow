import { supabase } from '../lib/supabaseAdmin.js';

export type IntegrationAccountUpsertInput = {
  id?: string;
  channel: 'whatsapp' | 'instagram' | 'facebook';
  displayName: string;
  externalAccountId?: string;
  externalPhoneNumberId?: string;
  status?: 'connected' | 'disconnected' | 'error' | 'pending';
  config?: Record<string, unknown>;
};

export class IntegrationAccountService {
  async list(workspaceId: string) {
    const { data, error } = await supabase
      .from('integration_accounts')
      .select(
        'id, workspace_id, channel, display_name, external_account_id, external_phone_number_id, status, config, created_at, updated_at',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`List integration accounts failed: ${error.message}`);
    return data ?? [];
  }

  async upsert(workspaceId: string, input: IntegrationAccountUpsertInput) {
    const payload = {
      id: input.id,
      workspace_id: workspaceId,
      channel: input.channel,
      display_name: input.displayName,
      external_account_id: input.externalAccountId ?? null,
      external_phone_number_id: input.externalPhoneNumberId ?? null,
      status: input.status ?? 'connected',
      config: input.config ?? {},
    };
    const query = input.id
      ? supabase.from('integration_accounts').upsert(payload, { onConflict: 'id' })
      : supabase.from('integration_accounts').insert(payload);

    const { data, error } = await query
      .select(
        'id, workspace_id, channel, display_name, external_account_id, external_phone_number_id, status, config, created_at, updated_at',
      )
      .single();

    if (error) throw new Error(`Upsert integration account failed: ${error.message}`);
    return data;
  }
}
