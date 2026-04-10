import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { coerceDealValue } from "./dealValue";
import { formatLeadPriorityDisplay } from "./leadPriority";
import { getSourceLabel } from "./sourceLabels";
import { getSupabaseClient } from "./supabaseClient";
import type { InboxLeadRow } from "../types/models";

/** Export columns (order matches import template). */
export const LEAD_CSV_COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "City",
  "Stage",
  "Priority",
  "Deal Value",
  "Score",
  "Source",
  "Created At",
  "Last Contact",
  "Notes",
] as const;

const PAGE_SIZE = 1000;

export function escapeCsvField(raw: string): string {
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
 * Fetch every lead row (paginated).
 */
export async function fetchAllLeadsForExport(): Promise<InboxLeadRow[]> {
  const supabase = getSupabaseClient();
  const select =
    "id,name,phone,email,source,source_channel,status,priority,notes,city,created_at,updated_at,next_follow_up_at,lead_score,score_reasons,deal_value,deal_currency";
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

function dealValueCell(lead: InboxLeadRow): string {
  const v = coerceDealValue(lead.deal_value);
  if (v <= 0) return "";
  return String(Math.round(v * 100) / 100);
}

function scoreCell(lead: InboxLeadRow): string {
  const s = lead.lead_score;
  if (typeof s === "number" && Number.isFinite(s)) return String(Math.round(s));
  return "";
}

export function buildLeadsCsv(leads: InboxLeadRow[]): string {
  const lines: string[] = [LEAD_CSV_COLUMNS.join(",")];
  for (const lead of leads) {
    const row = [
      escapeCsvField((lead.name ?? "").trim()),
      escapeCsvField(String(lead.phone ?? "").trim()),
      escapeCsvField(String(lead.email ?? "").trim()),
      escapeCsvField((lead.city ?? "").trim()),
      escapeCsvField(stageLabelForCsvExport(lead.status)),
      escapeCsvField(formatLeadPriorityDisplay(lead.priority)),
      escapeCsvField(dealValueCell(lead)),
      escapeCsvField(scoreCell(lead)),
      escapeCsvField(getSourceLabel(lead.source_channel ?? lead.source)),
      escapeCsvField(formatCsvDateTime(lead.created_at)),
      escapeCsvField(formatCsvDateTime(lead.updated_at)),
      escapeCsvField((lead.notes ?? "").trim()),
    ];
    lines.push(row.join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

/** Browser download (web only). */
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

/** Write CSV to cache and open share sheet (iOS / Android). */
export async function shareCsvFileNative(csv: string, filename: string): Promise<void> {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) throw new Error("No writable directory for export.");
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${base}${safeName}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(path, {
    mimeType: "text/csv",
    dialogTitle: "Export leads",
    UTI: "public.comma-separated-values-text",
  });
}

export async function downloadOrShareCsv(csv: string, filename: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    downloadCsvInBrowser(csv, filename);
    return;
  }
  await shareCsvFileNative(csv, filename);
}

export function leadflowExportFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `leadflow-export-${y}-${m}-${day}.csv`;
}

export function leadflowImportTemplateFilename(): string {
  return "leadflow-import-template.csv";
}

/** Sample CSV with headers + 2 example rows (matches import column mapping). */
export function buildCsvImportTemplate(): string {
  const header = LEAD_CSV_COLUMNS.join(",");
  const example1 = [
    escapeCsvField("Ahmed Khan"),
    escapeCsvField("+923001234567"),
    escapeCsvField("ahmed@example.com"),
    escapeCsvField("Karachi"),
    escapeCsvField("New"),
    escapeCsvField("high"),
    escapeCsvField("500000"),
    escapeCsvField("72"),
    escapeCsvField("WhatsApp"),
    escapeCsvField(""),
    escapeCsvField(""),
    escapeCsvField("Interested in solar; follow up next week."),
  ].join(",");
  const example2 = [
    escapeCsvField("Sara Malik"),
    escapeCsvField("+923007654321"),
    escapeCsvField(""),
    escapeCsvField("Lahore"),
    escapeCsvField("Contacted"),
    escapeCsvField("medium"),
    escapeCsvField("0"),
    escapeCsvField("55"),
    escapeCsvField("Manual"),
    escapeCsvField(""),
    escapeCsvField(""),
    escapeCsvField(""),
  ].join(",");
  return `\uFEFF${header}\n${example1}\n${example2}\n`;
}
