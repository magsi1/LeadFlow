import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeForIlike, parseYmdLocalEnd, parseYmdLocalStart } from "./smartBulkDelete";

export type ChatLeadEmbed = {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  priority: string | null;
};

export type ChatSearchMessageRow = {
  id: string;
  message: string;
  sender_type: string;
  sender_name: string | null;
  sent_at: string;
  lead_id: string;
  leads: ChatLeadEmbed | ChatLeadEmbed[] | null;
};

export type ChatSearchStageFilter = "all" | "new" | "contacted" | "qualified" | "closed";

export type ChatSearchFilters = {
  sender: "all" | "lead" | "user";
  dateFrom: string | null;
  dateTo: string | null;
  stage: ChatSearchStageFilter;
  hasPhoneOnly: boolean;
};

export const DEFAULT_CHAT_SEARCH_FILTERS: ChatSearchFilters = {
  sender: "all",
  dateFrom: null,
  dateTo: null,
  stage: "all",
  hasPhoneOnly: false,
};

export type GroupedChatSearch = {
  leadId: string;
  lead: ChatLeadEmbed | null;
  messages: ChatSearchMessageRow[];
};

function leadEmbed(leads: ChatLeadEmbed | ChatLeadEmbed[] | null | undefined): ChatLeadEmbed | null {
  if (leads == null) return null;
  return Array.isArray(leads) ? leads[0] ?? null : leads;
}

function normalizeLeadEmbed(row: ChatSearchMessageRow): ChatSearchMessageRow {
  const l = row.leads as ChatLeadEmbed | ChatLeadEmbed[] | null;
  if (Array.isArray(l)) {
    return { ...row, leads: l[0] ?? null };
  }
  return row;
}

function leadStageColumn(status: string | null | undefined): ChatSearchStageFilter {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "qualified" || s === "proposal_sent") return "qualified";
  if (s === "won" || s === "lost") return "closed";
  return "new";
}

/**
 * Split message for highlighting the first case-insensitive match of `query`.
 */
export function highlightMatch(
  text: string,
  query: string,
): { before: string; match: string; after: string } | null {
  const q = query.trim();
  if (!q) return null;
  const lower = text.toLowerCase();
  const qi = q.toLowerCase();
  const index = lower.indexOf(qi);
  if (index === -1) return null;
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + q.length),
    after: text.slice(index + q.length),
  };
}

export function groupChatSearchResults(rows: ChatSearchMessageRow[]): GroupedChatSearch[] {
  const normalized = rows.map(normalizeLeadEmbed);
  const map = new Map<string, { lead: ChatLeadEmbed | null; messages: ChatSearchMessageRow[] }>();
  for (const msg of normalized) {
    const lid = msg.lead_id;
    if (!lid) continue;
    if (!map.has(lid)) {
      const le = msg.leads as ChatLeadEmbed | null;
      map.set(lid, { lead: le, messages: [] });
    }
    map.get(lid)!.messages.push(msg);
  }
  const out: GroupedChatSearch[] = [];
  for (const [leadId, v] of map.entries()) {
    v.messages.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
    out.push({ leadId, lead: v.lead, messages: v.messages });
  }
  out.sort((a, b) => {
    const at = a.messages[0]?.sent_at ?? "";
    const bt = b.messages[0]?.sent_at ?? "";
    return new Date(bt).getTime() - new Date(at).getTime();
  });
  return out;
}

export async function searchChatHistory(
  supabase: SupabaseClient,
  query: string,
  filters: ChatSearchFilters,
): Promise<ChatSearchMessageRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const escaped = escapeForIlike(q);

  let req = supabase
    .from("lead_messages")
    .select(
      `
      id,
      message,
      sender_type,
      sender_name,
      sent_at,
      lead_id,
      leads (
        id,
        name,
        phone,
        city,
        status,
        priority
      )
    `,
    )
    .ilike("message", `%${escaped}%`)
    .order("sent_at", { ascending: false })
    .limit(150);

  if (filters.sender !== "all") {
    req = req.eq("sender_type", filters.sender);
  }
  if (filters.dateFrom?.trim()) {
    req = req.gte("sent_at", parseYmdLocalStart(filters.dateFrom.trim()).toISOString());
  }
  if (filters.dateTo?.trim()) {
    req = req.lte("sent_at", parseYmdLocalEnd(filters.dateTo.trim()).toISOString());
  }

  const { data, error } = await req;
  if (error) throw error;
  let rows = (data ?? []) as ChatSearchMessageRow[];
  rows = rows.map(normalizeLeadEmbed);

  if (filters.stage !== "all") {
    rows = rows.filter((r) => leadStageColumn(leadEmbed(r.leads)?.status) === filters.stage);
  }
  if (filters.hasPhoneOnly) {
    rows = rows.filter((r) => {
      const p = leadEmbed(r.leads)?.phone;
      return typeof p === "string" && p.trim().length > 0;
    });
  }

  return rows.slice(0, 50);
}
