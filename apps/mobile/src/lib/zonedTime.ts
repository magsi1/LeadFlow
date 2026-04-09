/**
 * Calendar / wall-clock helpers for a chosen IANA time zone (not device local).
 */

/** YYYY-MM-DD in `timeZone` for the given instant. */
export function formatYmdInTimeZone(isoOrDate: Date, timeZone: string): string {
  return isoOrDate.toLocaleDateString("en-CA", { timeZone });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Previous Gregorian calendar day (civil date), for bucketing. */
export function gregorianMinusOneDay(y: number, m: number, d: number): [number, number, number] {
  const x = new Date(Date.UTC(y, m - 1, d - 1));
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}

export function gregorianPlusOneDay(y: number, m: number, d: number): [number, number, number] {
  const x = new Date(Date.UTC(y, m - 1, d + 1));
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}

/** Oldest → newest: last `count` civil dates ending at `endYmd` (YYYY-MM-DD strings). */
export function lastNCivilDatesEndingAt(endYmd: string, count: number): string[] {
  const [y0, m0, d0] = endYmd.split("-").map((x) => parseInt(x, 10));
  const keys: string[] = [];
  let y = y0;
  let m = m0;
  let d = d0;
  for (let i = 0; i < count; i++) {
    keys.unshift(`${y}-${pad2(m)}-${pad2(d)}`);
    [y, m, d] = gregorianMinusOneDay(y, m, d);
  }
  return keys;
}

/**
 * UTC instant when `timeZone` reads `year-month-day` at 00:00:00 (wall clock).
 */
export function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const target = `${year}-${pad2(month)}-${pad2(day)}`;
  let lo = Date.UTC(year, month - 1, day, 0, 0, 0) - 36 * 3600000;
  let hi = Date.UTC(year, month - 1, day, 0, 0, 0) + 36 * 3600000;
  while (hi - lo > 2000) {
    const mid = Math.floor((lo + hi) / 2);
    const midYmd = new Date(mid).toLocaleDateString("en-CA", { timeZone });
    if (midYmd < target) lo = mid;
    else hi = mid;
  }
  for (let t = lo; t <= hi + 86400000; t += 1000) {
    const dt = new Date(t);
    if (dt.toLocaleDateString("en-CA", { timeZone }) !== target) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(dt);
    const hh = +(parts.find((p) => p.type === "hour")?.value ?? 99);
    const mm = +(parts.find((p) => p.type === "minute")?.value ?? 99);
    const ss = +(parts.find((p) => p.type === "second")?.value ?? 99);
    if (hh === 0 && mm === 0 && ss === 0) return dt;
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

/** Start of the zoned calendar day containing `ref`, and start of the next day (exclusive). */
export function zonedDayRangeContaining(ref: Date, timeZone: string): { start: Date; endExclusive: Date } {
  const ymd = formatYmdInTimeZone(ref, timeZone);
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const start = zonedMidnightUtc(y, m, d, timeZone);
  const [ny, nm, nd] = gregorianPlusOneDay(y, m, d);
  const endExclusive = zonedMidnightUtc(ny, nm, nd, timeZone);
  return { start, endExclusive };
}

/** ISO UTC string for the start of “today” in `timeZone` (for `created_at` lower bound). */
export function getStartOfTodayUTC(timeZone: string): string {
  const tz = timeZone?.trim() || "Asia/Karachi";
  const { start } = zonedDayRangeContaining(new Date(), tz);
  return start.toISOString();
}

/**
 * ISO UTC string for the last instant of “today” in `timeZone` (for `created_at` upper bound with `.lte`).
 * Uses last millisecond before the next local midnight.
 */
export function getEndOfTodayUTC(timeZone: string): string {
  const tz = timeZone?.trim() || "Asia/Karachi";
  const { endExclusive } = zonedDayRangeContaining(new Date(), tz);
  const endInclusive = new Date(endExclusive.getTime() - 1);
  return endInclusive.toISOString();
}
