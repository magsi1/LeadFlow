-- Add optional contact email to CRM leads (Supabase public.leads)
alter table public.leads
  add column if not exists email text;

comment on column public.leads.email is 'Lead contact email for outreach (optional)';
