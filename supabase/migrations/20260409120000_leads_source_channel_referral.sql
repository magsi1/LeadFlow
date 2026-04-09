-- Allow 'referral' as leads.source_channel (Smart Delete / CRM sources).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'leads'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%source_channel%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_channel_check
  CHECK (source_channel IN ('whatsapp', 'instagram', 'facebook', 'manual', 'other', 'referral'));
