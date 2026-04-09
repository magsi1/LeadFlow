import type { SupabaseClient } from "@supabase/supabase-js";
import { PIPELINE_IMPORT_WORKSPACE_ID } from "./pipelineCsvImport";

export type WhatsAppGroupLeadRow = {
  name: string;
  phone: string | null;
  city: null;
  notes: string;
  source_channel: "whatsapp";
  priority: "medium";
  status: "new";
};

/** Substring used in notes for phone-only rows; also used to classify stats and import filters. */
export const WHATSAPP_PHONE_ONLY_NOTES_MARKER = "Phone-only contact, update name manually";

/**
 * WhatsApp group exports often prefix display names with `~`.
 * Apply to every extracted name before storing on the lead.
 */
export function cleanName(raw: string): string {
  return raw.replace(/^~\s*/, "").trim();
}

export function isWhatsAppPhoneOnlyLead(row: WhatsAppGroupLeadRow): boolean {
  return row.notes.includes(WHATSAPP_PHONE_ONLY_NOTES_MARKER);
}

export type WhatsAppImportStats = {
  nameAndPhone: number;
  nameOnly: number;
  phoneOnly: number;
  skipped: number;
};

export type ParseWhatsAppGroupChatResult =
  | { ok: true; leads: WhatsAppGroupLeadRow[]; stats: WhatsAppImportStats; lines: string[] }
  | { ok: false; error: "no_leads" };

/** One chat line extracted from an export for DB insert (lead_messages). */
export type ExtractedLeadMessage = {
  sender_type: "lead" | "user";
  sender_name: string;
  message: string;
  sent_at: string;
};

const MAX_MESSAGE_CHARS = 50_000;

/** `[date] Sender: body` — date formats vary by locale. */
const WHATSAPP_CHAT_LINE_RE = /^\[([^\]]+)\]\s*(.+?):\s*(.+)$/;

function parseWhatsAppChatTimestamp(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i,
  );
  if (!m) return null;
  const p1 = parseInt(m[1], 10);
  const p2 = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  const second = m[6] ? parseInt(m[6], 10) : 0;
  const ampm = m[7]?.toUpperCase();
  let month: number;
  let day: number;
  if (p1 > 12) {
    day = p1;
    month = p2;
  } else if (p2 > 12) {
    month = p1;
    day = p2;
  } else {
    month = p1;
    day = p2;
  }
  if (m[7]) {
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
  }
  const d = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildContactNameVariants(contactName: string): string[] {
  const t = contactName.trim();
  if (!t) return [];
  const cleaned = cleanName(t);
  const set = new Set<string>();
  set.add(t.toLowerCase());
  set.add(cleaned.toLowerCase());
  if (cleaned) set.add(`~${cleaned}`.toLowerCase());
  if (t.startsWith("~")) set.add(t.toLowerCase());
  return [...set];
}

/**
 * Scan all chat lines for messages from/to a contact (by display name) and the current user.
 */
export function extractLeadMessagesFromChat(
  lines: string[],
  contactName: string,
  yourName: string = "You",
): ExtractedLeadMessage[] {
  const messages: ExtractedLeadMessage[] = [];
  const nameVariants = buildContactNameVariants(contactName);
  const yourNorm = yourName.trim();
  const yourLower = yourNorm.toLowerCase();

  for (const line of lines) {
    const match = line.match(WHATSAPP_CHAT_LINE_RE);
    if (!match) continue;
    const [, timestampRaw, senderRaw, messageRaw] = match;
    const message = (messageRaw ?? "").trim();
    if (message.includes("was added")) continue;
    if (message.includes("end-to-end encrypted")) continue;
    if (message.includes("Messages and calls")) continue;
    if (message === (senderRaw ?? "").trim()) continue;

    const cleanSender = cleanName((senderRaw ?? "").trim());
    const sentAt = parseWhatsAppChatTimestamp(timestampRaw ?? "");
    if (!sentAt) continue;

    const senderLc = cleanSender.toLowerCase();
    const isLead = nameVariants.some((v) => v.length > 0 && senderLc === v);
    const isYou =
      (yourNorm.length > 0 && cleanSender === yourNorm) ||
      senderLc === "you" ||
      (yourLower.length > 0 && senderLc === yourLower);

    if (isLead || isYou) {
      const body = message.length > MAX_MESSAGE_CHARS ? message.slice(0, MAX_MESSAGE_CHARS) : message;
      messages.push({
        sender_type: isLead ? "lead" : "user",
        sender_name: cleanSender,
        message: body,
        sent_at: sentAt,
      });
    }
  }
  return messages;
}

const PHONE_LINE_RE = /(\+92\s?3\d{2}\s?\d{7}|\+92\s?3\d{9})/;
const PHONE_ON_LINE_RE = /(\+92\s?3\d{2}\s?\d{7}|\+92\s?3\d{9})/;

/** Max line distance to pair a name line with a phone “was added” line. */
const PROXIMITY_THRESHOLD = 5;

type NamedEntry = { lineIndex: number; name: string; sameLinePhone: string | null };
type PhoneEntry = { lineIndex: number; phone: string; matched: boolean };

function findClosestUnmatchedPhone(
  lineIndex: number,
  phoneEntries: PhoneEntry[],
  threshold: number,
): PhoneEntry | null {
  const candidates = phoneEntries
    .filter((p) => !p.matched && Math.abs(p.lineIndex - lineIndex) <= threshold)
    .sort((a, b) => {
      const da = Math.abs(a.lineIndex - lineIndex);
      const db = Math.abs(b.lineIndex - lineIndex);
      if (da !== db) return da - db;
      return a.lineIndex - b.lineIndex;
    });
  return candidates[0] ?? null;
}

function normalizePkPhone(raw: string): string {
  return raw.replace(/\s/g, "");
}

function isSkippedSystemLine(line: string): boolean {
  const l = line;
  if (l.includes("end-to-end encrypted")) return true;
  if (l.includes("Messages and calls")) return true;
  if (l.includes("Disappearing messages")) return true;
  if (l.includes("You created this group")) return true;
  if (l.includes("You were added")) return true;
  return false;
}

function looksLikePhoneName(s: string): boolean {
  return /^\+?[\d\s-]+$/.test(s.trim());
}

function baseNotesImported(): string {
  return "Imported from WhatsApp group";
}

function phoneOnlyNotes(): string {
  return `${baseNotesImported()}. ${WHATSAPP_PHONE_ONLY_NOTES_MARKER}.`;
}

function computeStats(leads: WhatsAppGroupLeadRow[]): Omit<WhatsAppImportStats, "skipped"> {
  let nameAndPhone = 0;
  let nameOnly = 0;
  let phoneOnly = 0;
  for (const l of leads) {
    if (isWhatsAppPhoneOnlyLead(l)) {
      phoneOnly += 1;
    } else if (!l.phone) {
      nameOnly += 1;
    } else {
      nameAndPhone += 1;
    }
  }
  return { nameAndPhone, nameOnly, phoneOnly };
}

/**
 * Parses a WhatsApp **group** export `.txt`: "was added" system lines → leads.
 */
export function parseWhatsAppGroupChatExport(text: string): ParseWhatsAppGroupChatResult {
  const lines = text.split(/\r?\n/);
  let skippedSystemLines = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (isSkippedSystemLine(raw)) skippedSystemLines += 1;
  }

  const leads: WhatsAppGroupLeadRow[] = [];
  const namedEntries: NamedEntry[] = [];
  const phoneEntries: PhoneEntry[] = [];

  const base = (): Omit<WhatsAppGroupLeadRow, "name" | "phone"> => ({
    city: null,
    notes: baseNotesImported(),
    source_channel: "whatsapp",
    priority: "medium",
    status: "new",
  });

  /** Pass 1 — named / business “was added” lines (index + name + optional phone on same line). */
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim() || isSkippedSystemLine(line)) continue;

    const nameAddedMatch =
      line.match(/~\s+(.+?):\s+~\s+.+?\s+was added/i) ||
      line.match(/]\s+(.+?):\s+~\s+.+?\s+was added/i);
    const bizAddedMatch = line.match(/]\s+(.+?):\s+(.+?)\s+was added\s*$/i);

    let rawName = "";
    if (nameAddedMatch?.[1]) {
      rawName = nameAddedMatch[1].trim();
    } else if (bizAddedMatch?.[2]) {
      rawName = bizAddedMatch[2].trim();
    }

    if (rawName) {
      const name = cleanName(rawName);
      if (looksLikePhoneName(name)) continue;
      if (name.length < 2) continue;
      if (name.toLowerCase().includes("was added")) continue;

      const phoneM = line.match(PHONE_ON_LINE_RE);
      const sameLinePhone = phoneM?.[1] ? normalizePkPhone(phoneM[1]) : null;

      namedEntries.push({ lineIndex, name, sameLinePhone });
    }
  }

  /** Pass 2 — every phone “was added” line (for proximity pairing + phone-only leftovers). */
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim() || isSkippedSystemLine(line)) continue;

    const phoneMatch = line.match(PHONE_LINE_RE);
    if (!phoneMatch?.[1]) continue;
    if (!/\bwas added\b/i.test(line)) continue;

    const phone = normalizePkPhone(phoneMatch[1]);
    phoneEntries.push({ lineIndex, phone, matched: false });
  }

  /** Pass 3 — pair each named row with closest unmatched phone within threshold (by line index). */
  namedEntries.sort((a, b) => a.lineIndex - b.lineIndex);
  for (const named of namedEntries) {
    const nearby = findClosestUnmatchedPhone(named.lineIndex, phoneEntries, PROXIMITY_THRESHOLD);
    let phone: string | null = null;
    if (nearby) {
      phone = nearby.phone;
      nearby.matched = true;
    } else if (named.sameLinePhone) {
      phone = named.sameLinePhone;
      const pe = phoneEntries.find(
        (p) => !p.matched && p.lineIndex === named.lineIndex && p.phone === named.sameLinePhone,
      );
      if (pe) pe.matched = true;
    }

    leads.push({
      ...base(),
      name: named.name,
      phone,
    });
  }

  /** Pass 4 — phone-only rows for phones not paired to a name. */
  for (const pe of phoneEntries) {
    if (pe.matched) continue;

    leads.push({
      ...base(),
      notes: phoneOnlyNotes(),
      name: pe.phone,
      phone: pe.phone,
    });
  }

  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  const uniqueLeads = leads.filter((l) => {
    if (l.phone) {
      if (seenPhones.has(l.phone)) return false;
      seenPhones.add(l.phone);
      return true;
    }
    const key = l.name.trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const { nameAndPhone, nameOnly, phoneOnly } = computeStats(uniqueLeads);
  const stats: WhatsAppImportStats = {
    nameAndPhone,
    nameOnly,
    phoneOnly,
    skipped: skippedSystemLines,
  };

  if (uniqueLeads.length === 0) return { ok: false, error: "no_leads" };
  return { ok: true, leads: uniqueLeads, stats, lines };
}

const BATCH = 50;
const MESSAGE_INSERT_BATCH = 50;

export type BatchInsertWhatsAppOptions = {
  /** Full chat lines (same order as export) — used to extract messages per imported lead. */
  chatLines?: string[];
  /** Your display name in the export (default "You"). */
  yourName?: string;
};

export async function batchInsertWhatsAppGroupLeads(
  supabase: SupabaseClient,
  rows: WhatsAppGroupLeadRow[],
  profileId: string,
  workspaceId: string = PIPELINE_IMPORT_WORKSPACE_ID,
  options?: BatchInsertWhatsAppOptions,
): Promise<void> {
  const chatLines = options?.chatLines;
  const yourName = options?.yourName ?? "You";

  for (let i = 0; i < rows.length; i += BATCH) {
    const sliceRows = rows.slice(i, i + BATCH);
    const chunk = sliceRows.map((r) => ({
      name: r.name,
      phone: r.phone || null,
      email: null,
      city: r.city,
      notes: r.notes.length > 500 ? r.notes.slice(0, 500) : r.notes,
      priority: r.priority,
      source_channel: r.source_channel,
      status: r.status,
      created_by: profileId,
      workspace_id: workspaceId,
    }));
    const { data: inserted, error } = await supabase.from("leads").insert(chunk).select("id");
    if (error) throw new Error(error.message);
    const ids = inserted ?? [];
    if (ids.length !== sliceRows.length) {
      throw new Error("Lead insert returned fewer rows than expected.");
    }

    if (!chatLines?.length) continue;

    for (let j = 0; j < ids.length; j++) {
      const row = sliceRows[j];
      const id = typeof ids[j]?.id === "string" ? ids[j].id : "";
      if (!row || !id) continue;

      const leadMessages = extractLeadMessagesFromChat(chatLines, row.name, yourName);
      if (leadMessages.length === 0) continue;

      const payloads = leadMessages.map((m) => ({
        lead_id: id,
        sender_type: m.sender_type,
        sender_name: m.sender_name.slice(0, 500),
        message: m.message,
        sent_at: m.sent_at,
        source: "whatsapp" as const,
      }));

      for (let k = 0; k < payloads.length; k += MESSAGE_INSERT_BATCH) {
        const msgChunk = payloads.slice(k, k + MESSAGE_INSERT_BATCH);
        const { error: msgErr } = await supabase.from("lead_messages").insert(msgChunk);
        if (msgErr) throw new Error(msgErr.message);
      }
    }
  }
}
