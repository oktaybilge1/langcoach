const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar date as YYYY-MM-DD. */
export function toLocalDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 8601 week (Monday start) as YYYY-Www, based on the local calendar date. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // Thursday of this week
  const year = t.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${pad(year, 4)}-W${pad(week)}`;
}

/** The 7 local dates (Monday first) of an ISO week. */
export function weekDates(week: string): string[] {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Invalid ISO week: ${week}`);
  const year = Number(m[1]);
  const w = Number(m[2]);
  // Jan 4th is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayMs = jan4.getTime() - (jan4Day - 1) * 86400000 + (w - 1) * 7 * 86400000;
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mondayMs + i * 86400000);
    return `${pad(x.getUTCFullYear(), 4)}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  });
}
