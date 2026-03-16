# LeadFlow - MVP Mobile App (Flutter + Firebase Ready)

LeadFlow is a production-style MVP mobile app for small businesses to capture and manage leads from WhatsApp, Facebook, Instagram, calls, walk-ins, website, and referrals.

It focuses on practical sales operations:
- capture leads fast
- track follow-ups
- assign ownership
- avoid missed opportunities
- monitor team performance

## MVP Scope Delivered

- Authentication module (login, signup UI, forgot password UI, persisted session in demo mode)
- Role-aware app experience:
  - Admin: full dashboard, team management, reports
  - Salesperson: personal lead-centric workflow
- Dashboard metrics (totals, new today, hot leads, due/overdue, won/lost, activity)
- Lead list with search + filter chips
- Add/Edit lead form with validation
- Lead details page with:
  - full lead profile
  - call + WhatsApp quick actions
  - status updates
  - note logging
  - follow-up scheduling
  - timeline view
- Follow-up tracker with Due Today / Overdue / Upcoming / Completed
- Team management view for assignment and performance summary
- Reports/insights summary (source/status/staff and won/lost)
- Settings (profile/business info/logout)
- Light + dark theme support
- Pull-to-refresh on data-heavy screens
- Demo seed dataset (admin + salesperson + realistic leads)

## Tech Stack

- Flutter
- Riverpod (state management)
- GoRouter (navigation + route guarding)
- Firebase-ready services:
  - Firebase Core
  - Firebase Auth
  - Cloud Firestore
  - Firebase Cloud Messaging
- SharedPreferences (session persistence in demo mode)
- HTTP backend client for API mode
- Supabase-ready data persistence mode

## Folder Structure

```text
lib/
  app.dart
  main.dart
  core/
    bootstrap/
      bootstrap.dart
    constants/
      app_constants.dart
    router/
      app_router.dart
      route_paths.dart
    theme/
      app_theme.dart
    utils/
      formatters.dart
      iterable_extensions.dart
      launch_actions.dart
    widgets/
      app_text_field.dart
      empty_state.dart
      lead_card.dart
      stat_card.dart
  data/
    models/
      activity.dart
      app_user.dart
      business.dart
      follow_up.dart
      lead.dart
    repositories/
      auth_repository.dart
      lead_repository.dart
      team_repository.dart
      firebase/
        firebase_auth_repository.dart
        firebase_lead_repository.dart
        firebase_team_repository.dart
      mock/
        mock_auth_repository.dart
        mock_lead_repository.dart
        mock_team_repository.dart
      remote/
        remote_auth_repository.dart
        remote_lead_repository.dart
        remote_team_repository.dart
    services/
      firebase_service.dart
      mock_seed_service.dart
      notification_service.dart
  features/
    app_state/
      app_state.dart
      app_state_notifier.dart
      providers.dart
    auth/presentation/
      login_screen.dart
      signup_screen.dart
      forgot_password_screen.dart
    dashboard/presentation/
      dashboard_screen.dart
    followups/presentation/
      followup_screen.dart
    home/presentation/
      app_shell.dart
    leads/presentation/
      add_edit_lead_screen.dart
      lead_details_screen.dart
      leads_screen.dart
    reports/presentation/
      reports_screen.dart
    settings/presentation/
      settings_screen.dart
    splash/presentation/
      splash_screen.dart
    team/presentation/
      team_screen.dart
```

## Demo Credentials

- Admin:
  - Email: `admin@leadflow.com`
  - Password: `123456`
- Salesperson:
  - Email: `sales@leadflow.com`
  - Password: `123456`

## Firebase Collections Design

Suggested collections:
- `users`
- `leads`
- `activities`
- `followups`
- `businesses`

Primary fields are mapped in the model classes:
- `AppUser`
- `Lead`
- `Activity`
- `FollowUp`
- `Business`

## Run Instructions

1. Install Flutter SDK and verify:
   - `flutter doctor`
2. In project root:
   - `flutter pub get`
3. Run in demo mode (default):
   - `flutter run -d chrome --web-hostname 127.0.0.1`
4. Run with real backend mode:
   - `flutter run -d chrome --web-hostname 127.0.0.1 --dart-define=LEADFLOW_DEMO_MODE=false --dart-define=LEADFLOW_BACKEND_BASE_URL=https://api.your-domain.com --dart-define=LEADFLOW_AUTH_TOKEN=your-token`
5. Run with Supabase mode:
   - `flutter run -d chrome --web-hostname 127.0.0.1 --dart-define=LEADFLOW_DEMO_MODE=false --dart-define=APP_ENV=supabase --dart-define=SUPABASE_URL=https://xyz.supabase.co --dart-define=SUPABASE_ANON_KEY=your-anon-key`

## Environment Configuration

LeadFlow reads runtime configuration from Dart defines (`String.fromEnvironment`):
- `APP_ENV`
- `LEADFLOW_DEMO_MODE`
- `LEADFLOW_BACKEND_BASE_URL`
- `LEADFLOW_AUTH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `LEADFLOW_OPENAI_API_KEY`
- `LEADFLOW_META_APP_ID`
- `LEADFLOW_META_CONFIG_ID`
- `LEADFLOW_AI_MODE`

Use `.env.example` as a reference and pass values using `--dart-define` (or `--dart-define-from-file` on supported Flutter versions).

## Firebase Setup (Optional)

1. Create Firebase project.
2. Add Android and iOS apps.
3. Use FlutterFire CLI:
   - `dart pub global activate flutterfire_cli`
   - `flutterfire configure`
4. Ensure generated `firebase_options.dart` exists.
5. Update `FirebaseService.initialize()` to use:
   - `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`
6. For Firebase-only deployment, you can still swap providers in `features/app_state/providers.dart`.
   The current MVP now supports API-backed repositories without changing UI/navigation.

## Security Rules

Use the sample file in `firestore.rules` as a starting point.

## Omnichannel Backend Integration Points

The app is wired for business-account-ready channel integration via backend APIs:
- WhatsApp Business: `/api/integrations/:id/connect`, `/api/messages/send`
- Instagram Business: `/api/integrations/:id/connect`, `/api/conversations`, `/api/conversations/:id/messages`
- Facebook Page/Messenger: `/api/integrations/:id/connect`, `/api/conversations`, `/api/messages/send`

Unified inbox and integration settings continue to work in demo mode, and switch to remote repositories when `LEADFLOW_DEMO_MODE=false`.

## Supabase Schema

A starter schema/migration set is included at:
- `supabase/migrations/20260316_0001_crm_schema.sql`
- `supabase/migrations/20260316_0002_rls_policies.sql`
- `supabase/migrations/20260316_0003_seed_demo_data.sql`

Tables covered:
- `profiles`
- `salespeople`
- `leads`
- `conversations`
- `messages`
- `follow_ups`
- `activities`
- `integration_accounts`
- `workspaces` (future-ready)

## Supabase Migration Steps

1. Create a Supabase project.
2. Open SQL editor and run:
   - `20260316_0001_crm_schema.sql`
   - `20260316_0002_rls_policies.sql`
3. (Optional) Run `20260316_0003_seed_demo_data.sql` after replacing demo UUIDs with real auth user IDs.
4. Set runtime defines:
   - `LEADFLOW_DEMO_MODE=false`
   - `APP_ENV=supabase`
   - `SUPABASE_URL=...`
   - `SUPABASE_ANON_KEY=...`

## Auth Modes

- **Demo mode** (`LEADFLOW_DEMO_MODE=true`):
  - Uses local/mock repositories.
  - No external auth required.
- **Supabase mode** (`APP_ENV=supabase`, demo false, keys set):
  - Uses Supabase Auth/session.
  - Login/signup routes are enforced by router guard.
- **Fallback safety**:
  - If Supabase mode is requested but keys are missing, repositories safely fall back to mock implementations.

## Supabase Realtime Behavior

When Supabase mode is enabled, LeadFlow subscribes to live updates for:
- `conversations`
- `messages`
- `leads`
- `follow_ups`
- `activities`

Realtime sync behavior:
- Inbox conversation list reorders automatically by latest activity.
- Selected conversation message thread streams live updates.
- Dashboard/Leads/Follow-ups refresh from repository stream signals.
- Activity timeline in Inbox detail updates live from `activities`.

Demo mode behavior:
- Realtime watchers use local/mock streams or no-op fallback.
- App remains fully usable without Supabase configuration.

## Extension Points for Next Phase

- WhatsApp Business API ingestion service
- Meta/Facebook lead form sync service
- Instagram DM ingestion adapter
- AI lead intent/scoring service
- CSV + Google Sheets export pipeline
- Admin web dashboard (shared Firestore backend)
- Background notification scheduler for overdue follow-ups

## Notes

- Current MVP defaults to demo repositories for immediate preview.
- Set `LEADFLOW_DEMO_MODE=false` to switch to backend-ready repositories.
- Integrations/Inbox have backend repository implementations and stay demo-safe if APIs are not configured.
- The architecture is intentionally clean but lightweight to avoid overengineering.
