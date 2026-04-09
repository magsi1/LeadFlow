import { getSupabaseClient } from "./supabaseClient";
import { coerceDealValue, mapLeadStatusToPipelineBucket } from "./dealValue";
import { formatYmdInTimeZone } from "./zonedTime";
import type { DashboardPipelineValueByStage } from "../types/models";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Oldest → newest: last `count` calendar months in `timeZone` as `YYYY-MM`. */
export function lastNMonthKeysInTimeZone(timeZone: string, count: number): { key: string; label: string }[] {
  const ymd = formatYmdInTimeZone(new Date(), timeZone);
  const [y0, m0] = ymd.split("-").map((x) => parseInt(x, 10));
  let y = y0;
  let m = m0;
  for (let back = 0; back < count - 1; back++) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  const keys: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      key: `${y}-${pad2(m)}`,
      label: new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export async function fetchPipelineDealValueByStage(): Promise<{
  byStage: DashboardPipelineValueByStage;
  currency: string;
}> {
  const empty: DashboardPipelineValueByStage = { new: 0, contacted: 0, qualified: 0, closed: 0 };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("status, deal_value, deal_currency")
    .limit(10_000);
  if (error) throw new Error(error.message);

  let currency = "PKR";
  const sums = { ...empty };
  for (const row of data ?? []) {
    const r = row as { status?: string | null; deal_value?: unknown; deal_currency?: string | null };
    const v = coerceDealValue(r.deal_value);
    const dc = typeof r.deal_currency === "string" && r.deal_currency.trim() ? r.deal_currency.trim() : "";
    if (dc && currency === "PKR") currency = dc;
    const bucket = mapLeadStatusToPipelineBucket(r.status);
    sums[bucket] += v;
  }

  return { byStage: sums, currency };
}

export type MonthlyDealValueSeries = {
  labels: string[];
  amounts: number[];
};

/**
 * Won-deal revenue by calendar month in `timeZone` (uses `updated_at` when set, else `created_at`).
 */
export async function fetchMonthlyWonDealValue(timeZone: string): Promise<MonthlyDealValueSeries> {
  const monthKeys = lastNMonthKeysInTimeZone(timeZone, 12);
  const indexByKey = new Map<string, number>();
  monthKeys.forEach((mk, i) => indexByKey.set(mk.key, i));
  const amounts = new Array(12).fill(0);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("deal_value, status, updated_at, created_at")
    .eq("status", "won")
    .limit(10_000);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const r = row as {
      deal_value?: unknown;
      updated_at?: string | null;
      created_at?: string | null;
    };
    const v = coerceDealValue(r.deal_value);
    const iso = r.updated_at?.trim() ? r.updated_at : r.created_at;
    if (!iso) continue;
    const ymd = formatYmdInTimeZone(new Date(iso), timeZone);
    const monthKey = ymd.slice(0, 7);
    const idx = indexByKey.get(monthKey);
    if (idx === undefined) continue;
    amounts[idx] += v;
  }

  return {
    labels: monthKeys.map((k) => k.label),
    amounts,
  };
}

export type DealKpis = {
  /** Sum of `deal_value` for leads in new / contacted / qualified (open pipeline). */
  openPipelineTotal: number;
  /** Sum of `deal_value` for won leads. */
  wonRevenueTotal: number;
  /** Average `deal_value` among won leads (0 when none). */
  avgWonDealSize: number | null;
  /** Largest `deal_value` on any lead. */
  biggestDeal: number;
};

/**
 * One-pass KPIs for Analytics (RLS-scoped). Open pipeline excludes closed (won/lost) buckets.
 */
export async function fetchDealKpisAnalytics(): Promise<DealKpis> {
  const empty: DealKpis = {
    openPipelineTotal: 0,
    wonRevenueTotal: 0,
    avgWonDealSize: null,
    biggestDeal: 0,
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("leads").select("status, deal_value").limit(10_000);
  if (error) throw new Error(error.message);

  let openPipelineTotal = 0;
  let wonRevenueTotal = 0;
  let wonCount = 0;
  let biggestDeal = 0;

  for (const row of data ?? []) {
    const r = row as { status?: string | null; deal_value?: unknown };
    const v = coerceDealValue(r.deal_value);
    if (v > biggestDeal) biggestDeal = v;
    const bucket = mapLeadStatusToPipelineBucket(r.status);
    if (bucket === "new" || bucket === "contacted" || bucket === "qualified") {
      openPipelineTotal += v;
    }
    const st = (r.status ?? "").toLowerCase().trim();
    if (st === "won") {
      wonRevenueTotal += v;
      wonCount += 1;
    }
  }

  const avgWonDealSize = wonCount > 0 ? wonRevenueTotal / wonCount : null;

  return {
    openPipelineTotal,
    wonRevenueTotal,
    avgWonDealSize,
    biggestDeal,
  };
}
