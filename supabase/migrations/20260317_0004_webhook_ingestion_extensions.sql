-- Webhook ingestion support fields for external channel mapping and idempotency.
-- Safe to apply on existing environments using IF NOT EXISTS guards.

alter table if exists public.integration_accounts
  add column if not exists external_phone_number_id text;

alter table if exists public.conversations
  add column if not exists integration_account_id uuid references public.integration_accounts(id) on delete set null;

alter table if exists public.conversations
  add column if not exists external_conversation_id text;

alter table if exists public.conversations
  add column if not exists external_user_id text;

alter table if exists public.messages
  add column if not exists external_message_id text;

alter table if exists public.messages
  add column if not exists raw_payload jsonb default '{}'::jsonb;

alter table if exists public.messages
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_conversations_integration_account_id
  on public.conversations(integration_account_id);

create index if not exists idx_conversations_external_user_id
  on public.conversations(external_user_id);

create index if not exists idx_conversations_external_conversation_id
  on public.conversations(external_conversation_id);

create index if not exists idx_integration_accounts_external_phone_number_id
  on public.integration_accounts(external_phone_number_id);

create unique index if not exists uq_messages_external_message_id
  on public.messages(external_message_id)
  where external_message_id is not null;

create unique index if not exists uq_integration_accounts_channel_external_account
  on public.integration_accounts(channel, external_account_id)
  where external_account_id is not null;
