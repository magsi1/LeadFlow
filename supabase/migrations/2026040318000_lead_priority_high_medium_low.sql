-- Lead priority: canonical stored values are lowercase 'low', 'medium', 'high' only.
-- App labels: Low, Medium, High. Legacy cold/warm/hot (and mixed casing) are migrated here.
-- Hot → high, Warm → medium, Cold → low.

do $$
declare
  r record;
begin
  for r in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'leads'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%priority%'
  ) loop
    execute format('alter table public.leads drop constraint if exists %I', r.conname);
  end loop;

  for r in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'conversations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%priority%'
  ) loop
    execute format('alter table public.conversations drop constraint if exists %I', r.conname);
  end loop;
end $$;

update public.leads
set priority = case lower(trim(priority))
  when 'cold' then 'low'
  when 'warm' then 'medium'
  when 'hot' then 'high'
  when 'low' then 'low'
  when 'medium' then 'medium'
  when 'high' then 'high'
  else 'medium'
end
where priority is not null;

update public.conversations
set priority = case lower(trim(priority))
  when 'cold' then 'low'
  when 'warm' then 'medium'
  when 'hot' then 'high'
  when 'low' then 'low'
  when 'medium' then 'medium'
  when 'high' then 'high'
  else 'medium'
end
where priority is not null;

alter table public.leads
  alter column priority set default 'medium';

alter table public.conversations
  alter column priority set default 'medium';

alter table public.leads
  add constraint leads_priority_check
  check (priority in ('low', 'medium', 'high'));

alter table public.conversations
  add constraint conversations_priority_check
  check (priority in ('low', 'medium', 'high'));

comment on column public.leads.priority is
  'Lead priority: only low | medium | high (display as Low / Medium / High).';

comment on column public.conversations.priority is
  'Conversation priority: only low | medium | high (display as Low / Medium / High).';
