-- Repair migration for environments missing inbox tables/columns.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  platform text,
  channel text,
  customer_name text,
  customer_handle text,
  customer_phone text,
  city text,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text default 'warm',
  status text default 'open',
  unread_count integer not null default 0,
  last_message text,
  last_message_preview text,
  last_message_at timestamptz,
  external_conversation_id text,
  external_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.conversations
  add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table if exists public.conversations
  add column if not exists platform text;
alter table if exists public.conversations
  add column if not exists channel text;
alter table if exists public.conversations
  add column if not exists customer_name text;
alter table if exists public.conversations
  add column if not exists customer_handle text;
alter table if exists public.conversations
  add column if not exists customer_phone text;
alter table if exists public.conversations
  add column if not exists city text;
alter table if exists public.conversations
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table if exists public.conversations
  add column if not exists priority text default 'warm';
alter table if exists public.conversations
  add column if not exists status text default 'open';
alter table if exists public.conversations
  add column if not exists unread_count integer not null default 0;
alter table if exists public.conversations
  add column if not exists last_message text;
alter table if exists public.conversations
  add column if not exists last_message_preview text;
alter table if exists public.conversations
  add column if not exists last_message_at timestamptz;
alter table if exists public.conversations
  add column if not exists external_conversation_id text;
alter table if exists public.conversations
  add column if not exists external_user_id text;
alter table if exists public.conversations
  add column if not exists updated_at timestamptz not null default now();

update public.conversations
set channel = lower(platform)
where channel is null and platform is not null;

update public.conversations
set platform = lower(channel)
where platform is null and channel is not null;

update public.conversations
set last_message_preview = coalesce(last_message_preview, last_message, '')
where last_message_preview is null;

update public.conversations
set last_message = coalesce(last_message, last_message_preview, '')
where last_message is null;

create index if not exists idx_conversations_last_message_at_desc
  on public.conversations(last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  direction text default 'inbound',
  body text,
  sender_name text,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  message_type text default 'text',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.messages
  add column if not exists conversation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete cascade;
  end if;
end $$;
