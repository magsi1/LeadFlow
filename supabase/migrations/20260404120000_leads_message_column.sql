-- Auto lead capture: store latest inbound / capture text in a dedicated column.
-- Safe to run on environments where `public.leads` already exists.

alter table if exists public.leads
  add column if not exists message text;

comment on column public.leads.message is 'Inbound or captured message text (e.g. website chat).';
