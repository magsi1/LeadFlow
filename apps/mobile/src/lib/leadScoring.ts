import { coerceDealValue } from "./dealValue";

export type ScoreReason = {
  label: string;
  points: number;
  emoji: string;
};

export type LeadScoreInput = {
  status: string;
  priority: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  source_channel: string | null;
};

function normalizeSourceChannelKey(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("whatsapp") || s === "wa") return "whatsapp";
  if (s.includes("referral")) return "referral";
  if (s.includes("instagram") || s === "ig") return "instagram";
  if (s.includes("facebook") || s === "fb") return "facebook";
  if (s.includes("cold")) return "cold_call";
  if (s === "manual" || s === "import") return "manual";
  return s;
}

/** Map DB status values to scoring stage keys. */
function stageKeyForScore(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "qualified" || s === "proposal_sent") return "qualified";
  if (s === "won") return "won";
  if (s === "lost") return "lost";
  return "new";
}

function priorityKeyForScore(priority: string | null | undefined): string {
  const p = (priority ?? "").toLowerCase().trim();
  if (p === "high" || p === "hot") return "high";
  if (p === "medium" || p === "warm") return "medium";
  if (p === "low" || p === "cold") return "low";
  return p || "low";
}

/** Notes: large-scale / budget-scale signals (Pakistan solar / commercial). */
const HIGH_VALUE_KEYWORDS = [
  "factory",
  "industrial",
  "commercial",
  "hospital",
  "school",
  "plaza",
  "building",
  "society",
  "lakh",
  "crore",
  "million",
  "kw",
  "kva",
  "system",
] as const;

const URGENCY_KEYWORDS = [
  "urgent",
  "asap",
  "jaldi",
  "abhi",
  "today",
  "kal",
  "this week",
  "immediately",
] as const;

const COMPETITOR_KEYWORDS = [
  "lesco",
  "wapda",
  "load shedding",
  "bijli",
  "other company",
  "quote",
  "price compare",
] as const;

const NEGATIVE_KEYWORDS = [
  "not interested",
  "busy",
  "later",
  "next month",
  "no budget",
  "expensive",
  "mehenga",
] as const;

function notesMatchAny(notesLower: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => notesLower.includes(k));
}

export function calculateLeadScore(lead: LeadScoreInput): { score: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  let score = 0;

  const stagePoints: Record<string, number> = {
    new: 10,
    contacted: 20,
    qualified: 30,
    won: 100,
    lost: 0,
  };
  const stageKey = stageKeyForScore(lead.status);
  const stageScore = stagePoints[stageKey] ?? 0;
  if (stageScore > 0) {
    score += stageScore;
    reasons.push({
      label: `Stage: ${lead.status || "—"}`,
      points: stageScore,
      emoji: "📊",
    });
  }

  const priorityPoints: Record<string, number> = {
    high: 25,
    medium: 15,
    low: 5,
  };
  const pk = priorityKeyForScore(lead.priority);
  const priorityScore = priorityPoints[pk] ?? 0;
  score += priorityScore;
  reasons.push({
    label: `Priority: ${lead.priority || "—"}`,
    points: priorityScore,
    emoji: "🎯",
  });

  if (lead.phone?.trim()) {
    score += 15;
    reasons.push({
      label: "Has phone number",
      points: 15,
      emoji: "📱",
    });
  }
  if (lead.email?.trim()) {
    score += 5;
    reasons.push({
      label: "Has email",
      points: 5,
      emoji: "📧",
    });
  }

  if (lead.city?.trim()) {
    score += 5;
    reasons.push({
      label: "Location known",
      points: 5,
      emoji: "📍",
    });
  }

  const notesRaw = lead.notes?.trim() ?? "";
  if (notesRaw.length > 0) {
    const notes = notesRaw.toLowerCase();

    if (notesMatchAny(notes, NEGATIVE_KEYWORDS)) {
      score -= 10;
      reasons.push({
        label: "Negative signals in notes",
        points: -10,
        emoji: "⬇️",
      });
    }

    if (notesMatchAny(notes, HIGH_VALUE_KEYWORDS)) {
      score += 20;
      reasons.push({
        label: "High-value project signals (PK)",
        points: 20,
        emoji: "🏗️",
      });
    }

    if (notesMatchAny(notes, URGENCY_KEYWORDS)) {
      score += 15;
      reasons.push({
        label: "Urgency / timeline",
        points: 15,
        emoji: "🔥",
      });
    }

    if (notesMatchAny(notes, COMPETITOR_KEYWORDS)) {
      score += 10;
      reasons.push({
        label: "Comparing options / market",
        points: 10,
        emoji: "⚖️",
      });
    }

    if (notesRaw.length > 10) {
      const hadKeywordBoost =
        notesMatchAny(notes, HIGH_VALUE_KEYWORDS) ||
        notesMatchAny(notes, URGENCY_KEYWORDS) ||
        notesMatchAny(notes, COMPETITOR_KEYWORDS);
      if (!hadKeywordBoost) {
        score += 3;
        reasons.push({
          label: "Has notes",
          points: 3,
          emoji: "📝",
        });
      }
    }
  }

  const sourcePoints: Record<string, number> = {
    whatsapp: 10,
    referral: 10,
    instagram: 7,
    facebook: 6,
    cold_call: 4,
    manual: 3,
    other: 3,
  };
  const sourceKey = normalizeSourceChannelKey(lead.source_channel) || "other";
  const sourceScore = sourcePoints[sourceKey] ?? sourcePoints.other ?? 0;
  if (sourceScore > 0) {
    score += sourceScore;
    reasons.push({
      label: `Source: ${lead.source_channel || "—"}`,
      points: sourceScore,
      emoji: "📲",
    });
  }

  if (lead.next_follow_up_at) {
    const followUpDate = new Date(lead.next_follow_up_at);
    const now = new Date();
    const isPast = followUpDate < now;
    if (!isPast) {
      score += 10;
      reasons.push({
        label: "Follow-up scheduled",
        points: 10,
        emoji: "📅",
      });
    }
  }

  const createdAt = new Date(lead.created_at);
  const daysSinceCreated = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceCreated <= 1) {
    score += 10;
    reasons.push({
      label: "Added today",
      points: 10,
      emoji: "✨",
    });
  } else if (daysSinceCreated <= 7) {
    score += 5;
    reasons.push({
      label: "Added this week",
      points: 5,
      emoji: "🆕",
    });
  }

  return {
    score: Math.max(0, Math.min(score, 100)),
    reasons,
  };
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#FF4444";
  if (score >= 60) return "#FF8C00";
  if (score >= 40) return "#FFD700";
  return "#888888";
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Hot 🔥";
  if (score >= 60) return "Warm ♨️";
  if (score >= 40) return "Cool 😐";
  return "Cold 🧊";
}

export function getScoreEmoji(score: number): string {
  if (score >= 80) return "🔥";
  if (score >= 60) return "♨️";
  if (score >= 40) return "💧";
  return "🧊";
}

export function inboxLeadToScoreInput(lead: {
  status?: string | null;
  priority?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  notes?: string | null;
  next_follow_up_at?: string | null;
  created_at?: string | null;
  source_channel?: string | null;
  source?: string | null;
}): LeadScoreInput {
  return {
    status: lead.status ?? "",
    priority: lead.priority ?? "",
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    city: lead.city ?? null,
    notes: lead.notes ?? null,
    next_follow_up_at: lead.next_follow_up_at ?? null,
    created_at: lead.created_at?.trim() ? lead.created_at! : new Date().toISOString(),
    source_channel: lead.source_channel ?? lead.source ?? null,
  };
}

function prioritySortRank(p: string | null | undefined): number {
  const b = priorityBucketForSort(p);
  if (b === "high") return 3;
  if (b === "medium") return 2;
  if (b === "low") return 1;
  return 0;
}

function priorityBucketForSort(p: string | null | undefined): "high" | "medium" | "low" | null {
  const x = (p ?? "").toLowerCase().trim();
  if (x === "high" || x === "hot") return "high";
  if (x === "medium" || x === "warm") return "medium";
  if (x === "low" || x === "cold") return "low";
  return null;
}

export type PipelineSortId = "score" | "name" | "date" | "priority" | "deal_value";

/** Supabase/Postgres may return numeric columns as string; null/undefined → null. */
export function coerceLeadScoreNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Sort/filter key: missing or invalid score sorts as 0 (never NaN). */
export function leadScoreSortKey(lead: { lead_score?: unknown }): number {
  return coerceLeadScoreNumber(lead.lead_score) ?? 0;
}

function dealValueSortKey(lead: { deal_value?: unknown }): number {
  return coerceDealValue(lead.deal_value);
}

export function sortPipelineLeads<
  T extends {
    lead_score?: number | null;
    deal_value?: unknown;
    name?: string | null;
    created_at?: string | null;
    priority?: string | null;
  },
>(leads: T[], sortBy: PipelineSortId): T[] {
  const copy = [...leads] as T[];
  copy.sort((a, b) => {
    if (sortBy === "score") {
      const sa = leadScoreSortKey(a);
      const sb = leadScoreSortKey(b);
      return sb - sa;
    }
    if (sortBy === "deal_value") {
      const da = dealValueSortKey(a);
      const db = dealValueSortKey(b);
      return db - da;
    }
    if (sortBy === "name") {
      const na = String(a.name ?? "").toLowerCase();
      const nb = String(b.name ?? "").toLowerCase();
      return na.localeCompare(nb);
    }
    if (sortBy === "date") {
      const ta = new Date(a.created_at ?? 0).getTime();
      const tb = new Date(b.created_at ?? 0).getTime();
      return tb - ta;
    }
    const ra = prioritySortRank(a.priority);
    const rb = prioritySortRank(b.priority);
    return rb - ra;
  });
  return copy;
}
