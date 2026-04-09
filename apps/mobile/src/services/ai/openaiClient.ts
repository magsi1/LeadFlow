import type { OpenAIClientConfig } from "./config";
import { OpenAIAPIError, OpenAIConfigurationError } from "./errors";
import { logAiError, logAiWarn } from "./log";
import type { ChatCompletionOptions, ChatMessage } from "./types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

type ProxySuccess = { text?: string };
type ProxyErrorBody = { error?: string };

type OpenAIChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

function getFunctionsChatUrl(): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new OpenAIConfigurationError("EXPO_PUBLIC_SUPABASE_URL is not set.");
  }
  return `${base}/functions/v1/ai-chat-completion`;
}

/**
 * Direct OpenAI Chat Completions (mobile key from EXPO_PUBLIC_OPENAI_API_KEY).
 */
async function createOpenAIDirectChatCompletion(
  apiKey: string,
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    logAiError("openaiClient.direct.fetch", e, { model });
    throw new OpenAIAPIError(
      "Couldn’t reach OpenAI. Check your internet connection and try again.",
      undefined,
    );
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (e) {
    logAiError("openaiClient.direct.responseBody", e, { status: response.status, model });
    throw new OpenAIAPIError("Could not read the AI response. Please try again.", response.status);
  }

  let parsed: OpenAIChatResponse;
  try {
    parsed = JSON.parse(raw) as OpenAIChatResponse;
  } catch (e) {
    logAiError("openaiClient.direct.jsonParse", e, {
      status: response.status,
      snippet: raw.slice(0, 400),
    });
    throw new OpenAIAPIError("Invalid response from OpenAI. Please try again.", response.status);
  }

  if (!response.ok) {
    const serverMsg = typeof parsed.error?.message === "string" ? parsed.error.message : "";
    logAiError("openaiClient.direct.httpError", new Error(serverMsg || `HTTP ${response.status}`), {
      status: response.status,
      model,
    });
    const friendly = userMessageForHttpStatus(response.status, serverMsg);
    throw new OpenAIAPIError(friendly || serverMsg || `OpenAI error (${response.status})`, response.status);
  }

  const text = typeof parsed.choices?.[0]?.message?.content === "string" ? parsed.choices[0].message.content.trim() : "";
  if (!text) {
    logAiWarn("openaiClient.direct.emptyText", "OpenAI returned empty content", {
      model,
      status: response.status,
      snippet: raw.slice(0, 400),
    });
    throw new OpenAIAPIError("The AI returned an empty reply. Try again or shorten your prompt.", response.status);
  }
  return text;
}

function userMessageForHttpStatus(status: number, serverMessage: string): string {
  if (status === 401 || status === 403) {
    return "AI access denied — sign in again and retry.";
  }
  if (status === 429) {
    return "Too many AI requests. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "The AI service is temporarily unavailable. Try again shortly.";
  }
  if (status === 400 || status === 404) {
    return "The AI request could not be completed. Try again.";
  }
  const trimmed = serverMessage.trim();
  if (trimmed.length > 0 && trimmed.length <= 160) {
    return trimmed;
  }
  return `The AI service returned an error (${status}). Try again later.`;
}

/**
 * Chat completion: direct OpenAI when `config.openaiApiKey` is set; otherwise Supabase Edge Function `ai-chat-completion`.
 */
export async function createChatCompletion(
  config: OpenAIClientConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<string> {
  const model = options?.model ?? config.model ?? "gpt-4o-mini";
  const temperature = options?.temperature ?? 0.55;
  const maxTokens = options?.maxTokens ?? 450;

  if (config.openaiApiKey) {
    return createOpenAIDirectChatCompletion(config.openaiApiKey, messages, model, temperature, maxTokens);
  }

  const token = config.accessToken?.trim();
  if (!token) {
    throw new OpenAIConfigurationError("Missing session token for AI proxy, or set EXPO_PUBLIC_OPENAI_API_KEY.");
  }

  const url = getFunctionsChatUrl();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    logAiError("openaiClient.fetch", e, { url, model });
    throw new OpenAIAPIError(
      "Couldn’t reach the AI service. Check your internet connection and try again.",
      undefined,
    );
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (e) {
    logAiError("openaiClient.responseBody", e, { status: response.status, url });
    throw new OpenAIAPIError("Could not read the AI response. Please try again.", response.status);
  }

  let parsed: ProxySuccess & ProxyErrorBody;
  try {
    parsed = JSON.parse(raw) as ProxySuccess & ProxyErrorBody;
  } catch (e) {
    logAiError("openaiClient.jsonParse", e, {
      status: response.status,
      snippet: raw.slice(0, 400),
    });
    throw new OpenAIAPIError("Invalid response from the AI service. Please try again.", response.status);
  }

  if (!response.ok) {
    const serverMsg = typeof parsed.error === "string" ? parsed.error : "";
    logAiError("openaiClient.proxyError", new Error(serverMsg || `HTTP ${response.status}`), {
      status: response.status,
      model,
    });
    const friendly = userMessageForHttpStatus(response.status, serverMsg);
    throw new OpenAIAPIError(friendly, response.status);
  }

  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text) {
    logAiWarn("openaiClient.emptyText", "Proxy returned empty text", {
      model,
      status: response.status,
      snippet: raw.slice(0, 400),
    });
    throw new OpenAIAPIError("The AI returned an empty reply. Try again or shorten your prompt.", response.status);
  }
  return text;
}
