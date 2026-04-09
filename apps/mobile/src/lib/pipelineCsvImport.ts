import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLeadPriorityForDb } from "./leadPriority";

/** Matches Add Lead default workspace placeholder. */
export const PIPELINE_IMPORT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

const EXPECTED_HEADERS = ["name", "phone", "email", "city", "priority", "source", "notes"] as const;

export type ValidImportRow = {
  name: string;
  phone: string;
  email: string;
  city: string;
  rawPriority: string;
  rawSource: string;
  notes: string;
};

/** Split one CSV line; supports double-quoted fields and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parsePipelineImportCsv(text: string): { headers: string[]; dataRows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], dataRows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const dataRows = lines.slice(1).map((line) => splitCsvLine(line));
  return { headers, dataRows };
}

function headerIndexMap(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if ((EXPECTED_HEADERS as readonly string[]).includes(h)) {
      idx[h] = i;
    }
  }
  return idx;
}

function cell(row: string[], idx: Record<string, number>, key: string): string {
  const i = idx[key];
  if (i === undefined || i < 0 || i >= row.length) return "";
  return String(row[i] ?? "").trim();
}

/**
 * Maps CSV source labels to DB `source_channel` (constraint: whatsapp | instagram | facebook | manual | other).
 * Referral / cold_call → manual (same as Add Lead).
 */
export function normalizeSourceChannelForDb(raw: string): "whatsapp" | "instagram" | "facebook" | "manual" | "other" {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (s === "whatsapp" || s === "wa") return "whatsapp";
  if (s === "instagram" || s === "ig") return "instagram";
  if (s === "facebook" || s === "fb") return "facebook";
  if (s === "referral" || s === "cold_call" || s === "cold-call") return "manual";
  if (s === "manual") return "manual";
  if (s === "other") return "other";
  return "manual";
}

export function validateAndNormalizeImportRows(
  headers: string[],
  dataRows: string[][],
): { valid: ValidImportRow[]; skippedCount: number } {
  const idx = headerIndexMap(headers);
  let skipped = 0;
  const valid: ValidImportRow[] = [];

  for (const row of dataRows) {
    const name = cell(row, idx, "name");
    const phone = cell(row, idx, "phone");
    if (!name || !phone) {
      skipped++;
      continue;
    }
    if (name.length < 2) {
      skipped++;
      continue;
    }
    valid.push({
      name,
      phone,
      email: cell(row, idx, "email"),
      city: cell(row, idx, "city"),
      rawPriority: cell(row, idx, "priority"),
      rawSource: cell(row, idx, "source"),
      notes: cell(row, idx, "notes"),
    });
  }
  return { valid, skippedCount: skipped };
}

export function buildLeadInsertPayload(
  row: ValidImportRow,
  profileId: string,
  workspaceId: string,
): Record<string, unknown> {
  return {
    name: row.name,
    phone: row.phone,
    email: row.email || null,
    city: row.city || null,
    priority: normalizeLeadPriorityForDb(row.rawPriority),
    source_channel: normalizeSourceChannelForDb(row.rawSource),
    notes: row.notes || null,
    status: "new",
    created_by: profileId,
    workspace_id: workspaceId,
  };
}

const BATCH_SIZE = 50;

export async function batchInsertImportedLeads(
  supabase: SupabaseClient,
  rows: ValidImportRow[],
  profileId: string,
  workspaceId: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows
      .slice(i, i + BATCH_SIZE)
      .map((r) => buildLeadInsertPayload(r, profileId, workspaceId));
    const { error } = await supabase.from("leads").insert(chunk);
    if (error) throw new Error(error.message);
  }
}
