# Deploy LeadFlow (Flutter Web) to Netlify

## What was wrong

- **Netlify “environment variables”** are available to the **build shell** and to **serverless functions**, not to the **browser** at runtime.
- Flutter Web **bakes** `String.fromEnvironment('SUPABASE_URL')` into **`main.dart.js` at compile time** only.
- If you run `flutter build web` **without** `--dart-define=SUPABASE_URL=...`, the compiled app sees **`''`**, which triggers *Invalid SUPABASE_URL: ''* / missing config.

## What fixes it

1. Store secrets in **Netlify → Site settings → Environment variables** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
2. **Build command** must pass them into the Dart compiler:

```bash
flutter pub get
flutter build web \
  --dart-define=SUPABASE_URL=$SUPABASE_URL \
  --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
```

3. Publish directory: **`build/web`**.

**Bash** (Netlify’s default Linux build): `$SUPABASE_URL` expands from the environment.

**PowerShell** (local Windows):

```powershell
flutter build web `
  --dart-define=SUPABASE_URL=$env:SUPABASE_URL `
  --dart-define=SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY
```

## App behavior

- **`lib/core/config/supabase_env.dart`**: `const supabaseUrl` / `const supabaseAnonKey` from `String.fromEnvironment(...)`.
- If either is missing or URL is invalid → red error screen:
  - *Missing Supabase configuration. Please check build variables.*
- Console: `print('SUPABASE_URL: ...')` (and truncated anon key preview) for debugging.

## Why hash URLs + `_redirects`

- **`HashUrlStrategy`**: Routes look like `https://yoursite.netlify.app/#/leads`.
- **`web/_redirects`** → **`build/web/_redirects`**:

```text
/* /index.html 200
```

## Build (local)

```bash
flutter clean
flutter pub get
flutter build web \
  --dart-define=SUPABASE_URL=$SUPABASE_URL \
  --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
```

**`--web-renderer canvaskit`:** Not in current Flutter CLI; CanvasKit is the default in the generated bundle.

**CanvasKit / CDN blocked:** Try:

```bash
flutter build web --no-web-resources-cdn \
  --dart-define=SUPABASE_URL=$SUPABASE_URL \
  --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
```

### Script (Windows)

```powershell
.\scripts\build_web_netlify.ps1
```

(Set `$env:SUPABASE_URL` and `$env:SUPABASE_ANON_KEY` first.)

## `index.html` / `flutter.js`

- **`web/index.html`**: `<base href="/" />`, **`flutter_bootstrap.js`** with **`defer`**.
- After build, **`build/web/flutter.js`** is present for the engine loader.

## Production API (Railway)

- `AppConfig.apiUrl` / default `LEADFLOW_BACKEND_BASE_URL` — override with `--dart-define` if needed.

## Verify output

- `build/web/index.html`
- `build/web/main.dart.js` (contains baked-in Supabase URL only if defines were passed)
- `build/web/flutter.js`
- `build/web/_redirects`

```powershell
Test-Path build/web/index.html, build/web/main.dart.js, build/web/flutter.js, build/web/_redirects
```

## Troubleshooting

- **Console**: Look for `SUPABASE_URL:` printed at startup; if empty, rebuild with `--dart-define`.
- **White screen:** CanvasKit / CDN / CSP — try `--no-web-resources-cdn`.
