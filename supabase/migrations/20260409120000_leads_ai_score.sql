-- AI lead scoring columns (computed client-side, persisted for sorting / reporting)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
