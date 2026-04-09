-- Repair migration for environments where workspace tables were not created yet.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text default 'sales',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Workspace',
  slug text,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  plan text not null default 'starter',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_workspaces_slug on public.workspaces(slug) where slug is not null;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  display_name text,
  assignment_capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.workspace_members
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.workspace_members
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
alter table if exists public.workspace_members
  add column if not exists role text not null default 'owner';
alter table if exists public.workspace_members
  add column if not exists status text not null default 'active';
alter table if exists public.workspace_members
  add column if not exists display_name text;
alter table if exists public.workspace_members
  add column if not exists assignment_capacity integer;
alter table if exists public.workspace_members
  add column if not exists updated_at timestamptz not null default now();

update public.workspace_members
set profile_id = user_id
where profile_id is null and user_id is not null;

update public.workspace_members
set user_id = profile_id
where user_id is null and profile_id is not null;

create unique index if not exists uq_workspace_members_workspace_profile
  on public.workspace_members(workspace_id, profile_id)
  where profile_id is not null;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  name text,
  email text,
  phone text,
  city text,
  source_channel text default 'manual',
  status text default 'new',
  priority text default 'warm',
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  conversation_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table if exists public.leads
  add column if not exists email text;
alter table if exists public.leads
  add column if not exists phone text;
alter table if exists public.leads
  add column if not exists city text;
alter table if exists public.leads
  add column if not exists source_channel text default 'manual';
alter table if exists public.leads
  add column if not exists status text default 'new';
alter table if exists public.leads
  add column if not exists priority text default 'warm';
alter table if exists public.leads
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table if exists public.leads
  add column if not exists notes text;
alter table if exists public.leads
  add column if not exists conversation_id uuid;
alter table if exists public.leads
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table if exists public.leads
  add column if not exists next_follow_up_at timestamptz;
alter table if exists public.leads
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  lead_id uuid,
  type text,
  note text,
  description text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.activities
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table if exists public.activities
  add column if not exists lead_id uuid;
alter table if exists public.activities
  add column if not exists type text;
alter table if exists public.activities
  add column if not exists note text;
alter table if exists public.activities
  add column if not exists description text;
alter table if exists public.activities
  add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null;
alter table if exists public.activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.activities
set description = coalesce(description, note, '')
where description is null;
