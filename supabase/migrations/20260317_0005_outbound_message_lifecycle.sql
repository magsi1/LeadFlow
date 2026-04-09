-- Outbound messaging lifecycle support for two-way channel CRM.

alter table if exists public.messages
  add column if not exists client_message_id text;

alter table if exists public.messages
  add column if not exists channel text;

alter table if exists public.messages
  add column if not exists status text;

alter table if exists public.messages
  add column if not exists error_code text;

alter table if exists public.messages
  add column if not exists error_message text;

alter table if exists public.messages
  add column if not exists delivered_at timestamptz;

alter table if exists public.messages
  add column if not exists read_at timestamptz;

alter table if exists public.messages
  add column if not exists failed_at timestamptz;

do $$
begin
  alter table public.messages
    add constraint messages_status_check
    check (status is null or status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_messages_status on public.messages(status);
create index if not exists idx_messages_channel on public.messages(channel);
create index if not exists idx_messages_conversation_status on public.messages(conversation_id, status);

create unique index if not exists uq_messages_client_message_id
  on public.messages(client_message_id)
  where client_message_id is not null;

update public.messages
set status = case
  when direction = 'inbound' then 'received'
  else 'sent'
end
where status is null;
