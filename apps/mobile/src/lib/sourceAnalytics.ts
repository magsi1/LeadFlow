import type { DashboardSourceBreakdown } from "../types/models";
import { getSourceLabel } from "./sourceLabels";

/** Display order: primary four, then Other only when it has leads. */
export const LEAD_SOURCE_ORDER = ["whatsapp", "instagram", "facebook", "manual", "other"] as const;

export type LeadSourceDisplay = {
  channel: string;
  label: string;
  count: number;
  /** 0–100, one decimal when needed */
  percentage: number;
};

/**
 * Group leads by source with percentages. Denominator is total leads across all channels.
 */
export function buildLeadSourceAnalytics(bySource: DashboardSourceBreakdown | null | undefined): LeadSourceDisplay[] {
  const list = Array.isArray(bySource) ? bySource : [];
  const totalLeads = list.reduce(
    (s, r) => s + (typeof r.count === "number" && Number.isFinite(r.count) ? r.count : 0),
    0,
  );

  const rows: LeadSourceDisplay[] = [];

  for (const ch of LEAD_SOURCE_ORDER) {
    const row = list.find((x) => x.channel === ch);
    const count = row && typeof row.count === "number" && Number.isFinite(row.count) ? row.count : 0;
    const label = getSourceLabel(ch);
    const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 1000) / 10 : 0;

    if (ch === "other" && count === 0) continue;

    rows.push({ channel: ch, label, count, percentage });
  }

  return rows;
}
