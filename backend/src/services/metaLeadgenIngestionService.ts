import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabaseAdmin.js';

type MetaLeadField = {
  name?: string;
  values?: Array<string | number | null> | null;
};

type MetaLeadResponse = {
  id?: string;
  field_data?: MetaLeadField[];
  created_time?: string;
};

function firstValue(field?: MetaLeadField): string {
  const raw = field?.values?.[0];
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function normalizeSource(rawSource: string | undefined): 'facebook' | 'instagram' {
  const source = (rawSource ?? '').toLowerCase();
  return source === 'instagram' ? 'instagram' : 'facebook';
}

/** Standard Lead Ads field names we treat as identity (excluded from free-text message). */
const IDENTITY_FIELD_KEYS = new Set([
  'full_name',
  'first_name',
  'last_name',
  'email',
  'email_address',
  'phone_number',
  'phone',
  'mobile',
  'zip_code',
  'postal_code',
  'country',
  'city',
  'state',
  'street_address',
]);

/** Prefer these as the primary "message" / inquiry body when present. */
const MESSAGE_FIELD_KEYS = [
  'message',
  'your_message',
  'comments',
  'questions',
  'question',
  'details',
  'description',
  'notes',
];

function buildInquiryMessage(
  fields: MetaLeadField[],
  fieldMap: Map<string, MetaLeadField>,
): string {
  for (const key of MESSAGE_FIELD_KEYS) {
    const v = firstValue(fieldMap.get(key));
    if (v.length > 0) return v;
  }

  const lines: string[] = [];
  for (const field of fields) {
    const key = (field.name ?? '').trim().toLowerCase();
    if (!key || IDENTITY_FIELD_KEYS.has(key)) continue;
    const v = firstValue(field);
    if (v.length === 0) continue;
    const label = (field.name ?? key).trim();
    lines.push(`${label}: ${v}`);
  }

  return lines.join('\n').trim();
}

export class MetaLeadgenIngestionService {
  async ingestLeadgen(params: {
    leadgenId: string;
    source?: string;
  }): Promise<void> {
    if (!params.leadgenId) return;
    if (!env.metaLeadAccessToken) {
      logger.warn('Meta lead token missing; skipping lead ingestion', {
        leadgen_id: params.leadgenId,
      });
      return;
    }

    const ownerId = env.metaLeadDefaultUserId.trim();
    if (!ownerId) {
      logger.error('META_LEAD_DEFAULT_USER_ID is required to store Meta Lead Ads in Supabase', {
        leadgen_id: params.leadgenId,
      });
      return;
    }

    const source = normalizeSource(params.source);
    const lead = await this.fetchLeadFromGraph(params.leadgenId);
    const extracted = this.extractLeadFields(lead);

    const name = extracted.name.length > 0 ? extracted.name : 'Meta Lead';
    const phone = extracted.phone;
    const message =
      extracted.message.length > 0
        ? extracted.message
        : `Lead from ${source} Lead Ads (no form message)`;

    const row = {
      name,
      email: extracted.email.length > 0 ? extracted.email : null,
      phone: phone.length > 0 ? phone : '',
      message,
      status: 'warm',
      stage: 'new',
      priority: 'new',
      score: 50,
      source,
      external_lead_id: params.leadgenId,
      notes: `Imported from ${source} Lead Ads`,
      created_at: lead.created_time ?? new Date().toISOString(),
      user_id: ownerId,
      assigned_to: ownerId,
    };

    const { error } = await supabase.from('leads').upsert(row, {
      onConflict: 'external_lead_id',
      ignoreDuplicates: false,
    });

    if (error) {
      logger.error('Failed to upsert Meta lead into Supabase', {
        leadgen_id: params.leadgenId,
        source,
        error: error.message,
      });
      return;
    }

    logger.info('Meta lead ingested', {
      leadgen_id: params.leadgenId,
      source,
      has_phone: phone.length > 0,
      has_email: extracted.email.length > 0,
      message_len: message.length,
    });
  }

  private async fetchLeadFromGraph(leadgenId: string): Promise<MetaLeadResponse> {
    const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(leadgenId)}`);
    url.searchParams.set('access_token', env.metaLeadAccessToken!);
    url.searchParams.set('fields', 'id,created_time,field_data');

    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta Graph fetch failed (${response.status}): ${body}`);
    }

    return (await response.json()) as MetaLeadResponse;
  }

  private extractLeadFields(lead: MetaLeadResponse): {
    name: string;
    email: string;
    phone: string;
    message: string;
  } {
    const fields = lead.field_data ?? [];
    const map = new Map<string, MetaLeadField>();
    for (const field of fields) {
      const key = (field.name ?? '').trim().toLowerCase();
      if (key) map.set(key, field);
    }

    const fullName = firstValue(map.get('full_name'));
    const firstName = firstValue(map.get('first_name'));
    const lastName = firstValue(map.get('last_name'));
    const name = fullName || `${firstName} ${lastName}`.trim();

    const email =
      firstValue(map.get('email')) || firstValue(map.get('email_address'));
    const phone =
      firstValue(map.get('phone_number')) ||
      firstValue(map.get('phone')) ||
      firstValue(map.get('mobile'));

    const message = buildInquiryMessage(fields, map);

    return { name, email, phone, message };
  }
}
