-- CRM pipeline column: new | contacted | follow_up | closed

alter table public.leads
  add column if not exists stage text not null default 'new';

-- Backfill from legacy temperature-style status when present
update public.leads
set stage = case
  when lower(trim(coalesce(status, ''))) = 'hot' then 'follow_up'
  when lower(trim(coalesce(status, ''))) = 'warm' then 'contacted'
  when lower(trim(coalesce(status, ''))) = 'cold' then 'new'
  else stage
end
where stage = 'new'
  and lower(trim(coalesce(status, ''))) in ('hot', 'warm', 'cold');

update public.leads
set stage = 'new'
where stage is null
   or trim(stage) = ''
   or lower(trim(stage)) not in ('new', 'contacted', 'follow_up', 'closed');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_stage_check'
  ) then
    alter table public.leads
      add constraint leads_stage_check
      check (stage in ('new', 'contacted', 'follow_up', 'closed'));
  end if;
end $$;

create index if not exists idx_leads_stage on public.leads (stage);

comment on column public.leads.stage is 'Pipeline column: new, contacted, follow_up, closed';
