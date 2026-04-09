import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(req) {
  const VERIFY_TOKEN = "leadflow_verify";

  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("Mode:", mode);
  console.log("Token:", token);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Verification failed", { status: 403 });
}

export async function POST(req) {
  const body = await req.json();

  console.log("Webhook received:", JSON.stringify(body, null, 2));

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message) {
    const phone = message.from;
    const text = message.text?.body;

    console.log("Incoming:", text);

    // 1. Save incoming message
    await supabase.from("messages").insert([
      {
        phone: phone,
        message: text,
        direction: "incoming",
      },
    ]);

    // 2. Generate AI reply
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful sales assistant." },
        { role: "user", content: text },
      ],
    });

    const reply = ai.choices[0].message.content;

    console.log("AI Reply:", reply);

    // 3. Save AI reply
    await supabase.from("messages").insert([
      {
        phone: phone,
        message: reply,
        direction: "outgoing",
      },
    ]);
  }

  return new Response("ok", { status: 200 });
}
