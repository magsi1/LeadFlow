-- Enforce at most one lead per workspace for a given phone number (digits-only, 8+ digits).
-- Matches app-side normalization (strip non-digits). Fails if duplicate (workspace_id, phone digits) rows already exist — resolve those first.
-- Rows with missing/short phones are excluded from the index.

create unique index if not exists leads_workspace_phone_digits_uidx
  on public.leads (
    workspace_id,
    (nullif(regexp_replace(trim(coalesce(phone, '')), '[^0-9]', '', 'g'), ''))
  )
  where length(regexp_replace(trim(coalesce(phone, '')), '[^0-9]', '', 'g')) >= 8;

comment on index public.leads_workspace_phone_digits_uidx is
  'Unique (workspace, normalized phone digits) when phone has 8+ digits after stripping non-digits.';
