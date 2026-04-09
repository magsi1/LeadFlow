import { getSupabaseClient } from "../lib/supabaseClient";

export type LeadAiGeneratedReplyRow = {
  id: string;
  lead_id: string;
  user_id: string;
  workspace_id: string | null;
  reply_body: string;
  model: string | null;
  created_at: string;
};

export async function saveLeadAiGeneratedReply(input: {
  leadId: string;
  workspaceId: string | null;
  /** Stored as `reply_body` in `public.lead_ai_generated_replies`. */
  content?: string;
  replyBody?: string;
  model: string | null;
}): Promise<LeadAiGeneratedReplyRow> {
  const text = (input.content ?? input.replyBody ?? "").trim();
  if (!text) {
    throw new Error("Cannot save an empty AI reply.");
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("lead_ai_generated_replies")
    .insert({
      lead_id: input.leadId,
      workspace_id: input.workspaceId,
      reply_body: text,
      model: input.model,
    })
    .select("*")
    .single();
  if (error) {
    const detail = error.details ? ` ${error.details}` : "";
    throw new Error(`${error.message}${detail}`.trim());
  }
  return data as LeadAiGeneratedReplyRow;
}

export async function fetchLeadAiGeneratedReplies(leadId: string, limit = 20): Promise<LeadAiGeneratedReplyRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("lead_ai_generated_replies")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadAiGeneratedReplyRow[];
}

/** For Analytics dashboard — current user's replies in the last N days. */
export async function countMyAiRepliesInLastDays(days: number): Promise<number> {
  const supabase = getSupabaseClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { count, error } = await supabase
    .from("lead_ai_generated_replies")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
