/** Row shape for Settings data-quality scans. */
export type DataMgmtLeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  created_at: string | null;
};

export type SettingsDuplicateCluster = {
  id: string;
  headline: string;
  leads: DataMgmtLeadRow[];
};

function phoneDedupKey(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 5 ? d : null;
}

function sortByCreated(a: DataMgmtLeadRow, b: DataMgmtLeadRow): number {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return ta - tb;
}

/** Pipeline-style label for export / settings. */
export function formatLeadStageLabel(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return "—";
  const m: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal_sent: "Proposal sent",
    won: "Won",
    lost: "Lost",
  };
  return m[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
}

/**
 * Groups leads that share the same normalized phone (5+ digits), at least two rows per group.
 * Does not merge by name + location (Settings “Duplicate leads” uses phone only).
 */
export function buildPhoneDuplicateClusters(rows: DataMgmtLeadRow[]): SettingsDuplicateCluster[] {
  const phoneBuckets = new Map<string, DataMgmtLeadRow[]>();
  for (const r of rows) {
    if (typeof r.id !== "string" || !r.id) continue;
    const pk = phoneDedupKey(r.phone);
    if (pk) {
      if (!phoneBuckets.has(pk)) phoneBuckets.set(pk, []);
      phoneBuckets.get(pk)!.push(r);
    }
  }
  const out: SettingsDuplicateCluster[] = [];
  let i = 0;
  for (const [digits, list] of phoneBuckets) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(sortByCreated);
    const label = sorted.find((l) => l.phone?.trim())?.phone?.trim() ?? digits;
    out.push({
      id: `phone-cluster-${i++}`,
      headline: `Same phone: ${label}`,
      leads: sorted,
    });
  }
  out.sort((a, b) => a.headline.localeCompare(b.headline, undefined, { sensitivity: "base" }));
  return out;
}

/** Order leads with chosen primary first, then the rest by created_at. */
export function orderClusterLeadsWithPrimary(
  cluster: SettingsDuplicateCluster,
  primaryId: string,
): DataMgmtLeadRow[] {
  const primary = cluster.leads.find((l) => l.id === primaryId);
  const rest = cluster.leads.filter((l) => l.id !== primaryId).sort(sortByCreated);
  return primary ? [primary, ...rest] : [...cluster.leads].sort(sortByCreated);
}

export function defaultPrimaryId(cluster: SettingsDuplicateCluster): string {
  const sorted = [...cluster.leads].sort(sortByCreated);
  return sorted[0]?.id ?? "";
}
