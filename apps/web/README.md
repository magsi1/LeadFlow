# LeadFlow web (Next.js)

## API route: `POST /api/leads/create`

1. Copy `.env.example` to `.env.local`.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role is required for server-side inserts).
3. Run: `npm run dev` (listens on port **3000**).

The Expo app calls this API using `EXPO_PUBLIC_API_URL` (LAN IP, not `localhost`). See `apps/mobile/README.md`.
