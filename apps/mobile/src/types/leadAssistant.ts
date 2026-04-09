import type { AssistantLanguage } from "../services/ai/leadAssistantChat";
import type { LeadReplyContext } from "../services/ai/types";

export type { AssistantLanguage };

export type LeadAiThreadRow = {
  id: string;
  lead_id: string;
  user_id: string;
  workspace_id: string | null;
  preferred_language: AssistantLanguage;
  created_at: string;
  updated_at: string;
};

export type LeadAiMessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type LeadAssistantBundle = {
  thread: LeadAiThreadRow;
  messages: LeadAiMessageRow[];
  leadContext: LeadReplyContext;
};
