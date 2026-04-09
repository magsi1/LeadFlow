import { getSupabaseClient } from "../lib/supabaseClient";
import type { LeadReplyContext } from "./ai/types";
import type { AssistantLanguage, LeadAiMessageRow, LeadAiThreadRow } from "../types/leadAssistant";

type LeadSummaryRow = {
  id: string;
  name: string | null;
  workspace_id: string | null;
  source: string | null;
  status: string | null;
  priority: string | null;
  notes: string | null;
  city: string | null;
};

function rowToLeadContext(row: LeadSummaryRow): LeadReplyContext {
  return {
    leadName: row.name,
    channel: row.source?.replace(/_/g, " ") ?? undefined,
    priority: row.priority ?? undefined,
    status: row.status?.replace(/_/g, " ") ?? undefined,
    notes: row.notes,
    city: row.city,
  };
}

export async function fetchLeadSummaryForAssistant(leadId: string): Promise<{
  context: LeadReplyContext;
  workspaceId: string | null;
}> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,workspace_id,source,status,priority,notes,city")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead not found.");
  const row = data as LeadSummaryRow;
  return { context: rowToLeadContext(row), workspaceId: row.workspace_id };
}

export async function getOrCreateThread(
  leadId: string,
  userId: string,
  workspaceId: string | null,
): Promise<LeadAiThreadRow> {
  const supabase = getSupabaseClient();
  const { data: existing, error: selErr } = await supabase
    .from("lead_ai_threads")
    .select("*")
    .eq("lead_id", leadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing as LeadAiThreadRow;

  const { data: inserted, error: insErr } = await supabase
    .from("lead_ai_threads")
    .insert({
      lead_id: leadId,
      user_id: userId,
      workspace_id: workspaceId,
      preferred_language: "auto",
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  return inserted as LeadAiThreadRow;
}

export async function fetchThreadMessages(threadId: string): Promise<LeadAiMessageRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("lead_ai_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadAiMessageRow[];
}

export async function insertThreadMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
): Promise<LeadAiMessageRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("lead_ai_messages")
    .insert({ thread_id: threadId, role, content })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LeadAiMessageRow;
}

export async function updateThreadLanguage(threadId: string, language: AssistantLanguage): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("lead_ai_threads").update({ preferred_language: language }).eq("id", threadId);
  if (error) throw new Error(error.message);
}
