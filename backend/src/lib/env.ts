import 'dotenv/config';

export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  port: process.env.PORT || 3000,
  apiBaseUrl: process.env.API_BASE_URL,
  enforceWorkspaceAuth: (process.env.BACKEND_ENFORCE_WORKSPACE_AUTH ?? '').toLowerCase() === 'true',
  aiLeadScoringEnabled: (process.env.AI_LEAD_SCORING_ENABLED ?? '').toLowerCase() === 'true',
  openAiApiKey: process.env.OPENAI_API_KEY,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? '',
  facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '',
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
  metaAppSecret: process.env.META_APP_SECRET ?? '',
};
