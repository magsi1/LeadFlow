export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** Input for sales-reply generation (domain / use-case boundary). */
export type LeadReplyContext = {
  leadName?: string | null;
  channel?: string | null;
  priority?: string | null;
  status?: string | null;
  notes?: string | null;
  city?: string | null;
  /** Optional extra lines (e.g. recent WhatsApp snippets) */
  conversationSnippet?: string | null;
};

export type ChatCompletionOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateReplyErrorCode =
  | "timeout"
  | "api"
  | "config"
  | "validation"
  | "empty"
  | "unknown"
  | "network";
