-- LeadFlow CRM upgrades: follow-up reminders + notes.
alter table public.leads
  add column if not exists follow_up_at timestamptz;

alter table public.leads
  add column if not exists notes text;

create index if not exists idx_leads_follow_up_at
  on public.leads (follow_up_at);
