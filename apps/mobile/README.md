# LeadFlow mobile (Expo)

## Local Development Setup

- **Find your computer’s LAN IP** (phone/emulator must reach the PC, not `localhost`):
  - **macOS:** `ipconfig getifaddr en0` (or check System Settings → Network).
  - **Windows:** `ipconfig` and use the IPv4 address of your active Wi‑Fi adapter (e.g. `192.168.x.x`).

- **Point the app at your Next.js server** by setting the base URL (no path) in **`apps/mobile/.env.local`**:
  - `EXPO_PUBLIC_API_URL=http://[YOUR_IP]:3000`
  - The `EXPO_PUBLIC_` prefix is required; without it, Expo will not expose the variable to the client bundle.

- **Reload env after any change:** stop Expo and run:
  - `npx expo start --clear`

- **Same network:** the device and the computer running Next.js must be on the **same Wi‑Fi** (or same LAN). Firewall rules may need to allow inbound TCP **3000** on the PC.

- **Next.js** should run with `npm run dev` in `apps/web` (port **3000**). Configure `apps/web/.env.local` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for `/api/leads/create`.

- **Nest API (optional):** if you use the Nest backend on port **4000**, set `EXPO_PUBLIC_NEST_API_URL=http://[YOUR_IP]:4000`. `EXPO_PUBLIC_API_URL` is reserved for the Next.js base URL (port 3000) used by `saveLead`.
