import type { OpenAIClientConfig } from "./config";
import { OpenAIAPIError, OpenAIConfigurationError } from "./errors";
import { logAiError, logAiWarn } from "./log";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { saveLeadAiGeneratedReply } from "../leadAiRepliesRepository";
import { createChatCompletion } from "./openaiClient";
import type { ChatCompletionOptions, ChatMessage, GenerateReplyErrorCode } from "./types";
import { userFriendlyGenerateReplyNotice } from "./userFacing";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_FALLBACK =
  "Thanks for your message. We’ll follow up shortly — please let us know if anything is urgent.";

/**
 * Default style for outbound CRM/sales replies. Used when no system message is supplied,
 * or prepended when `messages` omit a leading `system` turn.
 *
 * Tuned for natural **WhatsApp**-style copy: short lines, conversational, mobile-first;
 * Urdu + English (Roman/mixed) when the user’s context suggests it.
 */
export const CRM_REPLY_SYSTEM_PROMPT = `You are helping a salesperson send ONE reply to a lead on WhatsApp (or a similar chat app).

WhatsApp style (required):
- Write like a real person texting: short lines, easy to scan on a phone — not an email essay.
- Usually 2–6 short lines; use line breaks where a human would tap Send.
- Warm, clear, and helpful — avoid corporate jargon, bullet labels, or "Dear Sir/Madam" formality.
- One soft next step or question when it fits; don’t stack multiple demands.

Voice & length:
- Sound human: confident but not salesy, never stiff or template-heavy.
- No markdown headings, no numbered lists unless the user’s thread already uses them.

Language (Urdu + English):
- If the context includes Urdu script, Roman Urdu, or clear Urdu phrasing, you may reply in natural mixed Urdu + English (code-mixing is fine for Pakistan/Gulf-style business chat).
- If the context is English-only, reply in English.
- Mirror the thread: don’t force Urdu into an English-only conversation.

Sales tone:
- Friendly and helpful, lightly persuasive — build trust, don’t hype or pressure.
- Do not invent prices, discounts, meetings, or policies not implied by the context.

Output:
- Plain text only. No emojis unless the conversation is clearly casual.
- The "user" message in this chat is your briefing (lead notes / last message to respond to) — reply as the salesperson to the customer.`;

/** Optional: after a successful model reply, insert into `lead_ai_generated_replies`. */
export type GenerateReplyPersistInput = {
  leadId: string;
  workspaceId: string | null;
};

export type GenerateReplyInput = {
  /**
   * Full chat history (system first recommended).
   * If provided, `systemPrompt` and `userPrompt` are ignored.
   * If the first message is not `system`, CRM_REPLY_SYSTEM_PROMPT is prepended automatically.
   */
  messages?: ChatMessage[];
  /** Shorthand with `userPrompt` when you do not need multi-turn history. */
  systemPrompt?: string;
  /** Required when `messages` is omitted — typically the lead’s last message or combined context. */
  userPrompt?: string;
  /** Max wait before treating the call as failed (default 45s). */
  timeoutMs?: number;
  /** Returned when the API fails, times out, or config is missing. */
  fallbackReply?: string;
  /** Passed through to OpenAI (model, temperature, maxTokens). Default model: gpt-4o-mini. */
  completionOptions?: ChatCompletionOptions;
  /**
   * When set, persists the generated text to Supabase `lead_ai_generated_replies`
   * (`lead_id`, `workspace_id`, `reply_body` as content, `model`) after a **non-fallback** success.
   */
  persist?: GenerateReplyPersistInput;
};

export type GenerateReplyPersistOutcome =
  | { ok: true }
  | { ok: false; errorMessage: string; skipped?: boolean };

export type GenerateReplyResult = {
  /** Model text or `fallbackReply` — always safe to show. */
  reply: string;
  usedFallback: boolean;
  errorCode?: GenerateReplyErrorCode;
  /** Technical detail for logs / support (avoid showing raw to users). */
  errorMessage?: string;
  /** Safe short line for banners / notices when `usedFallback` is true. */
  userFriendlyMessage?: string;
  /** Set when `input.persist` was provided (attempted or skipped). */
  persist?: GenerateReplyPersistOutcome;
};

export type GenerateReplyDeps = {
  complete: typeof createChatCompletion;
  saveToSupabase: typeof saveLeadAiGeneratedReply;
};

const defaultDeps: GenerateReplyDeps = {
  complete: createChatCompletion,
  saveToSupabase: saveLeadAiGeneratedReply,
};

function resolveAiConfig(explicit: OpenAIClientConfig | null): OpenAIClientConfig | null {
  if (explicit && (explicit.openaiApiKey || explicit.accessToken)) {
    return explicit;
  }
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  const model = process.env.EXPO_PUBLIC_OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (key) {
    return { openaiApiKey: key, model };
  }
  return explicit;
}

function delayReject(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error("OPENAI_TIMEOUT");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, delayReject(ms)]);
}

function ensureLeadingSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages;
  if (messages[0]?.role === "system") return messages;
  return [{ role: "system", content: CRM_REPLY_SYSTEM_PROMPT }, ...messages];
}

function buildMessages(input: GenerateReplyInput): ChatMessage[] {
  if (input.messages && input.messages.length > 0) {
    return ensureLeadingSystemPrompt(input.messages);
  }
  const user = input.userPrompt?.trim();
  if (!user) {
    const err = new Error("VALIDATION: provide `messages` or a non-empty `userPrompt` (lead message / context).");
    err.name = "ValidationError";
    throw err;
  }
  const systemContent = (input.systemPrompt?.trim() || CRM_REPLY_SYSTEM_PROMPT).trim();
  return [
    { role: "system", content: systemContent },
    { role: "user", content: user },
  ];
}

function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    err.name === "TypeError" ||
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("aborted")
  );
}

function classifyError(err: unknown): { code: GenerateReplyErrorCode; message: string } {
  if (err instanceof OpenAIConfigurationError) {
    return { code: "config", message: err.message };
  }
  if (err instanceof OpenAIAPIError) {
    return { code: "api", message: err.message };
  }
  if (err instanceof Error) {
    if (err.name === "ValidationError" || err.message.startsWith("VALIDATION:")) {
      return { code: "validation", message: err.message };
    }
    if (err.name === "TimeoutError" || err.message === "OPENAI_TIMEOUT") {
      return { code: "timeout", message: "OpenAI request timed out." };
    }
    if (isLikelyNetworkError(err)) {
      return { code: "network", message: err.message };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "unknown", message };
}

export type { GenerateReplyErrorCode } from "./types";

function wrapFailure(
  code: GenerateReplyErrorCode,
  technical: string | undefined,
  fallback: string,
  persist?: GenerateReplyPersistOutcome,
): GenerateReplyResult {
  const userFriendlyMessage = userFriendlyGenerateReplyNotice(code);
  return {
    reply: fallback,
    usedFallback: true,
    errorCode: code,
    errorMessage: technical,
    userFriendlyMessage,
    persist,
  };
}

function mergeCompletionOptions(input: GenerateReplyInput): ChatCompletionOptions {
  return {
    model: DEFAULT_MODEL,
    temperature: 0.55,
    maxTokens: 450,
    ...input.completionOptions,
  };
}

async function persistGeneratedReply(
  deps: GenerateReplyDeps,
  input: GenerateReplyPersistInput,
  content: string,
  model: string,
): Promise<GenerateReplyPersistOutcome> {
  if (!isSupabaseConfigured()) {
    const msg = "Supabase is not configured; reply was not saved.";
    logAiWarn("generateReply.persist", msg);
    return { ok: false, errorMessage: msg, skipped: true };
  }
  const leadId = input.leadId?.trim();
  if (!leadId) {
    return { ok: false, errorMessage: "Missing lead id for saving the reply." };
  }
  try {
    await deps.saveToSupabase({
      leadId,
      workspaceId: input.workspaceId,
      content,
      model,
    });
    return { ok: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logAiError("generateReply.persist", e, { leadId });
    return { ok: false, errorMessage };
  }
}

/**
 * OpenAI chat completion with:
 * - `EXPO_PUBLIC_OPENAI_API_KEY` → direct OpenAI (model default **gpt-4o-mini**)
 * - else Supabase session + Edge Function proxy when configured
 * - optional `persist` → insert into `lead_ai_generated_replies` (lead_id, workspace_id, reply_body, model)
 * - injectable `deps` for tests
 */
export async function generateReply(
  config: OpenAIClientConfig | null,
  input: GenerateReplyInput,
  deps: GenerateReplyDeps = defaultDeps,
): Promise<GenerateReplyResult> {
  const fallback = (input.fallbackReply?.trim() || DEFAULT_FALLBACK).trim();

  const resolved = resolveAiConfig(config);
  if (!resolved || (!resolved.openaiApiKey && !resolved.accessToken)) {
    logAiWarn(
      "generateReply.config",
      "AI unavailable — set EXPO_PUBLIC_OPENAI_API_KEY or sign in with Supabase for the Edge Function",
    );
    return wrapFailure(
      "config",
      "Set EXPO_PUBLIC_OPENAI_API_KEY, or EXPO_PUBLIC_SUPABASE_URL + session for the AI proxy.",
      fallback,
      input.persist ? { ok: false, errorMessage: "AI unavailable — reply not saved.", skipped: true } : undefined,
    );
  }

  let messages: ChatMessage[];
  try {
    messages = buildMessages(input);
  } catch (e) {
    logAiError("generateReply.buildMessages", e, {});
    const { code, message } = classifyError(e);
    return wrapFailure(code, message, fallback);
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const completionOptions = mergeCompletionOptions(input);
  const modelUsed = (completionOptions.model ?? resolved.model ?? DEFAULT_MODEL).trim();

  try {
    const text = await withTimeout(deps.complete(resolved, messages, completionOptions), timeoutMs);
    const trimmed = text.trim();
    if (!trimmed) {
      logAiWarn("generateReply.emptyText", "Model returned whitespace-only text");
      return wrapFailure("empty", "Model returned an empty reply.", fallback, input.persist ? { ok: false, errorMessage: "Empty reply — not saved." } : undefined);
    }

    let persist: GenerateReplyPersistOutcome | undefined;
    if (input.persist) {
      persist = await persistGeneratedReply(deps, input.persist, trimmed, modelUsed);
    }

    return { reply: trimmed, usedFallback: false, persist };
  } catch (err) {
    const { code, message } = classifyError(err);
    logAiError("generateReply.complete", err, { errorCode: code, timeoutMs });
    // Do not attach `persist` here — no row was written; saving only runs after a successful completion.
    return wrapFailure(code, message, fallback);
  }
}

/**
 * Same as `generateReply`, but returns only the reply string (model or fallback).
 */
export async function generateReplyText(
  config: OpenAIClientConfig | null,
  input: GenerateReplyInput,
  deps?: GenerateReplyDeps,
): Promise<string> {
  const result = await generateReply(config, input, deps);
  return result.reply;
}
