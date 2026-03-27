# Supabase configuration (LeadFlow)

## 1. Compile-time defines

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are read at **compile time** via `--dart-define`. They are **not** read from `.env` at runtime unless your build injects them into the define flags.

### Flutter run (Chrome / mobile)

```bash
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Web production (Netlify / CI)

Add the same `--dart-define=...` pair to your build command so `main.dart.js` contains the values.

## 2. Console checks

On startup, the app prints:

- `[LeadFlow] SUPABASE_URL: ...` (full URL, or `(empty)`)
- `[LeadFlow] SUPABASE_ANON_KEY: abcd1234… (len=...)` (prefix only, never the full key)
- `AppConfig.isSupabaseConfigured=...`

## 3. `public.leads.email`

Run migration `backend/sql/006_leads_email_column.sql` in the Supabase SQL editor so the `email` column exists.

## 4. Leads query

`SupabaseLeadRepository` uses `SupabaseLeadsSelect.columns`, which **includes `email`** plus all columns required by the CRM mapper (`source_channel`, `priority`, `user_id`, …).
