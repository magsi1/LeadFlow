/** User-facing labels for `public.leads.source_channel` (and legacy `source`) values. */
export const SOURCE_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  manual: "Manual",
  other: "Other",
  cold_call: "Cold Call",
  referral: "Referral",
};

export function getSourceLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const k = String(raw).trim().toLowerCase();
  return SOURCE_LABEL[k] ?? String(raw).trim();
}
