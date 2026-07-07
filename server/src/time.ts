import { env } from './env.js';

// Current date (YYYY-MM-DD) in the configured timezone.
export function todayInTz(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
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
export function dayRangeUtc(dateStr: string, tz = env.tz): { fromIso: string; toIso: string } {
  const next = new Date(`${dateStr}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  return {
    fromIso: new Date(`${dateStr}T00:00:00${tzOffsetAt(dateStr, tz)}`).toISOString(),
    toIso: new Date(`${nextStr}T00:00:00${tzOffsetAt(nextStr, tz)}`).toISOString(),
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
