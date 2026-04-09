import { formatLeadPriorityDisplay } from "../../lib/leadPriority";
import type { OpenAIClientConfig } from "./config";
import { createChatCompletion } from "./openaiClient";
import { logAiError } from "./log";
import type { ChatMessage, LeadReplyContext } from "./types";

export type AssistantLanguage = "auto" | "en" | "ur";

function languageInstruction(language: AssistantLanguage): string {
  switch (language) {
    case "en":
      return "Language: Always respond in clear, professional English only.";
    case "ur":
      return `Language: Always respond in Urdu using Urdu script (Unicode) where natural for the sentence. 
Keep a professional sales / CRM tone suitable for Pakistan and Gulf markets. 
You may use common English business terms in Roman (e.g. "follow-up", "quote") when they are standard in Urdu business chat.`;
    default:
      return `Language: Match the user's language. If their latest message is primarily in Urdu script (Arabic script) or clearly Roman Urdu, reply fully in that style (prefer Urdu script when possible). 
Otherwise reply in English. If they mix both, mirror their mix proportionally.`;
  }
}

function leadContextBlock(ctx: LeadReplyContext): string {
  const parts = [
    `Lead name: ${ctx.leadName?.trim() || "No Name"}`,
    `Channel: ${ctx.channel?.trim() || "—"}`,
    `Priority: ${formatLeadPriorityDisplay(ctx.priority)}`,
    `Status: ${ctx.status?.trim() || "—"}`,
  ];
  if (ctx.city?.trim()) parts.push(`City: ${ctx.city.trim()}`);
  if (ctx.notes?.trim()) parts.push(`CRM notes: ${ctx.notes.trim()}`);
  if (ctx.conversationSnippet?.trim()) parts.push(`Snippet: ${ctx.conversationSnippet.trim()}`);
  return parts.join("\n");
}

export function buildLeadAssistantSystemPrompt(
  leadContext: LeadReplyContext,
  language: AssistantLanguage,
): string {
  return `You are an expert sales assistant embedded in a mobile CRM. You help the salesperson draft replies, handle objections, and plan next steps.

Style:
- Practical, concise, persuasive but honest — no fabricated discounts, meetings, or policies.
- Prefer short paragraphs or bullet-style lines that work well on WhatsApp and email.
- When suggesting a customer-facing message, make it copy-ready (plain text, no markdown headings).

${languageInstruction(language)}

Current lead:
${leadContextBlock(leadContext)}`;
}

export type LeadAssistantChatDeps = {
  complete: typeof createChatCompletion;
};

const defaultDeps: LeadAssistantChatDeps = {
  complete: createChatCompletion,
};

/**
 * One assistant turn: prior user/assistant history + new user message → assistant reply text.
 * `history` must not include the new user message.
 */
export async function completeLeadAssistantTurn(
  config: OpenAIClientConfig,
  input: {
    leadContext: LeadReplyContext;
    language: AssistantLanguage;
    /** Prior turns only (user + assistant), chronological order. */
    history: ChatMessage[];
    userMessage: string;
  },
  deps: LeadAssistantChatDeps = defaultDeps,
): Promise<string> {
  const system = buildLeadAssistantSystemPrompt(input.leadContext, input.language);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...input.history,
    { role: "user", content: input.userMessage.trim() },
  ];
  try {
    return await deps.complete(config, messages, { maxTokens: 700, temperature: 0.45 });
  } catch (e) {
    logAiError("leadAssistant.completeTurn", e, {
      language: input.language,
      historyTurns: input.history.length,
    });
    throw e;
  }
}
