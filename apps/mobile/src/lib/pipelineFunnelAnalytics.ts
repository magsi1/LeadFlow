import { coerceDealValue } from "./dealValue";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "./supabaseClient";
import {
  formatYmdInTimeZone,
  gregorianMinusOneDay,
  zonedMidnightUtc,
} from "./zonedTime";

export type FunnelTimeFilter = "week" | "month" | "all";

export type FunnelStageId = "new" | "contacted" | "qualified" | "won" | "lost";

export type FunnelStageRow = {
  id: FunnelStageId;
  label: string;
  count: number;
  valuePkr: number;
  pctOfTotal: number;
  /** 0–100 width for trapezoid bar (narrows by stage index). */
  barWidthPct: number;
};

export type FunnelDropOff = {
  fromLabel: string;
  toLabel: string;
  /** % of upstream cohort that appears in downstream (cumulative pipeline). */
  pctMovedToNext: number;
};

export type PipelineFunnelResult = {
  totalLeads: number;
  stages: FunnelStageRow[];
  dropOffs: FunnelDropOff[];
  overallNewToWonPct: number;
  avgWonDealPkr: number | null;
  bestRetainingStageLabel: string;
  tableRows: {
    stage: string;
    leads: number;
    valuePkr: number;
    conversionLabel: string;
  }[];
};

type LeadRow = {
  status: string | null;
  deal_value: unknown;
  created_at: string | null;
};

function classifyStage(status: string | null | undefined): FunnelStageId {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "qualified" || s === "proposal_sent") return "qualified";
  if (s === "won") return "won";
  if (s === "lost") return "lost";
  return "new";
}

/** Monday 00:00 in `timeZone` for the week containing `ref`. */
function startOfIsoWeekUtc(ref: Date, timeZone: string): Date {
  const ymd = formatYmdInTimeZone(ref, timeZone);
  let [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  for (let i = 0; i < 8; i++) {
    const inst = zonedMidnightUtc(y, m, d, timeZone);
    const mid = new Date(inst.getTime() + 12 * 3600000);
    const long = mid.toLocaleDateString("en-US", { timeZone, weekday: "long" });
    if (long.startsWith("Monday")) return inst;
    [y, m, d] = gregorianMinusOneDay(y, m, d);
  }
  return zonedMidnightUtc(
    parseInt(ymd.slice(0, 4), 10),
    parseInt(ymd.slice(5, 7), 10),
    parseInt(ymd.slice(8, 10), 10),
    timeZone,
  );
}

function startOfMonthUtc(ref: Date, timeZone: string): Date {
  const ymd = formatYmdInTimeZone(ref, timeZone);
  const y = parseInt(ymd.slice(0, 4), 10);
  const mo = parseInt(ymd.slice(5, 7), 10);
  return zonedMidnightUtc(y, mo, 1, timeZone);
}

export function leadCreatedInFilter(createdAt: string | null, filter: FunnelTimeFilter, timeZone: string): boolean {
  if (filter === "all") return true;
  if (createdAt == null || String(createdAt).trim() === "") return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  const ref = new Date();
  const tz = timeZone?.trim() || "Asia/Karachi";
  const lower =
    filter === "week"
      ? startOfIsoWeekUtc(ref, tz).getTime()
      : filter === "month"
        ? startOfMonthUtc(ref, tz).getTime()
        : 0;
  return t >= lower;
}

export async function fetchLeadsForPipelineFunnel(): Promise<LeadRow[]> {
  if (!isSupabaseConfigured()) {
    throw new Error(supabaseEnvError ?? "Supabase is not configured.");
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("leads").select("status,deal_value,created_at");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as LeadRow[]) : [];
}

export function computePipelineFunnel(rows: LeadRow[], filter: FunnelTimeFilter, timeZone: string): PipelineFunnelResult {
  const tz = timeZone?.trim() || "Asia/Karachi";
  const filtered = rows.filter((r) => leadCreatedInFilter(r.created_at, filter, tz));

  const counts: Record<FunnelStageId, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    won: 0,
    lost: 0,
  };
  const valueSum: Record<FunnelStageId, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    won: 0,
    lost: 0,
  };

  for (const r of filtered) {
    const st = classifyStage(r.status);
    counts[st] += 1;
    valueSum[st] += coerceDealValue(r.deal_value);
  }

  const totalLeads = filtered.length;
  const nNew = counts.new;
  const nContacted = counts.contacted;
  const nQualified = counts.qualified;
  const nWon = counts.won;
  const nLost = counts.lost;

  const pct = (c: number) => (totalLeads > 0 ? (100 * c) / totalLeads : 0);

  const exclusiveOrder: { id: FunnelStageId; label: string }[] = [
    { id: "new", label: "New" },
    { id: "contacted", label: "Contacted" },
    { id: "qualified", label: "Qualified" },
    { id: "won", label: "Won" },
    { id: "lost", label: "Lost" },
  ];

  const maxExclusive = Math.max(1, ...exclusiveOrder.map((x) => counts[x.id]));

  const stages: FunnelStageRow[] = exclusiveOrder.map((def, idx) => {
    const c = counts[def.id];
    const v = valueSum[def.id];
    const share = c / maxExclusive;
    const taper = 1 - idx * 0.14;
    const barWidthPct = Math.min(100, Math.max(c > 0 ? 10 : 0, 100 * share * taper));

    return {
      id: def.id,
      label: def.label,
      count: c,
      valuePkr: v,
      pctOfTotal: pct(c),
      barWidthPct,
    };
  });

  const cumContactedPlus = nContacted + nQualified + nWon + nLost;
  const cumQualifiedPlus = nQualified + nWon + nLost;
  const cumClosed = nWon + nLost;

  const dropOffs: FunnelDropOff[] = [];
  const cohorts: { label: string; n: number }[] = [
    { label: "All leads", n: totalLeads },
    { label: "Reached Contacted+", n: cumContactedPlus },
    { label: "Reached Qualified+", n: cumQualifiedPlus },
    { label: "Closed (Won+Lost)", n: cumClosed },
  ];
  for (let i = 0; i < cohorts.length - 1; i++) {
    const a = cohorts[i]!.n;
    const b = cohorts[i + 1]!.n;
    dropOffs.push({
      fromLabel: cohorts[i]!.label,
      toLabel: cohorts[i + 1]!.label,
      pctMovedToNext: a > 0 ? (100 * b) / a : 0,
    });
  }

  const overallNewToWonPct = totalLeads > 0 ? (100 * nWon) / totalLeads : 0;
  const avgWonDealPkr = nWon > 0 ? valueSum.won / nWon : null;

  let bestLabel = "—";
  let bestC = -1;
  for (const x of exclusiveOrder) {
    const c = counts[x.id];
    if (c > bestC) {
      bestC = c;
      bestLabel = x.label;
    }
  }
  const bestRetainingStageLabel = bestC > 0 ? bestLabel : "—";

  const tableRows = exclusiveOrder.map((def) => ({
    stage: def.label,
    leads: counts[def.id],
    valuePkr: valueSum[def.id],
    conversionLabel: totalLeads > 0 ? `${pct(counts[def.id]).toFixed(0)}%` : "—",
  }));

  return {
    totalLeads,
    stages,
    dropOffs,
    overallNewToWonPct,
    avgWonDealPkr,
    bestRetainingStageLabel,
    tableRows,
  };
}
