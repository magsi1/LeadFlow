export type UserRole = "admin" | "manager" | "salesperson";

export const ChannelType = {
  WHATSAPP: "WHATSAPP",
  INSTAGRAM: "INSTAGRAM",
  FACEBOOK: "FACEBOOK",
  WEBSITE_CHAT: "WEBSITE_CHAT",
} as const;

export type ChannelTypeValue = (typeof ChannelType)[keyof typeof ChannelType];

/** Aligns with Nest/Prisma `LeadStatus` JSON payloads. */
export const LeadStatus = {
  NEW: "NEW",
  QUALIFYING: "QUALIFYING",
  ASSIGNED: "ASSIGNED",
  NURTURING: "NURTURING",
  WON: "WON",
  LOST: "LOST",
} as const;

export type LeadStatusValue = (typeof LeadStatus)[keyof typeof LeadStatus];

export type LeadDto = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  sourceChannel: ChannelTypeValue;
  status: LeadStatusValue;
  buyingIntent?: "HOT" | "WARM" | "COLD";
  assignedToId?: string;
  score?: number;
  createdAt: string;
};

export type AnalyticsTotals = {
  totalLeads: number;
  /** Leads with `priority` = `high` (stored lowercase in Postgres). */
  highPriorityLeads: number;
  wonLeads: number;
  followUpsDue: number;
  /** Leads whose `created_at` is on or after local midnight today. */
  leadsToday: number;
};

/** Pipeline buckets for dashboard: `qualified` includes `proposal_sent`; `closed` is won + lost. */
export type DashboardStatusBreakdown = {
  new: number;
  contacted: number;
  qualified: number;
  closed: number;
};

/** Counts by stored priority (`high` / `medium` / `low`, including legacy hot/warm/cold in queries). */
export type DashboardPriorityBreakdown = {
  high: number;
  medium: number;
  low: number;
};

export type DashboardSourceBreakdown = {
  channel: string;
  label: string;
  count: number;
}[];

/** Sum of `deal_value` per pipeline stage (open pipeline, not time-filtered). */
export type DashboardPipelineValueByStage = {
  new: number;
  contacted: number;
  qualified: number;
  closed: number;
};

export type AnalyticsDashboard = {
  totals: AnalyticsTotals;
  /** Win rate among closed deals: won ÷ (won + lost) × 100. `null` when there are no won or lost leads yet. */
  conversionRate: number | null;
  byStatus: DashboardStatusBreakdown;
  byPriority: DashboardPriorityBreakdown;
  bySource: DashboardSourceBreakdown;
  /** Optional: filled from Supabase `deal_value` sums by stage. */
  pipelineValueByStage?: DashboardPipelineValueByStage | null;
  /** Primary currency label for pipeline value (e.g. PKR). */
  pipelineDealCurrency?: string | null;
};

export type FollowUpItem = {
  id: string;
  dueAt: string;
  note?: string;
  lead?: LeadDto | null;
};

/** Row shape from `public.leads` (Supabase). */
export type InboxLeadRow = {
  id: string;
  name: string | null;
  phone?: string | null;
  email?: string | null;
  /** `public.leads.source` (channel/origin label). */
  source?: string | null;
  /** Preferred when present (matches `source_channel` in DB). */
  source_channel?: string | null;
  status?: string | null;
  priority?: string | null;
  notes?: string | null;
  city?: string | null;
  workspace_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  next_follow_up_at?: string | null;
  /** 0–100 AI-style score (computed client-side, persisted in Supabase). */
  lead_score?: number | null;
  /** Breakdown rows for the score (JSON from `score_reasons`). */
  score_reasons?: unknown;
  deal_value?: number | null;
  deal_currency?: string | null;
};
