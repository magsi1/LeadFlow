-- Smart lead scoring + contact timing (LeadFlow).
-- status column: hot | warm | cold (pipeline temperature); CRM stage stored in priority.

alter table public.leads
  add column if not exists score int not null default 0;

alter table public.leads
  add column if not exists last_contacted timestamptz;

alter table public.leads
  add column if not exists next_followup timestamptz;

alter table public.leads
  add column if not exists priority text;

-- Legacy constraint only allowed new/contacted/closed — allow temperature + CRM values.
alter table public.leads drop constraint if exists leads_status_check;

comment on column public.leads.score is '0–100; drives hot/warm/cold with business rules';
comment on column public.leads.last_contacted is 'Last meaningful touch (in/out)';
comment on column public.leads.next_followup is 'Planned next follow-up (mirrors follow_up_at where used)';
comment on column public.leads.priority is 'CRM stage text (e.g. new, contacted) when status is hot/warm/cold';
