<<<<<<< HEAD
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
3. Run app:
   - `flutter run`

## Firebase Setup (Optional but Recommended)

1. Create Firebase project.
2. Add Android and iOS apps.
3. Use FlutterFire CLI:
   - `dart pub global activate flutterfire_cli`
   - `flutterfire configure`
4. Ensure generated `firebase_options.dart` exists.
5. Update `FirebaseService.initialize()` to use:
   - `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`
6. Replace mock repositories with Firebase repositories in `features/app_state/providers.dart`.

## Security Rules

Use the sample file in `firestore.rules` as a starting point.

## Extension Points for Next Phase

- WhatsApp Business API ingestion service
- Meta/Facebook lead form sync service
- Instagram DM ingestion adapter
- AI lead intent/scoring service
- CSV + Google Sheets export pipeline
- Admin web dashboard (shared Firestore backend)
- Background notification scheduler for overdue follow-ups

## Notes

- Current MVP defaults to mock repositories for immediate preview.
- Firebase repositories are included and ready for switching.
- The architecture is intentionally clean but lightweight to avoid overengineering.
=======
# LeadFlow Mobile Monorepo

LeadFlow Mobile is a mobile-only lead capture CRM for iOS/Android with Expo React Native + TypeScript and a NestJS backend.

## Stack

- Mobile: Expo, React Native, TypeScript, React Navigation, Zustand, Socket.IO client
- Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ, WebSockets, OpenAI API
- Shared: workspace package for common DTOs and enums

## Monorepo Structure

- `apps/mobile`: mobile app UI and state
- `apps/api`: backend API, webhooks, AI services, queues, analytics
- `packages/shared`: shared types/enums

## Core Features Implemented

- Unified inbox ingestion endpoint and conversation/message persistence
- JWT authentication and role-based access guards (admin/manager/salesperson)
- Webhook handlers for Meta channels, WhatsApp, and website chat
- HMAC SHA256 webhook signature verification for Meta and WhatsApp
- AI buying intent classification + AI auto-reply generation
- Automatic lead assignment (round-robin by least loaded salesperson)
- Follow-up scheduling with BullMQ delayed reminder jobs
- WebSocket + Expo push notifications for assignments/reminders
- Analytics dashboard endpoint
- Role-based mobile UI navigation for admin/manager/salesperson
- Demo mode with mock data, demo login, and seed endpoint

## Environment Setup

1. Copy:
   - `apps/api/.env.example` -> `apps/api/.env`
2. Set required values:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `OPENAI_API_KEY` (optional if demo mode enabled)
   - `META_VERIFY_TOKEN`
  - `META_APP_SECRET`
  - `WHATSAPP_APP_SECRET` (optional if same as META_APP_SECRET)
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
   - `DEMO_MODE`

For mobile:

- Optional env vars:
  - `EXPO_PUBLIC_API_URL` (default `http://localhost:4000`)
  - `EXPO_PUBLIC_DEMO_MODE` (default `true`)

## Run

```bash
npm install
npm run prisma:generate -w @leadflow/api
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
npm run dev:api
npm run dev:mobile
```

## API Overview

- `GET /inbox`
- `POST /inbox/ingest`
- `POST /auth/login`
- `GET /leads`
- `PATCH /leads/:leadId/status`
- `GET /followups`
- `GET /analytics/dashboard`
- `POST /notifications/register-token`
- `GET /integrations/meta/webhook`
- `POST /integrations/meta/webhook`
- `POST /integrations/whatsapp/webhook`
- `POST /integrations/website-chat/webhook`
- `POST /demo/seed`

## Notes

- Integration handlers are built for official webhook ingestion flows; connect app credentials/tokens in production.
- In demo mode, app and API can run without external channel or OpenAI credentials.
- Demo login password: `leadflow123` for `admin@leadflow.demo`, `manager@leadflow.demo`, `alex@leadflow.demo`.
>>>>>>> 86634f0 (initial commit with backend)
