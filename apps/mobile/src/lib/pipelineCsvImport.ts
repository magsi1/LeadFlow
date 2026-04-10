import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceDealValue } from "./dealValue";
import { normalizeLeadPriorityForDb } from "./leadPriority";

/** Matches Add Lead default workspace placeholder. */
export const PIPELINE_IMPORT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

export type ValidImportRow = {
  name: string;
  phone: string;
  email: string;
  city: string;
  rawPriority: string;
  rawSource: string;
  rawStage: string;
  rawDealValue: string;
  rawScore: string;
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
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const dataRows = lines.slice(1).map((line) => splitCsvLine(line));
  return { headers, dataRows };
}

function normHeader(h: string): string {
  return h.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

const COL_ALIASES: { field: keyof Omit<ValidImportRow, "name"> | "name"; aliases: string[] }[] = [
  { field: "name", aliases: ["name", "full name", "customer name", "lead name", "fullname", "contact name"] },
  { field: "phone", aliases: ["phone", "mobile", "tel", "telephone", "cell", "phone number"] },
  { field: "email", aliases: ["email", "e-mail", "mail"] },
  { field: "city", aliases: ["city", "location", "town"] },
  { field: "rawStage", aliases: ["stage", "status", "pipeline", "pipeline stage", "lead stage"] },
  { field: "rawPriority", aliases: ["priority"] },
  {
    field: "rawDealValue",
    aliases: ["deal value", "deal_value", "value", "amount", "deal", "deal amount", "pk value"],
  },
  { field: "rawScore", aliases: ["score", "lead score", "lead_score", "points", "lead points"] },
  { field: "rawSource", aliases: ["source", "channel", "origin", "source channel", "lead source"] },
  { field: "notes", aliases: ["notes", "description", "comments", "remarks", "note"] },
];

function resolveColumnIndices(headers: string[]): Record<string, number> {
  const norms = headers.map((h) => normHeader(h));
  const out: Record<string, number> = {};

  for (const { field, aliases } of COL_ALIASES) {
    let found = -1;
    for (const a of aliases) {
      const an = normHeader(a);
      const i = norms.findIndex((h) => h === an);
      if (i >= 0) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (const a of aliases) {
        const an = normHeader(a);
        if (an.length < 3) continue;
        const i = norms.findIndex((h) => h === an || h.includes(an) || an.includes(h));
        if (i >= 0) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) out[field] = found;
  }

  return out;
}

function cell(row: string[], idxMap: Record<string, number>, field: keyof ValidImportRow): string {
  const i = idxMap[field];
  if (i === undefined || i < 0 || i >= row.length) return "";
  return String(row[i] ?? "").trim();
}

/**
 * Maps CSV source labels to DB `source_channel`.
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

export function normalizeStageForDb(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!t) return "new";
  const allowed = new Set(["new", "contacted", "qualified", "proposal_sent", "won", "lost"]);
  if (allowed.has(t)) return t;
  if (t.includes("proposal")) return "proposal_sent";
  if (t.includes("qualif")) return "qualified";
  if (t.includes("contact")) return "contacted";
  if (t === "closed") return "contacted";
  if (t.includes("won")) return "won";
  if (t.includes("lost")) return "lost";
  if (t.includes("new")) return "new";
  return "new";
}

export function phoneKeyForDedup(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 5 ? d : null;
}

export function validateAndNormalizeImportRows(
  headers: string[],
  dataRows: string[][],
): { valid: ValidImportRow[]; skippedMissingName: number; missingNameColumn: boolean } {
  const idx = resolveColumnIndices(headers);
  if (idx.name === undefined) {
    return { valid: [], skippedMissingName: dataRows.length, missingNameColumn: true };
  }

  let skippedMissingName = 0;
  const valid: ValidImportRow[] = [];

  for (const row of dataRows) {
    const name = cell(row, idx, "name");
    if (!name || name.length < 1) {
      skippedMissingName++;
      continue;
    }
    valid.push({
      name,
      phone: cell(row, idx, "phone"),
      email: cell(row, idx, "email"),
      city: cell(row, idx, "city"),
      rawPriority: cell(row, idx, "rawPriority"),
      rawSource: cell(row, idx, "rawSource"),
      rawStage: cell(row, idx, "rawStage"),
      rawDealValue: cell(row, idx, "rawDealValue"),
      rawScore: cell(row, idx, "rawScore"),
      notes: cell(row, idx, "notes"),
    });
  }

  return { valid, skippedMissingName, missingNameColumn: false };
}

function parseScore(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 0 || r > 100) return null;
  return r;
}

export function buildLeadInsertPayload(
  row: ValidImportRow,
  profileId: string,
  workspaceId: string,
): Record<string, unknown> {
  const deal = coerceDealValue(row.rawDealValue);
  const score = parseScore(row.rawScore);
  const payload: Record<string, unknown> = {
    name: row.name,
    phone: row.phone?.trim() ? row.phone.trim() : null,
    email: row.email?.trim() ? row.email.trim() : null,
    city: row.city?.trim() ? row.city.trim() : null,
    priority: normalizeLeadPriorityForDb(row.rawPriority),
    source_channel: normalizeSourceChannelForDb(row.rawSource),
    status: normalizeStageForDb(row.rawStage),
    notes: row.notes?.trim() ? row.notes.trim() : null,
    created_by: profileId,
    workspace_id: workspaceId,
  };
  if (deal > 0) payload.deal_value = deal;
  if (score != null) payload.lead_score = score;
  return payload;
}

async function fetchExistingPhoneKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const set = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  for (; ;) {
    const { data, error } = await supabase.from("leads").select("phone").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    if (batch.length === 0) break;
    for (const r of batch) {
      const k = phoneKeyForDedup((r as { phone?: string | null }).phone);
      if (k) set.add(k);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return set;
}

const BATCH_SIZE = 40;

export type BatchInsertResult = {
  inserted: number;
  skippedDuplicate: number;
};

/**
 * Inserts rows; skips when phone matches existing DB or earlier row in this file.
 */
export async function batchInsertImportedLeads(
  supabase: SupabaseClient,
  rows: ValidImportRow[],
  profileId: string,
  workspaceId: string,
  options?: { onProgress?: (processed: number, total: number) => void },
): Promise<BatchInsertResult> {
  const existing = await fetchExistingPhoneKeys(supabase);
  const seenInFile = new Set<string>();
  const toInsert: ValidImportRow[] = [];
  let skippedDuplicate = 0;

  for (const row of rows) {
    const k = phoneKeyForDedup(row.phone);
    if (k) {
      if (existing.has(k) || seenInFile.has(k)) {
        skippedDuplicate++;
        continue;
      }
      seenInFile.add(k);
    }
    toInsert.push(row);
  }

  const total = toInsert.length;
  options?.onProgress?.(0, total);

  let inserted = 0;
  let processedRows = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE).map((r) => buildLeadInsertPayload(r, profileId, workspaceId));
    const { error } = await supabase.from("leads").insert(chunk);
    if (error) throw new Error(error.message);
    inserted += chunk.length;
    processedRows += chunk.length;
    options?.onProgress?.(processedRows, total);
  }

  if (total === 0) {
    options?.onProgress?.(0, 0);
  }

  return { inserted, skippedDuplicate };
}
