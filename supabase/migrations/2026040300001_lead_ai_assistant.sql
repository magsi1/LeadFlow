-- Per-rep AI assistant threads for leads (Urdu + English), with message history.

create table if not exists public.lead_ai_threads (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  preferred_language text not null default 'auto' check (preferred_language in ('auto', 'en', 'ur')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, user_id)
);

create table if not exists public.lead_ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lead_ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_messages_thread_created
  on public.lead_ai_messages(thread_id, created_at);

create index if not exists idx_lead_ai_threads_lead_user
  on public.lead_ai_threads(lead_id, user_id);

-- Touch parent thread when messages change
create or replace function public.touch_lead_ai_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_ai_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_lead_ai_messages_touch_thread on public.lead_ai_messages;
create trigger trg_lead_ai_messages_touch_thread
after insert on public.lead_ai_messages
for each row execute function public.touch_lead_ai_thread_updated_at();

alter table public.lead_ai_threads enable row level security;
alter table public.lead_ai_messages enable row level security;

-- Lead visibility aligned with leads_select_workspace; thread owned by current user.
create policy "lead_ai_threads_select"
on public.lead_ai_threads
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_ai_threads.lead_id
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
);

create policy "lead_ai_threads_insert"
on public.lead_ai_threads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
);

create policy "lead_ai_threads_update"
on public.lead_ai_threads
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_ai_threads.lead_id
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
)
with check (user_id = auth.uid());

create policy "lead_ai_messages_select"
on public.lead_ai_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.lead_ai_threads t
    join public.leads l on l.id = t.lead_id
    where t.id = lead_ai_messages.thread_id
      and t.user_id = auth.uid()
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
);

create policy "lead_ai_messages_insert"
on public.lead_ai_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.lead_ai_threads t
    join public.leads l on l.id = t.lead_id
    where t.id = thread_id
      and t.user_id = auth.uid()
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
);
