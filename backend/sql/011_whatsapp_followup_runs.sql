-- Tracks WhatsApp drip follow-up sequences (driven by n8n or other automation).
-- Reply detection uses public.messages: is_from_customer = true after anchor timestamps.

create table if not exists public.whatsapp_followup_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  sequence_started_at timestamptz not null default now(),
  second_message_sent_at timestamptz,
  final_message_sent_at timestamptz,
  status text not null default 'first_sent'
    check (status in (
      'first_sent',
      'awaiting_second_window',
      'second_sent',
      'awaiting_final_window',
      'final_sent',
      'stopped_customer_replied',
      'completed_no_reply'
    )),
  updated_at timestamptz not null default now()
);

create index if not exists idx_followup_runs_lead_id on public.whatsapp_followup_runs (lead_id);
create index if not exists idx_followup_runs_phone on public.whatsapp_followup_runs (phone);
create index if not exists idx_followup_runs_status on public.whatsapp_followup_runs (status);

comment on table public.whatsapp_followup_runs is 'WhatsApp drip automation state; n8n updates after each wait/send.';

alter table public.whatsapp_followup_runs enable row level security;

drop policy if exists "Users manage own followup runs" on public.whatsapp_followup_runs;
create policy "Users manage own followup runs"
  on public.whatsapp_followup_runs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role (n8n with service key) bypasses RLS.
