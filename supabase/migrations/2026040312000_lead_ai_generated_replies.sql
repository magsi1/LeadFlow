-- One-shot AI "Generate reply" outputs per lead (OpenAI), for dashboard history + analytics.

create table if not exists public.lead_ai_generated_replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  reply_body text not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_gen_replies_lead_created
  on public.lead_ai_generated_replies(lead_id, created_at desc);

create index if not exists idx_lead_ai_gen_replies_user_created
  on public.lead_ai_generated_replies(user_id, created_at desc);

alter table public.lead_ai_generated_replies enable row level security;

create policy "lead_ai_generated_replies_select"
on public.lead_ai_generated_replies
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_ai_generated_replies.lead_id
      and public.is_workspace_member(l.workspace_id)
      and (
        public.is_workspace_admin_like(l.workspace_id)
        or l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or l.assigned_to is null
      )
  )
);

create policy "lead_ai_generated_replies_insert"
on public.lead_ai_generated_replies
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
