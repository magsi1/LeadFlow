-- Follow-up automation: due time + sent flag (used by FollowUpService + dashboard).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_time TIMESTAMPTZ;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.follow_up_time IS 'When the automated WhatsApp follow-up should fire.';
COMMENT ON COLUMN public.leads.follow_up_sent IS 'Whether the automated follow-up WhatsApp was already sent.';
