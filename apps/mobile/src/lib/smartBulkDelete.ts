import type { SupabaseClient } from "@supabase/supabase-js";

export type SmartDeleteSource = "all" | "whatsapp" | "instagram" | "facebook" | "manual" | "referral" | "other";
export type SmartDeleteStage = "all" | "new" | "contacted" | "qualified" | "closed";
export type SmartDeletePriority = "all" | "high" | "medium" | "low";

export type SmartDeleteFilters = {
  fromYmd: string;
  toYmd: string;
  source: SmartDeleteSource;
  stage: SmartDeleteStage;
  priority: SmartDeletePriority;
  nameContains: string;
};

export function ymdLocalFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmdLocalStart(ymd: string): Date {
  const parts = ymd.split("-").map((x) => Number(x));
  const [y, m, d] = parts;
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date();
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function parseYmdLocalEnd(ymd: string): Date {
  const parts = ymd.split("-").map((x) => Number(x));
  const [y, m, d] = parts;
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date();
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function dayBoundsIsoFromFilter(f: SmartDeleteFilters): { startIso: string; endIso: string } {
  const start = parseYmdLocalStart(f.fromYmd);
  const end = parseYmdLocalEnd(f.toYmd);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Escape `%`, `_`, `\` for PostgreSQL LIKE / ILIKE. */
export function escapeForIlike(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function isValidYmdRange(fromYmd: string, toYmd: string): boolean {
  return fromYmd <= toYmd;
}

/**
 * Apply shared filters to a PostgREST query (must already be `.from("leads").select(...)`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySmartDeleteFilters(q: any, f: SmartDeleteFilters): any {
  const { startIso, endIso } = dayBoundsIsoFromFilter(f);
  let query = q.gte("created_at", startIso).lte("created_at", endIso);
  if (f.source !== "all") {
    query = query.eq("source_channel", f.source);
  }
  if (f.stage !== "all") {
    if (f.stage === "new") query = query.eq("status", "new");
    else if (f.stage === "contacted") query = query.eq("status", "contacted");
    else if (f.stage === "qualified") query = query.in("status", ["qualified", "proposal_sent"]);
    else if (f.stage === "closed") query = query.in("status", ["won", "lost"]);
  }
  if (f.priority !== "all") {
    query = query.eq("priority", f.priority);
  }
  const pat = f.nameContains.trim();
  if (pat.length > 0) {
    query = query.ilike("name", `%${escapeForIlike(pat)}%`);
  }
  return query;
}

export async function fetchAllMatchingLeadIds(supabase: SupabaseClient, f: SmartDeleteFilters): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    let q = supabase.from("leads").select("id");
    q = applySmartDeleteFilters(q, f);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (typeof r.id === "string" && r.id) ids.push(r.id);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}
