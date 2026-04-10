/**
 * Approximate “time in current stage” using `updated_at`, falling back to `created_at`.
 * Shown as compact suffix like `3d`.
 */
export function formatDaysInStageShort(lead: {
  updated_at?: string | null;
  created_at?: string | null;
}): string | null {
  const iso = (lead.updated_at?.trim() || lead.created_at?.trim()) ?? "";
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return `${Math.max(0, days)}d`;
}
