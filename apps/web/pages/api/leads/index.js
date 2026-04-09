import { getSupabaseAdmin, applyCors } from "../../../lib/supabaseAdmin";

/**
 * GET /api/leads
 * Returns recent leads for dashboard (service role — keep behind your own auth in production).
 */
export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  console.log("[leadflow/api/leads] list requested");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,phone,status,created_at,message,notes,source_channel")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[leadflow/api/leads] Supabase select error:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log("[leadflow/api/leads] returning", Array.isArray(data) ? data.length : 0, "rows");
    return res.status(200).json({ ok: true, data: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e && typeof e === "object" && "code" in e ? e.code : undefined;
    if (code === "CONFIG") {
      return res.status(500).json({ ok: false, error: "Server configuration error" });
    }
    console.error("[leadflow/api/leads] unexpected:", msg, e);
    return res.status(500).json({ ok: false, error: msg || "Internal error" });
  }
}
