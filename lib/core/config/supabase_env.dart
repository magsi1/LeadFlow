/// Legacy compile-time hooks (optional). LeadFlow embeds Supabase URL and anon key
/// in [main.dart] as `supabaseUrl` / `supabaseAnonKey` for a single init path.
///
/// You may still use `--dart-define=SUPABASE_URL=...` for other tooling if needed.
const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');

const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
