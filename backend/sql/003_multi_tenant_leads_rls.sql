create extension if not exists "uuid-ossp";

create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  phone text,
  status text default 'new',
  created_at timestamp default now()
);

alter table public.leads
  add column if not exists status text default 'new';

update public.leads
set status = case
  when lower(coalesce(status, '')) in ('new', 'contacted', 'closed') then lower(status)
  else 'new'
end;

alter table public.leads
  alter column status set default 'new';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_check'
  ) then
    alter table public.leads
      add constraint leads_status_check
      check (status in ('new', 'contacted', 'closed'));
  end if;
end $$;

alter table public.leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
      and policyname = 'Users can view own leads'
  ) then
    create policy "Users can view own leads"
      on public.leads
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
      and policyname = 'Users can insert own leads'
  ) then
    create policy "Users can insert own leads"
      on public.leads
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
      and policyname = 'Users can delete own leads'
  ) then
    create policy "Users can delete own leads"
      on public.leads
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

