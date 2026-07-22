import { env } from './env.js';

// Current date (YYYY-MM-DD) in the configured timezone.
export function todayInTz(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// The previous local day (YYYY-MM-DD) in the configured timezone.
//
// This is the default day the daily Sona ticket report covers. The report is
// sent at the 19:00 cutoff and reports the checking_date that has just CLOSED,
// not "today" (which is still filling up): Sona enters a day's checks in
// batches, often late at night or in the small hours of the next calendar day
// and back-dated to the day she actually checked. Keying the send on "today"
// meant such a check (e.g. checking_date=20.07 entered at 02:00 on the 21st)
// was missed by BOTH the 20.07 report — sent before it was entered — and the
// 21.07 report — which looks for checking_date=21.07. Reporting the previous
// day gives every checking_date a full extra day to fill in before it is
// reported, so those late/back-dated entries are counted exactly once.
export function yesterdayInTz(d = new Date()): string {
  const prev = new Date(`${todayInTz(d)}T12:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

// The timezone's UTC offset (e.g. "+04:00") on the given date, sampled at noon
// UTC — exact for fixed-offset zones like Asia/Yerevan (which has no DST).
function tzOffsetAt(dateStr: string, tz: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dateStr}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : 'Z'; // plain "GMT" (UTC) has no numeric part
}

// UTC instants covering one local day in `tz`: [fromIso, toIso).
// With cutoffHour > 0 the "day" runs from the cutoff on the PREVIOUS calendar
// date to the cutoff on `dateStr` (e.g. cutoff 19 → 06.07 19:00 … 07.07 19:00),
// so anything after the cutoff belongs to the next day's report.
export function dayRangeUtc(dateStr: string, tz = env.tz, cutoffHour = 0): { fromIso: string; toIso: string } {
  const shift = (days: number) => {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const hh = String(cutoffHour).padStart(2, '0');
  const fromDate = cutoffHour > 0 ? shift(-1) : dateStr;
  const toDate = cutoffHour > 0 ? dateStr : shift(1);
  return {
    fromIso: new Date(`${fromDate}T${hh}:00:00${tzOffsetAt(fromDate, tz)}`).toISOString(),
    toIso: new Date(`${toDate}T${hh}:00:00${tzOffsetAt(toDate, tz)}`).toISOString(),
  };
}

// Monday (YYYY-MM-DD) of the ISO week containing the given date.
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ISO week label like "2026-W25".
export function isoWeekLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
