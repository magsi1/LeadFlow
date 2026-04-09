/** Canonical `public.leads.priority` / `public.conversations.priority` (lowercase at rest). */
export type LeadPriorityDb = "low" | "medium" | "high";

/** Normalize any UI/legacy value to lowercase low | medium | high before insert/update. */
export function normalizeLeadPriorityForDb(raw: string | null | undefined): LeadPriorityDb {
  const x = (raw ?? "").toLowerCase().trim();
  if (x === "low" || x === "cold") return "low";
  if (x === "medium" || x === "warm") return "medium";
  if (x === "high" || x === "hot") return "high";
  return "medium";
}

function titleCaseWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Consistent labels for cards and lists.
 * Maps DB low/medium/high and legacy cold/warm/hot (any casing) to Low / Medium / High.
 */
export function formatLeadPriorityDisplay(p: string | null | undefined): string {
  const raw = typeof p === "string" ? p.trim() : "";
  if (!raw) return "—";
  const x = raw.toLowerCase();
  if (x === "cold" || x === "low") return "Low";
  if (x === "warm" || x === "medium") return "Medium";
  if (x === "hot" || x === "high") return "High";
  return titleCaseWords(raw.replace(/_/g, " "));
}
