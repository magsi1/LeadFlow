-- Imported WhatsApp chat history per lead (Pipeline group import).
CREATE TABLE IF NOT EXISTS public.lead_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('lead', 'user')),
  sender_name text,
  message text NOT NULL,
  sent_at timestamptz NOT NULL,
  source text DEFAULT 'whatsapp',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_id ON public.lead_messages(lead_id);

ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_messages_select_via_lead"
ON public.lead_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_messages.lead_id
    AND public.is_workspace_member(l.workspace_id)
    AND (
      public.is_workspace_admin_like(l.workspace_id)
      OR l.assigned_to = auth.uid()
      OR l.created_by = auth.uid()
      OR l.assigned_to IS NULL
    )
  )
);

CREATE POLICY "lead_messages_insert_via_lead"
ON public.lead_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_messages.lead_id
    AND public.is_workspace_member(l.workspace_id)
    AND (
      public.is_workspace_admin_like(l.workspace_id)
      OR l.created_by = auth.uid()
    )
  )
);
