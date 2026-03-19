create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  plan text not null default 'basic' check (plan in ('basic', 'pro', 'agency')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional starter records for testing:
-- insert into public.users (email, plan, is_active) values ('owner@leadflow.com', 'pro', true)
-- on conflict (email) do update set plan = excluded.plan, is_active = excluded.is_active;
