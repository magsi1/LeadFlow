class AppConfig {
  /// Production LeadFlow API (Railway). Override with --dart-define=LEADFLOW_BACKEND_BASE_URL=...
  static const String apiUrl =
      'https://leadflow-production-b016.up.railway.app';

  static const appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'supabase',
  );
  static const environmentName = String.fromEnvironment(
    'LEADFLOW_ENV',
    defaultValue: 'supabase',
  );

  static const backendBaseUrl = String.fromEnvironment(
    'LEADFLOW_BACKEND_BASE_URL',
    defaultValue: apiUrl,
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

  /// Full HTTPS URL for WhatsApp Cloud API / 360dialog `POST` (messages endpoint).
  /// Example: `https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages`
  static const whatsappApiUrl = String.fromEnvironment(
    'WHATSAPP_API_URL',
    defaultValue: '',
  );

  /// Prefer `WHATSAPP_API_TOKEN`; falls back to [whatsappAccessToken] if empty.
  static const whatsappApiToken = String.fromEnvironment(
    'WHATSAPP_API_TOKEN',
    defaultValue: '',
  );

  /// Legacy name (e.g. from `.env.example`); used when [whatsappApiToken] is empty.
  static const whatsappAccessToken = String.fromEnvironment(
    'WHATSAPP_ACCESS_TOKEN',
    defaultValue: '',
  );

  /// Set `true` for Meta WhatsApp Cloud API if the server requires `messaging_product: "whatsapp"` in JSON.
  static const bool whatsappMetaMessagingProduct = bool.fromEnvironment(
    'WHATSAPP_META_BODY',
    defaultValue: false,
  );

  /// Set `true` to send `D360-API-KEY: <token>` instead of `Authorization: Bearer <token>`.
  static const bool whatsappD360ApiKeyHeader = bool.fromEnvironment(
    'WHATSAPP_D360_API_KEY',
    defaultValue: false,
  );

  static const bool demoModeEnabled = false;

  static const aiModeEnabled = false;
}
