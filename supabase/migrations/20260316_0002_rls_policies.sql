-- LeadFlow CRM MVP - Row Level Security (MVP-open)
-- NOTE: These policies are intentionally permissive for authenticated users.
-- Tighten to workspace-scoped policies before full production rollout.

alter table public.profiles enable row level security;
alter table public.salespeople enable row level security;
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.follow_ups enable row level security;
alter table public.activities enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.workspaces enable row level security;

-- Profiles: users can read/update only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own_non_role" on public.profiles;
create policy "profiles_update_own_non_role"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select p.role from public.profiles p where p.id = auth.uid())
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- MVP-open read/write policies across CRM data for authenticated users.
-- Harden later by workspace_id / team-membership checks.
drop policy if exists "salespeople_select_authenticated" on public.salespeople;
create policy "salespeople_select_authenticated"
on public.salespeople
for select
to authenticated
using (true);

drop policy if exists "salespeople_insert_authenticated" on public.salespeople;
create policy "salespeople_insert_authenticated"
on public.salespeople
for insert
to authenticated
with check (true);

drop policy if exists "salespeople_update_authenticated" on public.salespeople;
create policy "salespeople_update_authenticated"
on public.salespeople
for update
to authenticated
using (true)
with check (true);

drop policy if exists "leads_select_authenticated" on public.leads;
create policy "leads_select_authenticated"
on public.leads
for select
to authenticated
using (true);

drop policy if exists "leads_insert_authenticated" on public.leads;
create policy "leads_insert_authenticated"
on public.leads
for insert
to authenticated
with check (true);

drop policy if exists "leads_update_authenticated" on public.leads;
create policy "leads_update_authenticated"
on public.leads
for update
to authenticated
using (true)
with check (true);

drop policy if exists "conversations_select_authenticated" on public.conversations;
create policy "conversations_select_authenticated"
on public.conversations
for select
to authenticated
using (true);

drop policy if exists "conversations_insert_authenticated" on public.conversations;
create policy "conversations_insert_authenticated"
on public.conversations
for insert
to authenticated
with check (true);

drop policy if exists "conversations_update_authenticated" on public.conversations;
create policy "conversations_update_authenticated"
on public.conversations
for update
to authenticated
using (true)
with check (true);

drop policy if exists "messages_select_authenticated" on public.messages;
create policy "messages_select_authenticated"
on public.messages
for select
to authenticated
using (true);

drop policy if exists "messages_insert_authenticated" on public.messages;
create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (true);

drop policy if exists "messages_update_authenticated" on public.messages;
create policy "messages_update_authenticated"
on public.messages
for update
to authenticated
using (true)
with check (true);

drop policy if exists "follow_ups_select_authenticated" on public.follow_ups;
create policy "follow_ups_select_authenticated"
on public.follow_ups
for select
to authenticated
using (true);

drop policy if exists "follow_ups_insert_authenticated" on public.follow_ups;
create policy "follow_ups_insert_authenticated"
on public.follow_ups
for insert
to authenticated
with check (true);

drop policy if exists "follow_ups_update_authenticated" on public.follow_ups;
create policy "follow_ups_update_authenticated"
on public.follow_ups
for update
to authenticated
using (true)
with check (true);

drop policy if exists "activities_select_authenticated" on public.activities;
create policy "activities_select_authenticated"
on public.activities
for select
to authenticated
using (true);

drop policy if exists "activities_insert_authenticated" on public.activities;
create policy "activities_insert_authenticated"
on public.activities
for insert
to authenticated
with check (true);

drop policy if exists "activities_update_authenticated" on public.activities;
create policy "activities_update_authenticated"
on public.activities
for update
to authenticated
using (true)
with check (true);

drop policy if exists "integration_accounts_select_authenticated" on public.integration_accounts;
create policy "integration_accounts_select_authenticated"
on public.integration_accounts
for select
to authenticated
using (true);

drop policy if exists "integration_accounts_insert_authenticated" on public.integration_accounts;
create policy "integration_accounts_insert_authenticated"
on public.integration_accounts
for insert
to authenticated
with check (true);

drop policy if exists "integration_accounts_update_authenticated" on public.integration_accounts;
create policy "integration_accounts_update_authenticated"
on public.integration_accounts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "workspaces_select_authenticated" on public.workspaces;
create policy "workspaces_select_authenticated"
on public.workspaces
for select
to authenticated
using (true);

drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
on public.workspaces
for insert
to authenticated
with check (true);

drop policy if exists "workspaces_update_authenticated" on public.workspaces;
create policy "workspaces_update_authenticated"
on public.workspaces
for update
to authenticated
using (true)
with check (true);

-- Explicitly avoid broad delete policies in MVP-open mode.
-- Add workspace/admin-gated delete policies deliberately in hardening phase.
