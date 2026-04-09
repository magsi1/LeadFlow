-- Workspace/team foundation for multi-user CRM.
-- Migration is additive and keeps current MVP operational.

alter table if exists public.workspaces
  add column if not exists slug text;

alter table if exists public.workspaces
  add column if not exists owner_profile_id uuid references public.profiles(id) on delete set null;

alter table if exists public.workspaces
  add column if not exists plan text not null default 'starter';

alter table if exists public.workspaces
  add column if not exists is_active boolean not null default true;

alter table if exists public.workspaces
  add column if not exists updated_at timestamptz not null default now();

-- Backward compatibility with older owner_id column.
update public.workspaces
set owner_profile_id = owner_id
where owner_profile_id is null and owner_id is not null;

-- Slug backfill from workspace name.
update public.workspaces
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

create unique index if not exists uq_workspaces_slug on public.workspaces(slug);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'sales')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  display_name text,
  assignment_capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, profile_id)
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'sales')),
  invited_by uuid references public.profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  rule_type text not null check (rule_type in ('round_robin', 'least_busy', 'manual_default', 'channel_based', 'city_based')),
  conditions jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  fallback_member_id uuid null references public.workspace_members(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_workspace_role
  on public.workspace_members(workspace_id, role);
create index if not exists idx_workspace_members_profile
  on public.workspace_members(profile_id);
create index if not exists idx_workspace_invitations_workspace_status
  on public.workspace_invitations(workspace_id, status);
create index if not exists idx_assignment_rules_workspace_active
  on public.assignment_rules(workspace_id, is_active);

-- Optional workspace ownership on follow-ups and activities for direct policy checks.
alter table if exists public.follow_ups
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.activities
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Ensure workspace-owned operational data has workspace id.
do $$
declare
  v_default_workspace uuid;
begin
  select id into v_default_workspace from public.workspaces order by created_at limit 1;

  if v_default_workspace is null then
    insert into public.workspaces (name, slug, owner_profile_id, plan, is_active)
    values ('Default Workspace', 'default-workspace', null, 'starter', true)
    returning id into v_default_workspace;
  end if;

  update public.leads
  set workspace_id = v_default_workspace
  where workspace_id is null;

  update public.conversations
  set workspace_id = v_default_workspace
  where workspace_id is null;

  update public.integration_accounts
  set workspace_id = v_default_workspace
  where workspace_id is null;

  update public.follow_ups fu
  set workspace_id = l.workspace_id
  from public.leads l
  where fu.lead_id = l.id and fu.workspace_id is null;

  update public.follow_ups
  set workspace_id = v_default_workspace
  where workspace_id is null;

  update public.activities a
  set workspace_id = coalesce(l.workspace_id, v_default_workspace)
  from public.leads l
  where a.lead_id = l.id and a.workspace_id is null;

  update public.activities a
  set workspace_id = coalesce(c.workspace_id, v_default_workspace)
  from public.conversations c
  where a.conversation_id = c.id and a.workspace_id is null;

  update public.activities
  set workspace_id = v_default_workspace
  where workspace_id is null;
end $$;

-- Backfill workspace membership:
-- 1) every profile becomes active member of first workspace
-- 2) role maps from profiles.role, first admin upgraded to owner
insert into public.workspace_members (workspace_id, profile_id, role, status, display_name)
select
  w.id,
  p.id,
  case
    when p.role = 'admin' then 'admin'
    when p.role = 'manager' then 'manager'
    else 'sales'
  end,
  'active',
  p.full_name
from public.profiles p
cross join lateral (
  select id from public.workspaces order by created_at limit 1
) w
on conflict (workspace_id, profile_id) do nothing;

-- Promote workspace owner membership when owner_profile_id exists.
update public.workspace_members wm
set role = 'owner'
from public.workspaces w
where wm.workspace_id = w.id
  and wm.profile_id = w.owner_profile_id;

-- Ensure at least one owner exists per workspace (fallback to earliest admin/member).
do $$
declare
  ws record;
  fallback_profile uuid;
begin
  for ws in select id from public.workspaces loop
    if not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = ws.id and m.role = 'owner'
    ) then
      select m.profile_id into fallback_profile
      from public.workspace_members m
      where m.workspace_id = ws.id
      order by case when m.role = 'admin' then 0 else 1 end, m.created_at
      limit 1;

      if fallback_profile is not null then
        update public.workspace_members
        set role = 'owner'
        where workspace_id = ws.id and profile_id = fallback_profile;

        update public.workspaces
        set owner_profile_id = fallback_profile
        where id = ws.id and owner_profile_id is null;
      end if;
    end if;
  end loop;
end $$;

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_assignment_rules_updated_at on public.assignment_rules;
create trigger trg_assignment_rules_updated_at
before update on public.assignment_rules
for each row execute function public.set_updated_at();
