-- Ensure `public.leads.status` exists and defaults to "new".
-- LeadFlow uses lowercase enum-like values in app code.

alter table public.leads
  add column if not exists status text;

update public.leads
set status = 'new'
where status is null or trim(status) = '';

alter table public.leads
  alter column status set default 'new';

comment on column public.leads.status is
  'Lead temperature/intent status. Default is new for compatibility.';
