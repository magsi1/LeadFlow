# Netlify-ready Flutter web build (PowerShell).
# Set $env:SUPABASE_URL and $env:SUPABASE_ANON_KEY before running (or use CI secrets).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY) {
    Write-Warning "SUPABASE_URL and/or SUPABASE_ANON_KEY are not set. The web build will embed empty strings unless you pass --dart-define manually."
}

flutter clean
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
flutter pub get
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

flutter build web `
    --dart-define=SUPABASE_URL=$($env:SUPABASE_URL) `
    --dart-define=SUPABASE_ANON_KEY=$($env:SUPABASE_ANON_KEY)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$required = @(
    "build/web/index.html",
    "build/web/main.dart.js",
    "build/web/flutter.js",
    "build/web/_redirects"
)
foreach ($p in $required) {
    if (-not (Test-Path $p)) { throw "Missing required file: $p" }
}
Write-Host "OK: Netlify bundle ready under build/web"
