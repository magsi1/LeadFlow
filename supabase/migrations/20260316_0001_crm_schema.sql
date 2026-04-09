-- LeadFlow CRM MVP - Supabase schema foundation
-- Includes schema, FK constraints, update triggers and auth profile bootstrap.

create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'sales' check (role in ('admin', 'manager', 'sales')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salespeople (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete set null,
  name text not null,
  phone text,
  city text,
  source_channel text not null default 'other' check (source_channel in ('whatsapp', 'instagram', 'facebook', 'manual', 'other')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost')),
  priority text not null default 'warm' check (priority in ('cold', 'warm', 'hot')),
  assigned_to uuid null references public.profiles(id) on delete set null,
  notes text,
  conversation_id uuid null,
  next_follow_up_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'instagram', 'facebook', 'manual')),
  customer_name text,
  customer_handle text,
  customer_phone text,
  city text,
  assigned_to uuid null references public.profiles(id) on delete set null,
  lead_id uuid null references public.leads(id) on delete set null,
  priority text not null default 'warm' check (priority in ('cold', 'warm', 'hot')),
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_conversation_id_fkey'
  ) then
    alter table public.leads
      add constraint leads_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_owner_id_fkey'
  ) then
    alter table public.workspaces
      add constraint workspaces_owner_id_fkey
      foreign key (owner_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  sender_name text,
  sender_profile_id uuid null references public.profiles(id) on delete set null,
  message_type text not null default 'text',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid null references public.profiles(id) on delete set null,
  due_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'missed', 'cancelled')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete cascade,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'instagram', 'facebook')),
  display_name text not null,
  external_account_id text,
  status text not null default 'pending' check (status in ('connected', 'disconnected', 'error', 'pending')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_assigned_to on public.leads(assigned_to);
create index if not exists idx_leads_next_follow_up_at on public.leads(next_follow_up_at);
create index if not exists idx_conversations_channel on public.conversations(channel);
create index if not exists idx_conversations_assigned_to on public.conversations(assigned_to);
create index if not exists idx_conversations_last_message_at_desc on public.conversations(last_message_at desc);
create index if not exists idx_messages_conversation_id_sent_at on public.messages(conversation_id, sent_at);
create index if not exists idx_follow_ups_assigned_to_due_at on public.follow_ups(assigned_to, due_at);
create index if not exists idx_activities_lead_id_created_at on public.activities(lead_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_salespeople_updated_at on public.salespeople;
create trigger trg_salespeople_updated_at
before update on public.salespeople
for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_follow_ups_updated_at on public.follow_ups;
create trigger trg_follow_ups_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_accounts_updated_at on public.integration_accounts;
create trigger trg_integration_accounts_updated_at
before update on public.integration_accounts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    case
      when (new.raw_user_meta_data ->> 'role') in ('admin', 'manager', 'sales')
        then new.raw_user_meta_data ->> 'role'
      else 'sales'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
