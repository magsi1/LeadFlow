/**
 * AI integration (OpenAI) — public surface for the app.
 *
 * Layers:
 * - types: domain DTOs
 * - config: env → OpenAIClientConfig
 * - openaiClient: HTTP chat completions (infrastructure)
 * - replySuggestion: reusable “suggested reply” use-case
 * - generateReply: generic completion + timeout + fallback
 * - leadAssistantChat: bilingual lead assistant turns
 * - replyCache: per-lead draft cache + in-flight dedupe
 * - log / userFacing: diagnostics + safe UI copy
 */
export { OpenAIConfigurationError, OpenAIAPIError } from "./errors";
export type { OpenAIClientConfig } from "./config";
export { getOpenAIClientConfig, tryGetOpenAIClientConfig } from "./config";
export { createChatCompletion } from "./openaiClient";
export type {
  ChatMessage,
  ChatRole,
  LeadReplyContext,
  ChatCompletionOptions,
  GenerateReplyErrorCode,
} from "./types";
export {
  buildSuggestLeadMessages,
  suggestLeadReply,
  type ReplySuggestionDeps,
} from "./replySuggestion";
export {
  CRM_REPLY_SYSTEM_PROMPT,
  generateReply,
  generateReplyText,
  type GenerateReplyDeps,
  type GenerateReplyInput,
  type GenerateReplyPersistInput,
  type GenerateReplyPersistOutcome,
  type GenerateReplyResult,
} from "./generateReply";
export {
  buildLeadAssistantSystemPrompt,
  completeLeadAssistantTurn,
  type AssistantLanguage,
  type LeadAssistantChatDeps,
} from "./leadAssistantChat";
export {
  clearCachedReply,
  dedupeLeadAiRequest,
  getCachedReply,
  setCachedReply,
  type CachedLeadReply,
} from "./replyCache";
export { logAiError, logAiInfo, logAiWarn } from "./log";
export { toUserFacingAiError, userFriendlyGenerateReplyNotice } from "./userFacing";
