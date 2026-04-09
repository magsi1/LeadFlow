/** Maps CRM `leads.status` to dashboard pipeline buckets (same as kanban). */
export function mapLeadStatusToPipelineBucket(
  status: string | null | undefined,
): "new" | "contacted" | "qualified" | "closed" {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "qualified" || s === "proposal_sent") return "qualified";
  if (s === "won" || s === "lost") return "closed";
  return "new";
}

/** Parse user input; returns null if empty/invalid. */
export function parseDealValueInput(raw: string): number | null {
  const t = raw.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function coerceDealValue(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function formatDealCurrencyAmount(value: number, currency: string): string {
  const c = (currency || "PKR").trim() || "PKR";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c.length === 3 ? c : "PKR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${c} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
}

/** PKR with Indian-style grouping (e.g. PKR 5,00,000). */
export function formatPkrEnIn(value: number): string {
  const n = Math.round(Math.max(0, value));
  return `PKR ${n.toLocaleString("en-IN")}`;
}
