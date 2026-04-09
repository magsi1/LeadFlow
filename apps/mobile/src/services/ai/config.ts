import { OpenAIConfigurationError } from "./errors";

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * - **Direct:** `EXPO_PUBLIC_OPENAI_API_KEY` → OpenAI HTTPS API (key ships in the app bundle — use only if acceptable).
 * - **Proxy:** `accessToken` + Supabase Edge Function `ai-chat-completion` (no OpenAI key on device).
 */
export type OpenAIClientConfig = {
  /** Default model when the caller omits `completionOptions.model`. */
  model: string;
  /** Supabase JWT for Edge Function proxy. */
  accessToken?: string;
  /** Direct OpenAI (from EXPO_PUBLIC_OPENAI_API_KEY). */
  openaiApiKey?: string;
};

/**
 * Prefer direct OpenAI when EXPO_PUBLIC_OPENAI_API_KEY is set; otherwise Supabase proxy when URL + session exist.
 */
export function tryGetOpenAIClientConfig(accessToken: string | null | undefined): OpenAIClientConfig | null {
  const model = process.env.EXPO_PUBLIC_OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const directKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  if (directKey) {
    return { openaiApiKey: directKey, model };
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const token = accessToken?.trim();
  if (!url || !token) return null;
  return { accessToken: token, model };
}

export function getOpenAIClientConfig(accessToken: string): OpenAIClientConfig {
  const c = tryGetOpenAIClientConfig(accessToken);
  if (!c) {
    throw new OpenAIConfigurationError(
      "Set EXPO_PUBLIC_OPENAI_API_KEY, or sign in with EXPO_PUBLIC_SUPABASE_URL for the AI Edge Function.",
    );
  }
  return c;
}
