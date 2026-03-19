create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists role text not null default 'agent' check (role in ('admin', 'agent')),
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.leads
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists score int not null default 0 check (score >= 0 and score <= 100),
  add column if not exists score_category text not null default 'COLD' check (score_category in ('HOT', 'WARM', 'COLD')),
  add column if not exists deal_value numeric(12, 2) not null default 0,
  add column if not exists deal_status text not null default 'open' check (deal_status in ('open', 'won', 'lost'));

create index if not exists idx_leads_assigned_to on public.leads(assigned_to);
create index if not exists idx_leads_score_category on public.leads(score_category);
create index if not exists idx_leads_deal_status on public.leads(deal_status);
create index if not exists idx_leads_created_at on public.leads(created_at desc);

alter table public.profiles enable row level security;
alter table public.leads enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists leads_select_authenticated on public.leads;
create policy leads_select_authenticated
on public.leads
for select
to authenticated
using (true);

drop policy if exists leads_insert_authenticated on public.leads;
create policy leads_insert_authenticated
on public.leads
for insert
to authenticated
with check (true);

drop policy if exists leads_update_authenticated on public.leads;
create policy leads_update_authenticated
on public.leads
for update
to authenticated
using (true)
with check (true);
