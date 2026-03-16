class AppConfig {
  static const appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'demo',
  );

  static const environmentName = String.fromEnvironment(
    'LEADFLOW_ENV',
    defaultValue: 'demo',
  );

  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  static const backendBaseUrl = String.fromEnvironment(
    'LEADFLOW_BACKEND_BASE_URL',
    defaultValue: 'https://api.leadflow.local',
  );

  static const authToken = String.fromEnvironment(
    'LEADFLOW_AUTH_TOKEN',
    defaultValue: '',
  );

  static const openAiApiKey = String.fromEnvironment(
    'LEADFLOW_OPENAI_API_KEY',
    defaultValue: '',
  );

  static const metaAppId = String.fromEnvironment(
    'LEADFLOW_META_APP_ID',
    defaultValue: '',
  );

  static const metaConfigId = String.fromEnvironment(
    'LEADFLOW_META_CONFIG_ID',
    defaultValue: '',
  );

  static const demoModeEnabled = bool.fromEnvironment(
    'LEADFLOW_DEMO_MODE',
    defaultValue: true,
  );

  static const aiModeEnabled = bool.fromEnvironment(
    'LEADFLOW_AI_MODE',
    defaultValue: false,
  );

  static bool get isSupabaseConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  static bool get wantsSupabase {
    final env = appEnv.toLowerCase();
    final legacyEnv = environmentName.toLowerCase();
    return env == 'supabase' || legacyEnv == 'supabase';
  }

  static bool get useSupabase {
    if (demoModeEnabled) return false;
    return isSupabaseConfigured && wantsSupabase;
  }
}
