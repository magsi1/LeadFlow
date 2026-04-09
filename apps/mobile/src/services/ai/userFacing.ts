import { OpenAIAPIError, OpenAIConfigurationError } from "./errors";
import type { GenerateReplyErrorCode } from "./types";

/**
 * Maps any thrown AI error to a short, non-technical message for UI.
 */
export function toUserFacingAiError(err: unknown): string {
  if (err instanceof OpenAIConfigurationError) {
    return err.message;
  }
  if (err instanceof OpenAIAPIError) {
    return err.message;
  }
  if (err instanceof Error) {
    if (isLikelyNetworkError(err)) {
      return "Couldn’t reach the AI service. Check your internet connection and try again.";
    }
    const m = err.message;
    if (m.length > 0 && m.length < 200 && !looksLikeStackTrace(m)) {
      return m;
    }
  }
  return "Something went wrong with the AI. Please try again.";
}

function looksLikeStackTrace(s: string): boolean {
  return s.includes("    at ") || s.includes("Error:");
}

function isLikelyNetworkError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    err.name === "TypeError" ||
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("aborted") ||
    m.includes("timed out")
  );
}

/** Short notice when generateReply used a fallback (shown next to warning color). */
export function userFriendlyGenerateReplyNotice(code: GenerateReplyErrorCode | undefined): string {
  switch (code) {
    case "timeout":
      return "The AI took too long. We showed a safe default you can edit.";
    case "network":
      return "No internet or the AI service was unreachable. We showed a safe default you can edit.";
    case "api":
      return "The AI service had a problem. We showed a safe default you can edit.";
    case "config":
      return "AI isn’t configured — set EXPO_PUBLIC_OPENAI_API_KEY or Supabase sign-in + the ai-chat-completion function.";
    case "empty":
      return "The AI returned nothing useful. We showed a safe default you can edit.";
    case "validation":
      return "Couldn’t build the AI request. We showed a safe default you can edit.";
    default:
      return "AI wasn’t available. We showed a safe default you can edit.";
  }
}
