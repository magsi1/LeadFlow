/**
 * Proxies OpenAI chat completions for authenticated Supabase users.
 * Set secret: `supabase secrets set OPENAI_API_KEY=sk-...`
 *
 * Invoke: POST /functions/v1/ai-chat-completion
 * Headers: Authorization: Bearer <user_access_token>
 * Body: { messages, model?, temperature?, max_tokens? }
 * Response: { text: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type ChatMessage = { role: string; content: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isChatMessage(x: unknown): x is ChatMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  const role = m.role;
  const content = m.content;
  return (
    typeof role === "string" &&
    ["system", "user", "assistant"].includes(role) &&
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= 100_000
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !anonKey) {
    return json(500, { error: "Server misconfigured (Supabase)" });
  }
  if (!openaiKey?.trim()) {
    return json(500, { error: "Server misconfigured (OPENAI_API_KEY)" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Missing Authorization bearer token" });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return json(401, { error: "Invalid or expired session" });
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const messagesRaw = rawBody.messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0 || messagesRaw.length > 24) {
    return json(400, { error: "messages must be a non-empty array (max 24 turns)" });
  }
  const messages: ChatMessage[] = [];
  for (const m of messagesRaw) {
    if (!isChatMessage(m)) {
      return json(400, { error: "Invalid message shape" });
    }
    messages.push({ role: m.role, content: m.content });
  }

  const model =
    typeof rawBody.model === "string" && rawBody.model.trim().length > 0
      ? rawBody.model.trim().slice(0, 80)
      : "gpt-4o-mini";
  const temperature =
    typeof rawBody.temperature === "number" && Number.isFinite(rawBody.temperature)
      ? Math.min(2, Math.max(0, rawBody.temperature))
      : 0.55;
  const max_tokens =
    typeof rawBody.max_tokens === "number" && Number.isFinite(rawBody.max_tokens)
      ? Math.min(8192, Math.max(1, Math.floor(rawBody.max_tokens)))
      : 450;

  let oaRes: Response;
  try {
    oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });
  } catch (e) {
    console.error("[ai-chat-completion] OpenAI fetch failed", e);
    return json(502, { error: "Could not reach AI provider" });
  }

  const oaText = await oaRes.text();
  let oaJson: {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  try {
    oaJson = JSON.parse(oaText) as typeof oaJson;
  } catch {
    return json(502, { error: "Invalid response from AI provider" });
  }

  if (!oaRes.ok) {
    const msg = oaJson.error?.message ?? oaText.slice(0, 200);
    return json(oaRes.status >= 500 ? 502 : 400, { error: msg || "OpenAI request failed" });
  }

  const text = oaJson.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return json(502, { error: "Empty completion" });
  }

  return json(200, { text });
});
