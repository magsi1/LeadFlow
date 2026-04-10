import { coerceDealValue } from "./dealValue";
import { calculateLeadScore, inboxLeadToScoreInput } from "./leadScoring";
import { classifyFollowUpDue } from "./leadFollowUp";
import { filterValidInboxLeads, leadDisplayName } from "./safeData";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import { formatYmdInTimeZone } from "./zonedTime";
import type { InboxLeadRow } from "../types/models";

export type DailyDigestData = {
  followUpsDueTodayCount: number;
  firstFollowUpLeadName: string | null;
  firstFollowUpLeadId: string | null;
  hotNotContactedTodayCount: number;
  firstHotLeadName: string | null;
  firstHotLeadId: string | null;
  /** Sum of deal_value for open pipeline (new/contacted/qualified/proposal). */
  openPipelineValuePkr: number;
  /** Open leads with no update in 7+ days. */
  pipelineAtRiskPkr: number;
  pipelineAtRiskCount: number;
  firstAtRiskLeadId: string | null;
};

const OPEN_STATUSES = new Set(["new", "contacted", "qualified", "proposal_sent"]);

function isOpenPipeline(status: string | null | undefined): boolean {
  return OPEN_STATUSES.has((status ?? "").toLowerCase().trim());
}

function leadScore(row: InboxLeadRow): number {
  const db = row.lead_score;
  if (typeof db === "number" && Number.isFinite(db)) return db;
  return calculateLeadScore(inboxLeadToScoreInput(row)).score;
}

export function buildDigestNotificationBody(d: DailyDigestData): string {
  const parts: string[] = [];
  parts.push(`${d.followUpsDueTodayCount} follow-up${d.followUpsDueTodayCount === 1 ? "" : "s"} due today`);
  parts.push(`${d.hotNotContactedTodayCount} hot lead${d.hotNotContactedTodayCount === 1 ? "" : "s"}`);
  const pkr = formatPkrShort(d.openPipelineValuePkr);
  parts.push(`${pkr} in pipeline`);
  return parts.join(" • ");
}

function formatPkrShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "PKR 0";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `PKR ${Math.round(n).toLocaleString("en-IN")}`;
  }
}

export async function fetchDailyDigestData(timeZone: string): Promise<DailyDigestData> {
  const empty: DailyDigestData = {
    followUpsDueTodayCount: 0,
    firstFollowUpLeadName: null,
    firstFollowUpLeadId: null,
    hotNotContactedTodayCount: 0,
    firstHotLeadName: null,
    firstHotLeadId: null,
    openPipelineValuePkr: 0,
    pipelineAtRiskPkr: 0,
    pipelineAtRiskCount: 0,
    firstAtRiskLeadId: null,
  };

  if (!isSupabaseConfigured()) return empty;

  const tz = timeZone?.trim() || "Asia/Karachi";
  const todayYmd = formatYmdInTimeZone(new Date(), tz);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const staleBefore = Date.now() - sevenDaysMs;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,name,status,deal_value,next_follow_up_at,updated_at,phone,email,source,source_channel,priority,notes,city,created_at,lead_score,score_reasons",
      )
      .limit(800);
    if (error) return empty;

    const rows = filterValidInboxLeads((data ?? []) as InboxLeadRow[]);

    const dueToday: InboxLeadRow[] = [];
    let openPipelineTotal = 0;
    const atRisk: { row: InboxLeadRow; deal: number }[] = [];
    const hotCold: InboxLeadRow[] = [];

    for (const r of rows) {
      const st = (r.status ?? "").toLowerCase().trim();
      if (isOpenPipeline(r.status)) {
        openPipelineTotal += coerceDealValue(r.deal_value);
      }

      const fu = r.next_follow_up_at;
      if (fu?.trim() && classifyFollowUpDue(fu, tz) === "today") {
        dueToday.push(r);
      }

      const updatedMs = r.updated_at ? new Date(r.updated_at).getTime() : NaN;
      const stale = !Number.isNaN(updatedMs) && updatedMs < staleBefore;
      if (isOpenPipeline(r.status) && stale) {
        atRisk.push({ row: r, deal: coerceDealValue(r.deal_value) });
      }

      const terminal = st === "won" || st === "lost";
      const score = leadScore(r);
      const updatedYmd = r.updated_at ? formatYmdInTimeZone(new Date(r.updated_at), tz) : "";
      const touchedToday = updatedYmd === todayYmd;
      if (!terminal && score > 70 && !touchedToday) {
        hotCold.push(r);
      }
    }

    dueToday.sort((a, b) => {
      const ta = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : 0;
      const tb = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : 0;
      return ta - tb;
    });

    atRisk.sort((a, b) => b.deal - a.deal);

    hotCold.sort((a, b) => leadScore(b) - leadScore(a));

    const firstFu = dueToday[0];
    const firstHot = hotCold[0];
    const firstRisk = atRisk[0];

    return {
      followUpsDueTodayCount: dueToday.length,
      firstFollowUpLeadName: firstFu ? leadDisplayName(firstFu.name) : null,
      firstFollowUpLeadId: firstFu?.id ?? null,
      hotNotContactedTodayCount: hotCold.length,
      firstHotLeadName: firstHot ? leadDisplayName(firstHot.name) : null,
      firstHotLeadId: firstHot?.id ?? null,
      openPipelineValuePkr: openPipelineTotal,
      pipelineAtRiskPkr: atRisk.reduce((s, x) => s + x.deal, 0),
      pipelineAtRiskCount: atRisk.length,
      firstAtRiskLeadId: firstRisk?.row.id ?? null,
    };
  } catch {
    return empty;
  }
}
