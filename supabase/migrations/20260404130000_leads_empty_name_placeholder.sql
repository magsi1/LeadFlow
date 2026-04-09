-- One-time data fix: rows where `name` is null, empty, or only whitespace were shown as "No Name" in the app.
-- Sets a single placeholder so lists and detail screens have a stable label.
-- Safe to re-run (only updates rows that still match the condition).

update public.leads
set
  name = 'Unnamed lead',
  updated_at = now()
where coalesce(trim(name), '') = '';
