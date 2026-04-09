import { Platform } from "react-native";
import { getUserTimezone } from "./appPreferences";
import { getSupabaseClient } from "./supabaseClient";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { getSourceLabel } from "./sourceLabels";
import {
  formatYmdInTimeZone,
  getEndOfTodayUTC,
  getStartOfTodayUTC,
  gregorianPlusOneDay,
  lastNCivilDatesEndingAt,
  zonedMidnightUtc,
} from "./zonedTime";
import { fetchPipelineDealValueByStage } from "./dealValueAnalytics";
import type {
  AnalyticsDashboard,
  DashboardPipelineValueByStage,
  DashboardPriorityBreakdown,
  DashboardSourceBreakdown,
  DashboardStatusBreakdown,
} from "../types/models";

const ZERO_PIPELINE_VALUE: DashboardPipelineValueByStage = {
  new: 0,
  contacted: 0,
  qualified: 0,
  closed: 0,
};

/** DB `source_channel` values (lowercase). */
export const SOURCE_CHANNELS = ["whatsapp", "instagram", "facebook", "manual", "other"] as const;

export function emptyDashboardAnalytics(): AnalyticsDashboard {
  const bySource: DashboardSourceBreakdown = SOURCE_CHANNELS.map((channel) => ({
    channel,
    label: getSourceLabel(channel),
    count: 0,
  }));
  return {
    totals: {
      totalLeads: 0,
      highPriorityLeads: 0,
      wonLeads: 0,
      followUpsDue: 0,
      leadsToday: 0,
    },
    conversionRate: null,
    byStatus: { new: 0, contacted: 0, qualified: 0, closed: 0 },
    byPriority: { high: 0, medium: 0, low: 0 },
    bySource,
    pipelineValueByStage: { ...ZERO_PIPELINE_VALUE },
    pipelineDealCurrency: "PKR",
  };
}

/** Coerce API payload (may omit new fields) into `AnalyticsDashboard`. */
export function normalizeApiDashboard(raw: AnalyticsDashboard | Partial<AnalyticsDashboard> | null | undefined): AnalyticsDashboard {
  const empty = emptyDashboardAnalytics();
  if (raw == null || typeof raw !== "object") return empty;
  const t = (raw as AnalyticsDashboard).totals;
  if (!t || typeof t !== "object") return empty;
  const legacyHot = (t as { hotLeads?: unknown }).hotLeads;
  const highPriorityLeads =
    typeof t.highPriorityLeads === "number" && Number.isFinite(t.highPriorityLeads)
      ? t.highPriorityLeads
      : typeof legacyHot === "number" && Number.isFinite(legacyHot)
        ? legacyHot
        : 0;
  const pv = (raw as Partial<AnalyticsDashboard>).pipelineValueByStage;
  const pipelineValueByStage =
    pv && typeof pv === "object"
      ? {
        new: typeof pv.new === "number" && Number.isFinite(pv.new) ? pv.new : 0,
        contacted: typeof pv.contacted === "number" && Number.isFinite(pv.contacted) ? pv.contacted : 0,
        qualified: typeof pv.qualified === "number" && Number.isFinite(pv.qualified) ? pv.qualified : 0,
        closed: typeof pv.closed === "number" && Number.isFinite(pv.closed) ? pv.closed : 0,
      }
      : { ...ZERO_PIPELINE_VALUE };
  const pipelineDealCurrency =
    typeof (raw as Partial<AnalyticsDashboard>).pipelineDealCurrency === "string"
      ? (raw as Partial<AnalyticsDashboard>).pipelineDealCurrency
      : empty.pipelineDealCurrency ?? "PKR";

  return {
    totals: {
      totalLeads: typeof t.totalLeads === "number" && Number.isFinite(t.totalLeads) ? t.totalLeads : 0,
      highPriorityLeads,
      wonLeads: typeof t.wonLeads === "number" && Number.isFinite(t.wonLeads) ? t.wonLeads : 0,
      followUpsDue: typeof t.followUpsDue === "number" && Number.isFinite(t.followUpsDue) ? t.followUpsDue : 0,
      leadsToday: typeof t.leadsToday === "number" && Number.isFinite(t.leadsToday) ? t.leadsToday : 0,
    },
    conversionRate:
      raw.conversionRate === null
        ? null
        : typeof raw.conversionRate === "number" && Number.isFinite(raw.conversionRate)
          ? raw.conversionRate
          : null,
    byStatus: raw.byStatus ?? empty.byStatus,
    byPriority: normalizeByPriority((raw as Partial<AnalyticsDashboard>).byPriority, empty.byPriority),
    bySource: raw.bySource ?? empty.bySource,
    pipelineValueByStage,
    pipelineDealCurrency,
  };
}

function normalizeByPriority(
  raw: DashboardPriorityBreakdown | null | undefined,
  fallback: DashboardPriorityBreakdown,
): DashboardPriorityBreakdown {
  if (!raw || typeof raw !== "object") return { ...fallback };
  return {
    high: typeof raw.high === "number" && Number.isFinite(raw.high) ? raw.high : 0,
    medium: typeof raw.medium === "number" && Number.isFinite(raw.medium) ? raw.medium : 0,
    low: typeof raw.low === "number" && Number.isFinite(raw.low) ? raw.low : 0,
  };
}

async function countLeads(apply: (q: any) => any): Promise<number> {
  const supabase = getSupabaseClient();
  const q = apply(supabase.from("leads").select("id", { count: "exact", head: true }));
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

/**
 * On web, AsyncStorage-backed `getUserTimezone()` can lag behind UI; prefer hydrated Zustand prefs (same idea as web confirm vs Alert).
 */
async function resolveTimezoneForNewTodayKpi(): Promise<string> {
  if (Platform.OS === "web") {
    const { hydrated, timeZone } = useAppPreferencesStore.getState();
    const tz = typeof timeZone === "string" ? timeZone.trim() : "";
    if (hydrated && tz.length > 0) return tz;
  }
  return getUserTimezone();
}

/**
 * “New Today” / “New leads today” — same calendar day as Settings `timeZone` (see {@link getUserTimezone}).
 * Bounds are real UTC instants from {@link getStartOfTodayUTC} / {@link getEndOfTodayUTC} (not a fixed +05:00 string).
 */
async function countLeadsCreatedTodayNewTodayKpi(): Promise<number> {
  const supabase = getSupabaseClient();
  const timezone = await resolveTimezoneForNewTodayKpi();
  const startUTC = getStartOfTodayUTC(timezone);
  const endUTC = getEndOfTodayUTC(timezone);

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startUTC)
    .lte("created_at", endUTC);

  if (error) throw new Error(error.message);

  const n = typeof count === "number" && Number.isFinite(count) ? count : 0;

  return n;
}

/** Single place for Supabase dashboard metrics (RLS-scoped). `leadsToday` uses {@link getUserTimezone}. */
export async function fetchDashboardAnalyticsFromSupabase(): Promise<AnalyticsDashboard> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const safe = async (label: string, fn: () => Promise<number>): Promise<number> => {
    try {
      return await fn();
    } catch {
      return 0;
    }
  };

  const [
    totalLeads,
    leadsToday,
    followUpsDue,
    priorityHigh,
    priorityMedium,
    priorityLow,
    statusNew,
    statusContacted,
    statusQualified,
    statusWon,
    statusLost,
    ...sourceCounts
  ] = await Promise.all([
    safe("totalLeads", () => countLeads((q) => q)),
    safe("leadsToday", () => countLeadsCreatedTodayNewTodayKpi()),
    safe("followUpsDue", () =>
      countLeads((q) => q.not("next_follow_up_at", "is", null).lte("next_follow_up_at", nowIso)),
    ),
    safe("priorityHigh", () => countLeads((q) => q.in("priority", ["high", "hot"]))),
    safe("priorityMedium", () => countLeads((q) => q.in("priority", ["medium", "warm"]))),
    safe("priorityLow", () => countLeads((q) => q.in("priority", ["low", "cold"]))),
    safe("statusNew", () => countLeads((q) => q.eq("status", "new"))),
    safe("statusContacted", () => countLeads((q) => q.eq("status", "contacted"))),
    safe("statusQualified", () =>
      countLeads((q) => q.in("status", ["qualified", "proposal_sent"])),
    ),
    safe("statusWon", () => countLeads((q) => q.eq("status", "won"))),
    safe("statusLost", () => countLeads((q) => q.eq("status", "lost"))),
    ...SOURCE_CHANNELS.map((ch) =>
      safe(`source_${ch}`, () => countLeads((q) => q.eq("source_channel", ch))),
    ),
  ]);

  const closedCount = statusWon + statusLost;
  const conversionRate =
    closedCount > 0 ? Number(((statusWon / closedCount) * 100).toFixed(2)) : null;

  const byStatus: DashboardStatusBreakdown = {
    new: statusNew,
    contacted: statusContacted,
    qualified: statusQualified,
    closed: closedCount,
  };

  const bySource: DashboardSourceBreakdown = SOURCE_CHANNELS.map((channel, i) => ({
    channel,
    label: getSourceLabel(channel),
    count: sourceCounts[i] ?? 0,
  }));

  const byPriority: DashboardPriorityBreakdown = {
    high: priorityHigh,
    medium: priorityMedium,
    low: priorityLow,
  };

  let pipelineValueByStage: DashboardPipelineValueByStage = { ...ZERO_PIPELINE_VALUE };
  let pipelineDealCurrency = "PKR";
  try {
    const pv = await fetchPipelineDealValueByStage();
    pipelineValueByStage = pv.byStage;
    pipelineDealCurrency = pv.currency;
  } catch {
    /* deal_value columns may not exist until migration */
  }

  return {
    totals: {
      totalLeads,
      highPriorityLeads: priorityHigh,
      wonLeads: statusWon,
      followUpsDue,
      leadsToday,
    },
    conversionRate,
    byStatus,
    byPriority,
    bySource,
    pipelineValueByStage,
    pipelineDealCurrency,
  };
}

/** Labels (oldest → newest) and lead counts per local calendar day for the last 7 days including today. */
export type LeadsLast7DaysSeries = {
  labels: string[];
  data: number[];
};

/** Single point for dashboard line chart input. */
export type ChartDataPoint = { date: string; count: number };

/** Map 7-day series to `{ date, count }[]`; returns `[]` if missing/invalid. */
export function leadsLast7DaysToChartData(series: LeadsLast7DaysSeries | null | undefined): ChartDataPoint[] {
  if (series == null || !Array.isArray(series.labels)) return [];
  return series.labels.map((label, i) => ({
    date: String(label ?? "—"),
    count: typeof series.data[i] === "number" && Number.isFinite(series.data[i]) ? series.data[i]! : 0,
  }));
}

function buildLast7ZonedWeekdayLabels(keys: string[], timeZone: string): string[] {
  return keys.map((ymd) => {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    const inst = zonedMidnightUtc(y, m, d, timeZone);
    return inst.toLocaleDateString("en-US", { timeZone, weekday: "short" });
  });
}

export function emptyLast7Days(timeZone?: string): LeadsLast7DaysSeries {
  const tz = timeZone ?? "UTC";
  const ref = new Date();
  const todayYmd = formatYmdInTimeZone(ref, tz);
  const keys = lastNCivilDatesEndingAt(todayYmd, 7);
  return { labels: buildLast7ZonedWeekdayLabels(keys, tz), data: new Array(7).fill(0) };
}

/** Count leads per calendar day for the last 7 days in `timeZone` (RLS-scoped). */
export async function fetchLeadsLast7DaysFromSupabase(timeZone: string): Promise<LeadsLast7DaysSeries> {
  const supabase = getSupabaseClient();
  const ref = new Date();
  const todayYmd = formatYmdInTimeZone(ref, timeZone);
  const keys = lastNCivilDatesEndingAt(todayYmd, 7);
  const [y0, m0, d0] = keys[0]!.split("-").map((x) => parseInt(x, 10));
  const [y1, m1, d1] = keys[6]!.split("-").map((x) => parseInt(x, 10));
  const queryStartIso = zonedMidnightUtc(y0, m0, d0, timeZone).toISOString();
  const [ny, nm, nd] = gregorianPlusOneDay(y1, m1, d1);
  const queryEndExclusive = zonedMidnightUtc(ny, nm, nd, timeZone).toISOString();

  const { data: rows, error } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", queryStartIso)
    .lt("created_at", queryEndExclusive);

  if (error) throw new Error(error.message);

  const indexByYmd = new Map<string, number>();
  keys.forEach((k, i) => indexByYmd.set(k, i));
  const counts = new Array(7).fill(0);

  for (const row of rows ?? []) {
    const raw = row.created_at;
    if (raw == null) continue;
    const ymd = formatYmdInTimeZone(new Date(String(raw)), timeZone);
    const idx = indexByYmd.get(ymd);
    if (idx !== undefined) counts[idx] += 1;
  }

  return {
    labels: buildLast7ZonedWeekdayLabels(keys, timeZone),
    data: counts,
  };
}

export async function fetchLeadsLast7DaysSeries(opts: {
  demoMode: boolean;
  supabaseConfigured: boolean;
  timeZone: string;
}): Promise<LeadsLast7DaysSeries> {
  if (opts.demoMode) {
    return {
      labels: buildLast7ZonedWeekdayLabels(
        lastNCivilDatesEndingAt(formatYmdInTimeZone(new Date(), opts.timeZone), 7),
        opts.timeZone,
      ),
      data: [2, 5, 4, 8, 6, 7, 3],
    };
  }
  if (!opts.supabaseConfigured) {
    return emptyLast7Days(opts.timeZone);
  }
  try {
    return await fetchLeadsLast7DaysFromSupabase(opts.timeZone);
  } catch {
    return emptyLast7Days(opts.timeZone);
  }
}

export type LoadDashboardAnalyticsOptions = {
  demoMode: boolean;
  supabaseConfigured: boolean;
  getApiDashboard: () => Promise<AnalyticsDashboard>;
};

/**
 * Supabase-first dashboard metrics; falls back to API when demo, offline, or unauthenticated.
 * Returns `apiError` when the API call failed (Supabase may still have filled metrics).
 */
export async function loadDashboardAnalytics(
  opts: LoadDashboardAnalyticsOptions,
): Promise<{ dashboard: AnalyticsDashboard; apiError: string | null }> {
  if (opts.demoMode) {
    const d = emptyDashboardAnalytics();
    d.totals = { totalLeads: 42, highPriorityLeads: 11, wonLeads: 8, followUpsDue: 5, leadsToday: 3 };
    // 8 won, 4 lost → 8 ÷ 12 × 100
    d.conversionRate = Number(((8 / (8 + 4)) * 100).toFixed(2));
    d.byStatus = { new: 10, contacted: 12, qualified: 8, closed: 12 };
    d.byPriority = { high: 11, medium: 18, low: 13 };
    d.bySource = d.bySource.map((row, i) => ({
      ...row,
      count: [18, 9, 6, 5, 4][i] ?? 0,
    }));
    d.pipelineValueByStage = {
      new: 450_000,
      contacted: 1_200_000,
      qualified: 2_100_000,
      closed: 3_400_000,
    };
    d.pipelineDealCurrency = "PKR";
    return { dashboard: d, apiError: null };
  }

  let dashboard = emptyDashboardAnalytics();
  let supabaseOk = false;

  // Do not gate on `hasUser`: Zustand user can lag behind Supabase session after cold start;
  // RLS still scopes rows to the signed-in user when a session exists.
  if (opts.supabaseConfigured) {
    try {
      dashboard = await fetchDashboardAnalyticsFromSupabase();
      supabaseOk = true;
    } catch {
      /* Supabase metrics unavailable; fall through to API */
    }
  }

  let apiError: string | null = null;
  if (!supabaseOk) {
    try {
      const raw = await opts.getApiDashboard();
      dashboard = normalizeApiDashboard(raw);
    } catch (e) {
      apiError = e instanceof Error ? e.message : "Could not load analytics from API.";
    }
  }

  return { dashboard, apiError };
}
