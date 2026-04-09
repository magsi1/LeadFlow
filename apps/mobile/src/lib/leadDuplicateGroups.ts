import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnlyPhone } from "./whatsapp";

export type LeadDuplicateRow = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string | null;
};

export type DuplicateGroup = {
  key: string;
  displayName: string;
  displayPhone: string;
  leads: LeadDuplicateRow[];
};

/** Stable key when both name and normalized phone are present; otherwise duplicates cannot be grouped. */
export function duplicateGroupingKey(name: string | null | undefined, phone: string | null | undefined): string | null {
  const n = typeof name === "string" ? name.trim().toLowerCase() : "";
  const d = digitsOnlyPhone(phone);
  if (!n || !d) return null;
  return `${n}::${d}`;
}

function compareCreated(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
}

/**
 * Groups leads with identical name (case-insensitive trim) + same normalized phone (digits).
 * Only groups with 2+ rows are returned; leads ordered oldest `created_at` first within each group.
 */
export function buildDuplicateGroups(rows: LeadDuplicateRow[]): DuplicateGroup[] {
  const map = new Map<string, LeadDuplicateRow[]>();
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id) continue;
    const k = duplicateGroupingKey(row.name, row.phone);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  const out: DuplicateGroup[] = [];
  for (const [key, leads] of map) {
    if (leads.length < 2) continue;
    leads.sort((a, b) => compareCreated(a.created_at, b.created_at));
    const first = leads[0];
    out.push({
      key,
      displayName: typeof first?.name === "string" && first.name.trim() ? first.name.trim() : "—",
      displayPhone: typeof first?.phone === "string" && first.phone.trim() ? first.phone.trim() : "—",
      leads,
    });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return out;
}

/** Total “extra” rows that could be removed (one keeper per group). */
export function countPossibleDuplicateExtras(groups: DuplicateGroup[]): number {
  return groups.reduce((sum, g) => sum + Math.max(0, g.leads.length - 1), 0);
}

/** Fetch all leads visible under RLS, oldest first (for deterministic grouping). */
export async function fetchLeadsForDuplicateScan(supabase: SupabaseClient): Promise<LeadDuplicateRow[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,phone,created_at")
    .order("created_at", { ascending: true })
    .limit(25_000);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LeadDuplicateRow[];
  return rows.filter((r) => typeof r.id === "string" && r.id.length > 0);
}

export async function fetchDuplicateGroups(supabase: SupabaseClient): Promise<DuplicateGroup[]> {
  const rows = await fetchLeadsForDuplicateScan(supabase);
  return buildDuplicateGroups(rows);
}
