import { getSupabaseAdmin, applyCors } from "../../../lib/supabaseAdmin";

/** Map dashboard UI statuses → Supabase `leads.status` constraint values. */
function mapUiStatusToDb(ui) {
  const s = String(ui ?? "")
    .toLowerCase()
    .trim();
  if (s === "closed") return "won";
  if (s === "contacted") return "contacted";
  return "new";
}

/**
 * PUT /api/leads/[id]
 * Body: { status: 'new' | 'contacted' | 'closed' }
 */
export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const id = req.query.id;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ ok: false, error: "Missing lead id" });
  }

  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }

  const dbStatus = mapUiStatusToDb(body?.status);
  console.log("[leadflow/api/leads/:id] PUT", { id, dbStatus });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .update({
        status: dbStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[leadflow/api/leads/:id] update error:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e && typeof e === "object" && "code" in e ? e.code : undefined;
    if (code === "CONFIG") {
      return res.status(500).json({ ok: false, error: "Server configuration error" });
    }
    console.error("[leadflow/api/leads/:id] unexpected:", msg, e);
    return res.status(500).json({ ok: false, error: msg || "Internal error" });
  }
}
