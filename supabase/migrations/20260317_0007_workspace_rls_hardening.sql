-- Workspace-scoped RLS hardening.
-- This replaces MVP-open policies with membership and role-aware checks.
-- NOTE: Policies are production-oriented for SMB usage and can be tightened further
-- for enterprise-grade segregation (department, territory, custom ACLs).

alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.assignment_rules enable row level security;

create or replace function public.current_workspace_role(ws_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = ws_id
    and wm.profile_id = auth.uid()
    and wm.status = 'active'
  limit 1
$$;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.profile_id = auth.uid()
      and wm.status = 'active'
  )
$$;

create or replace function public.is_workspace_admin_like(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role(ws_id) in ('owner', 'admin', 'manager')
$$;

create or replace function public.is_workspace_owner_or_admin(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role(ws_id) in ('owner', 'admin')
$$;

-- Workspaces
drop policy if exists "workspaces_select_authenticated" on public.workspaces;
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
drop policy if exists "workspaces_update_authenticated" on public.workspaces;

create policy "workspaces_select_member"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

create policy "workspaces_insert_owner"
on public.workspaces
for insert
to authenticated
with check (owner_profile_id = auth.uid());

create policy "workspaces_update_owner_admin"
on public.workspaces
for update
to authenticated
using (public.is_workspace_owner_or_admin(id))
with check (public.is_workspace_owner_or_admin(id));

-- Workspace members
create policy "workspace_members_select_member"
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_insert_owner_admin"
on public.workspace_members
for insert
to authenticated
with check (public.is_workspace_owner_or_admin(workspace_id));

create policy "workspace_members_update_owner_admin"
on public.workspace_members
for update
to authenticated
using (public.is_workspace_owner_or_admin(workspace_id))
with check (public.is_workspace_owner_or_admin(workspace_id));

-- Workspace invitations
create policy "workspace_invitations_select_owner_admin"
on public.workspace_invitations
for select
to authenticated
using (public.is_workspace_owner_or_admin(workspace_id));

create policy "workspace_invitations_insert_owner_admin"
on public.workspace_invitations
for insert
to authenticated
with check (public.is_workspace_owner_or_admin(workspace_id));

create policy "workspace_invitations_update_owner_admin"
on public.workspace_invitations
for update
to authenticated
using (public.is_workspace_owner_or_admin(workspace_id))
with check (public.is_workspace_owner_or_admin(workspace_id));

-- Assignment rules
create policy "assignment_rules_select_member"
on public.assignment_rules
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "assignment_rules_insert_admin_like"
on public.assignment_rules
for insert
to authenticated
with check (public.is_workspace_admin_like(workspace_id));

create policy "assignment_rules_update_admin_like"
on public.assignment_rules
for update
to authenticated
using (public.is_workspace_admin_like(workspace_id))
with check (public.is_workspace_admin_like(workspace_id));

-- Integration accounts (admin only writes)
drop policy if exists "integration_accounts_select_authenticated" on public.integration_accounts;
drop policy if exists "integration_accounts_insert_authenticated" on public.integration_accounts;
drop policy if exists "integration_accounts_update_authenticated" on public.integration_accounts;

create policy "integration_accounts_select_member"
on public.integration_accounts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "integration_accounts_insert_owner_admin"
on public.integration_accounts
for insert
to authenticated
with check (public.is_workspace_owner_or_admin(workspace_id));

create policy "integration_accounts_update_owner_admin"
on public.integration_accounts
for update
to authenticated
using (public.is_workspace_owner_or_admin(workspace_id))
with check (public.is_workspace_owner_or_admin(workspace_id));

-- Leads
drop policy if exists "leads_select_authenticated" on public.leads;
drop policy if exists "leads_insert_authenticated" on public.leads;
drop policy if exists "leads_update_authenticated" on public.leads;

create policy "leads_select_workspace"
on public.leads
for select
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or created_by = auth.uid()
    or assigned_to is null
  )
);

create policy "leads_insert_workspace"
on public.leads
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or coalesce(created_by, auth.uid()) = auth.uid()
  )
);

create policy "leads_update_workspace"
on public.leads
for update
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  )
)
with check (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  )
);

-- Conversations
drop policy if exists "conversations_select_authenticated" on public.conversations;
drop policy if exists "conversations_insert_authenticated" on public.conversations;
drop policy if exists "conversations_update_authenticated" on public.conversations;

create policy "conversations_select_workspace"
on public.conversations
for select
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
);

create policy "conversations_insert_workspace"
on public.conversations
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id)
);

create policy "conversations_update_workspace"
on public.conversations
for update
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
)
with check (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
);

-- Messages scoped through conversation workspace membership.
drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_insert_authenticated" on public.messages;
drop policy if exists "messages_update_authenticated" on public.messages;

create policy "messages_select_workspace"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.is_workspace_member(c.workspace_id)
      and (
        public.is_workspace_admin_like(c.workspace_id)
        or c.assigned_to = auth.uid()
        or c.assigned_to is null
      )
  )
);

create policy "messages_insert_workspace"
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.is_workspace_member(c.workspace_id)
  )
);

create policy "messages_update_workspace"
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.is_workspace_member(c.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.is_workspace_member(c.workspace_id)
  )
);

-- Follow-ups
drop policy if exists "follow_ups_select_authenticated" on public.follow_ups;
drop policy if exists "follow_ups_insert_authenticated" on public.follow_ups;
drop policy if exists "follow_ups_update_authenticated" on public.follow_ups;

create policy "follow_ups_select_workspace"
on public.follow_ups
for select
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
);

create policy "follow_ups_insert_workspace"
on public.follow_ups
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "follow_ups_update_workspace"
on public.follow_ups
for update
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
)
with check (
  public.is_workspace_member(workspace_id)
  and (
    public.is_workspace_admin_like(workspace_id)
    or assigned_to = auth.uid()
    or assigned_to is null
  )
);

-- Activities
drop policy if exists "activities_select_authenticated" on public.activities;
drop policy if exists "activities_insert_authenticated" on public.activities;
drop policy if exists "activities_update_authenticated" on public.activities;

create policy "activities_select_workspace"
on public.activities
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "activities_insert_workspace"
on public.activities
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "activities_update_workspace_admin_like"
on public.activities
for update
to authenticated
using (public.is_workspace_admin_like(workspace_id))
with check (public.is_workspace_admin_like(workspace_id));

-- Existing profiles policy remains self-scoped.
-- Existing salespeople policy is intentionally left permissive for compatibility.
