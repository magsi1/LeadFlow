import { formatLeadPriorityDisplay } from "../../lib/leadPriority";
import type { OpenAIClientConfig } from "./config";
import { CRM_REPLY_SYSTEM_PROMPT } from "./generateReply";
import { createChatCompletion } from "./openaiClient";
import { logAiError } from "./log";
import type { ChatMessage, LeadReplyContext } from "./types";

function buildUserPrompt(context: LeadReplyContext): string {
  const lines: string[] = [
    "Write one reply from me (the sales rep) to this lead. Use the context below.",
    "",
    `Lead name: ${context.leadName?.trim() || "No Name"}`,
    `Source / channel: ${context.channel?.trim() || "unknown"}`,
    `Priority: ${formatLeadPriorityDisplay(context.priority)}`,
    `Pipeline status: ${context.status?.trim() || "—"}`,
  ];
  if (context.city?.trim()) lines.push(`City / region: ${context.city.trim()}`);
  if (context.notes?.trim()) {
    lines.push("", "CRM notes:", context.notes.trim());
  }
  if (context.conversationSnippet?.trim()) {
    lines.push("", "Latest message / thread snippet from the lead (use tone & language as a guide):", context.conversationSnippet.trim());
  }
  return lines.join("\n");
}

export type ReplySuggestionDeps = {
  complete: typeof createChatCompletion;
};

const defaultDeps: ReplySuggestionDeps = {
  complete: createChatCompletion,
};

/**
 * Application use-case: generate a suggested outbound reply for a lead.
 * Reusable from any screen; depends only on `OpenAIClientConfig` + context.
 */
/** Messages for `generateReply` / tests — same prompt stack as `suggestLeadReply`. */
export function buildSuggestLeadMessages(context: LeadReplyContext): ChatMessage[] {
  return [
    { role: "system", content: CRM_REPLY_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(context) },
  ];
}

export async function suggestLeadReply(
  config: OpenAIClientConfig,
  context: LeadReplyContext,
  deps: ReplySuggestionDeps = defaultDeps,
): Promise<string> {
  try {
    return await deps.complete(config, buildSuggestLeadMessages(context));
  } catch (e) {
    logAiError("replySuggestion.suggestLeadReply", e, {});
    throw e;
  }
}
