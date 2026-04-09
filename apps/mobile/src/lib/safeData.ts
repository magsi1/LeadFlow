import type { InboxLeadRow, LeadDto } from "../types/models";

/** Route / URL param that must be a non-empty string to load a lead. */
export function parseLeadIdParam(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/** ISO date → locale string, or fallback if missing/invalid. */
export function formatSafeDateTime(iso: string | null | undefined, emptyFallback = "—"): string {
  if (iso == null || String(iso).trim() === "") return emptyFallback;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return emptyFallback;
  return new Date(iso).toLocaleString();
}

/** Shown when `leads.name` (or equivalent) is missing or blank. */
export const LEAD_NAME_PLACEHOLDER = "No Name";

/** Display label for a lead name; use `isLeadNameMissing` to apply muted styling. */
export function leadDisplayName(name: string | null | undefined): string {
  const t = typeof name === "string" ? name.trim() : "";
  return t.length > 0 ? t : LEAD_NAME_PLACEHOLDER;
}

export function isLeadNameMissing(name: string | null | undefined): boolean {
  const t = typeof name === "string" ? name.trim() : "";
  return t.length === 0;
}

/** Inbox rows must have a real id to navigate and cache. */
export function filterValidInboxLeads(rows: InboxLeadRow[] | null | undefined): InboxLeadRow[] {
  if (!rows?.length) return [];
  return rows.filter((r) => typeof r?.id === "string" && r.id.trim().length > 0);
}

/** Assignment list: drop malformed entries. */
export function filterValidLeadDtos(rows: LeadDto[] | null | undefined): LeadDto[] {
  if (!rows?.length) return [];
  return rows.filter((r) => r != null && typeof r.id === "string" && r.id.trim().length > 0);
}
