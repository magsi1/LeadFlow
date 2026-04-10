import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "./supabaseClient";
import { formatYmdInTimeZone, zonedDayRangeContaining } from "./zonedTime";
import type { InboxLeadRow } from "../types/models";
import { filterValidInboxLeads } from "./safeData";

/** Store follow-up at 09:00 local on the chosen calendar day. */
export function normalizeFollowUpLocalDate(d: Date): Date {
  const x = new Date(d);
  x.setHours(9, 0, 0, 0);
  return x;
}

export async function updateLeadNextFollowUpAt(
  leadId: string,
  pickedDate: Date,
  options?: { preserveTime?: boolean },
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error(supabaseEnvError ?? "Supabase is not configured.");
  }
  const when = options?.preserveTime ? new Date(pickedDate.getTime()) : normalizeFollowUpLocalDate(pickedDate);
  const iso = when.toISOString();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("leads").update({ next_follow_up_at: iso }).eq("id", leadId);
  if (error) throw new Error(error.message);
  return iso;
}

/** Clears scheduled follow-up (Mark done). */
export async function clearLeadFollowUp(leadId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error(supabaseEnvError ?? "Supabase is not configured.");
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("leads").update({ next_follow_up_at: null }).eq("id", leadId);
  if (error) throw new Error(error.message);
}

/**
 * `classifyFollowUpDue` === "upcoming" and due within the next 7×24h after end of “today” in `timeZone`
 * (excludes anything due earlier today — those are “today”).
 */
export function isFollowUpInUpcomingSevenDayWindow(
  iso: string | null | undefined,
  timeZone: string,
): boolean {
  const tz = timeZone?.trim() || "Asia/Karachi";
  if (classifyFollowUpDue(iso, tz) !== "upcoming") return false;
  const due = new Date(String(iso)).getTime();
  if (Number.isNaN(due)) return false;
  const { endExclusive: endToday } = zonedDayRangeContaining(new Date(), tz);
  const limit = endToday.getTime() + 7 * 24 * 60 * 60 * 1000;
  return due < limit;
}

/** Calendar days from `todayYmd` to `dueYmd` (due − today). */
function civilDayDiffFromToday(todayYmd: string, dueYmd: string): number {
  const [ay, am, ad] = todayYmd.split("-").map(Number);
  const [by, bm, bd] = dueYmd.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

/** e.g. "Due at 3:00 PM" in the user’s timezone. */
export function formatFollowUpDueAtTime(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const tz = timeZone?.trim() || "Asia/Karachi";
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `Due at ${t}`;
}

/**
 * Upcoming (not today): "Tomorrow", "In 3 days", or "Next Monday"-style label.
 */
export function formatFollowUpUpcomingRelative(
  iso: string | null | undefined,
  timeZone: string,
  now = new Date(),
): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "—";
  const tz = timeZone?.trim() || "Asia/Karachi";
  const todayYmd = formatYmdInTimeZone(now, tz);
  const dueYmd = formatYmdInTimeZone(due, tz);
  const dayDiff = civilDayDiffFromToday(todayYmd, dueYmd);
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff === 2) return "In 2 days";
  if (dayDiff === 3) return "In 3 days";
  if (dayDiff >= 4 && dayDiff <= 7) {
    const longWeekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(due);
    return `Next ${longWeekday}`;
  }
  if (dayDiff > 7) return `In ${dayDiff} days`;
  return "—";
}

/** e.g. "2 days overdue", "3 hours overdue" (English). */
export function formatFollowUpOverdueHuman(iso: string | null | undefined, now = new Date()): string {
  if (iso == null || String(iso).trim() === "") return "";
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return "";
  const diff = now.getTime() - due;
  if (diff <= 0) return "";
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} overdue`;
  if (hrs >= 1) return `${hrs} hour${hrs === 1 ? "" : "s"} overdue`;
  if (min >= 1) return `${min} minute${min === 1 ? "" : "s"} overdue`;
  return "Just overdue";
}

/** Leads with a scheduled `next_follow_up_at`, nearest first. */
export async function fetchLeadsOrderedByFollowUp(): Promise<InboxLeadRow[]> {
  if (!isSupabaseConfigured()) {
    throw new Error(supabaseEnvError ?? "Supabase is not configured.");
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,phone,email,source,status,priority,notes,city,created_at,next_follow_up_at")
    .not("next_follow_up_at", "is", null)
    .order("next_follow_up_at", { ascending: true });
  if (error) throw new Error(error.message);
  return filterValidInboxLeads((data ?? []) as InboxLeadRow[]);
}

export type FollowUpDueKind = "overdue" | "today" | "upcoming";

/** Classify follow-up vs “today” using the app’s preferred IANA time zone (Settings). */
export function classifyFollowUpDue(
  iso: string | null | undefined,
  timeZone: string,
): FollowUpDueKind | null {
  if (iso == null || String(iso).trim() === "") return null;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return null;
  const tz = timeZone?.trim() || "Asia/Karachi";
  const now = new Date();
  const { start: startToday, endExclusive: endToday } = zonedDayRangeContaining(now, tz);
  if (due < startToday.getTime()) return "overdue";
  if (due < endToday.getTime()) return "today";
  return "upcoming";
}
