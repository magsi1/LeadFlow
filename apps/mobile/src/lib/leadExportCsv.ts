import { formatLeadPriorityDisplay } from "./leadPriority";
import { getSupabaseClient } from "./supabaseClient";
import type { InboxLeadRow } from "../types/models";

const CSV_COLUMNS = [
  "Name",
  "Location",
  "Priority",
  "Stage",
  "Phone",
  "Email",
  "Created Date",
  "Last Follow-up",
] as const;

const PAGE_SIZE = 1000;

function escapeCsvField(raw: string): string {
  const s = String(raw ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Human-readable pipeline stage for export. */
function stageLabelForCsvExport(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return "—";
  const map: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal_sent: "Proposal sent",
    won: "Won",
    lost: "Lost",
  };
  return map[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCsvDateTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "";
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Fetch every lead row (paginated). PostgREST default max row cap is avoided by using `.range`.
 */
export async function fetchAllLeadsForExport(): Promise<InboxLeadRow[]> {
  const supabase = getSupabaseClient();
  const select =
    "id,name,phone,email,source,status,priority,notes,city,created_at,next_follow_up_at";
  const out: InboxLeadRow[] = [];
  let from = 0;
  for (; ;) {
    const { data, error } = await supabase
      .from("leads")
      .select(select)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as InboxLeadRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

export function buildLeadsCsv(leads: InboxLeadRow[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const lead of leads) {
    const name = (lead.name ?? "").trim();
    const row = [
      escapeCsvField(name),
      escapeCsvField(lead.city?.trim() ?? ""),
      escapeCsvField(formatLeadPriorityDisplay(lead.priority)),
      escapeCsvField(stageLabelForCsvExport(lead.status)),
      escapeCsvField(String(lead.phone ?? "").trim()),
      escapeCsvField(String(lead.email ?? "").trim()),
      escapeCsvField(formatCsvDateTime(lead.created_at)),
      escapeCsvField(formatCsvDateTime(lead.next_follow_up_at)),
    ];
    lines.push(row.join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

/** Browser download (React Native Web / web only). */
export function downloadCsvInBrowser(csv: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function leadflowExportFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `leadflow-export-${y}-${m}-${day}.csv`;
}
