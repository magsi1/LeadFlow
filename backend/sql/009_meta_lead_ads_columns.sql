-- Meta Lead Ads ingestion support.
alter table public.leads
  add column if not exists source text;

alter table public.leads
  add column if not exists external_lead_id text;

create unique index if not exists idx_leads_external_lead_id_unique
  on public.leads (external_lead_id)
  where external_lead_id is not null;
