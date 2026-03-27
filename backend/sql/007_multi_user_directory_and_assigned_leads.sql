-- Multi-user directory (public.users) + lead assignment (leads.assigned_to).
-- Run in Supabase SQL Editor after review. Adjust policy names if you already customized RLS.

create extension if not exists "uuid-ossp";

-- 1) Directory: one row per auth user (id mirrors auth.users.id)
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users (lower(email));

alter table public.users enable row level security;

drop policy if exists "Users can read directory" on public.users;
create policy "Users can read directory"
  on public.users
  for select
  to authenticated
  using (true);

drop policy if exists "Users can upsert self" on public.users;
create policy "Users can upsert self"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update self row" on public.users;
create policy "Users can update self row"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2) Leads: assignee (nullable until backfill — app sets on create)
alter table public.leads
  add column if not exists assigned_to uuid references public.users (id) on delete set null;

create index if not exists idx_leads_assigned_to on public.leads (assigned_to);

-- 3) Sync new auth users into public.users (optional; client also upserts on login)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- 4) Replace leads policies for assignee-based visibility + creator ownership
drop policy if exists "Users can view own leads" on public.leads;
drop policy if exists "Users can insert own leads" on public.leads;
drop policy if exists "Users can delete own leads" on public.leads;
drop policy if exists "Users can update own leads" on public.leads;

-- SELECT: only leads assigned to the current user (requirement)
create policy "Leads select for assignee"
  on public.leads
  for select
  to authenticated
  using (assigned_to = auth.uid());

-- INSERT: creator must be current user; assignee must be set (typically another users.id or self)
create policy "Leads insert for owner"
  on public.leads
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and assigned_to is not null
  );

-- UPDATE: creator or assignee can update (e.g. drag status)
create policy "Leads update for owner or assignee"
  on public.leads
  for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = assigned_to)
  with check (auth.uid() = user_id or auth.uid() = assigned_to);

-- DELETE: creator only
create policy "Leads delete for owner"
  on public.leads
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Backfill: existing leads become assigned to the owner so RLS still returns them
update public.leads set assigned_to = user_id where assigned_to is null;

comment on table public.users is 'App directory keyed by auth.users.id; synced on signup and login upsert.';
