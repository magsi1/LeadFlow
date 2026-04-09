import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Verification checklist (local dev):
 * [ ] console.log shows correct IP URL before fetch (Expo: saveLead.js)
 * [ ] Next.js terminal shows "API HIT" on every submission
 * [ ] Next.js terminal shows the received body
 * [ ] Supabase "leads" table receives a new row
 * [ ] Frontend shows success or a real error message (never silent)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  console.log("API HIT — /api/leads/create");

  try {
    const body = await request.json();
    console.log("Received body:", body);

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json(
        { error: "Server misconfigured: missing Supabase credentials" },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(url, serviceKey);

    // Map inbound payload to `leads` columns (body may include `message` → notes).
    const row = {
      name: body.name ?? "Website User",
      phone: body.phone || null,
      notes: body.message ?? body.notes ?? null,
      source_channel: body.source_channel ?? "other",
    };

    const { data, error } = await supabase.from("leads").insert([row]).select().single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    console.log("Inserted lead:", data);
    return NextResponse.json({ success: true, data }, { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("Unexpected error in /api/leads/create:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
