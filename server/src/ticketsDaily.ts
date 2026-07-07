import type { Request, Response } from 'express';
import { env } from './env.js';
import { supabase } from './supabase.js';
import { sendReport } from './telegram.js';
import { dayRangeUtc, todayInTz } from './time.js';

// Ежедневный отчёт по тикетам Sona — counts the report forms Sona submitted
// during one local day (Asia/Yerevan) and breaks them down per accountant.
//
// Scope: ONLY the Sona QA platform. The count reads sqa_reviews (one row per
// submitted Sona report form) and sqa_tickets (the accountant tickets the DB
// trigger creates from those forms). It never touches mqa_* (Margarita / AI
// detections) or kk_* (accountants' platform) tables, so no other module's
// data can leak into the numbers.

export interface SonaTicketsDaily {
  date: string; // local day (env.tz) being counted
  cutoffHour: number; // day boundary: [date-1 {cutoff}:00 .. date {cutoff}:00)
  fromIso: string; // UTC range actually queried: [fromIso, toIso)
  toIso: string;
  total: number; // report forms Sona submitted that day
  ticketsCreated: number; // of those, how many produced an accountant ticket
  byAccountant: Array<{ accountant: string; count: number }>;
}

export const NO_ACCOUNTANT = 'Без бухгалтера';

// Per-accountant counts; blank names are lumped under NO_ACCOUNTANT.
export function countByAccountant(rows: Array<{ accountant?: string | null }>): SonaTicketsDaily['byAccountant'] {
  const by = new Map<string, number>();
  for (const r of rows) {
    const name = (r.accountant ?? '').trim() || NO_ACCOUNTANT;
    by.set(name, (by.get(name) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([accountant, count]) => ({ accountant, count }))
    .sort((a, b) => b.count - a.count || a.accountant.localeCompare(b.accountant));
}

export async function buildSonaTicketsDaily(date: string): Promise<SonaTicketsDaily> {
  const { fromIso, toIso } = dayRangeUtc(date, env.tz, env.ticketsCutoffHour);
  console.log(`[sona-tickets] module=sqa (Sona QA only) day=${date} tz=${env.tz} cutoff=${env.ticketsCutoffHour}:00 range=[${fromIso} .. ${toIso})`);

  const { data: forms, error } = await supabase
    .from('sqa_reviews')
    .select('id, accountant, created_at')
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .limit(5000);
  if (error) throw new Error(`sqa_reviews query failed: ${error.message}`);

  const { count: ticketsCreated, error: tErr } = await supabase
    .from('sqa_tickets')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', fromIso)
    .lt('created_at', toIso);
  if (tErr) console.warn(`[sona-tickets] sqa_tickets count failed (non-fatal): ${tErr.message}`);

  const report: SonaTicketsDaily = {
    date,
    cutoffHour: env.ticketsCutoffHour,
    fromIso,
    toIso,
    total: (forms ?? []).length,
    ticketsCreated: ticketsCreated ?? 0,
    byAccountant: countByAccountant(forms ?? []),
  };
  console.log(
    `[sona-tickets] found=${report.total} report forms (sqa_reviews), ` +
    `ticketsCreated=${report.ticketsCreated} (sqa_tickets), accountants=${report.byAccountant.length}`,
  );
  return report;
}

const ddmmyyyy = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
};

export function formatSonaTicketsDailyText(r: SonaTicketsDaily): string {
  const lines = [
    `📊 <b>Ежедневный отчёт по тикетам Sona</b>`,
    ``,
    `Дата: ${ddmmyyyy(r.date)}`,
  ];
  if (r.cutoffHour > 0) {
    // The day closes at the cutoff; show the exact window so Sona's manual
    // check counts the same period as the bot.
    const prev = new Date(`${r.date}T12:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const hh = `${String(r.cutoffHour).padStart(2, '0')}:00`;
    lines.push(`Период: ${ddmmyyyy(prev.toISOString().slice(0, 10))} ${hh} — ${ddmmyyyy(r.date)} ${hh}`);
  }
  lines.push(
    ``,
    `Всего тикетов: <b>${r.total}</b>`,
    `(из них передано бухгалтерам как тикет: ${r.ticketsCreated})`,
    ``,
    `<b>По бухгалтерам:</b>`,
  );
  if (r.byAccountant.length) {
    for (const a of r.byAccountant) lines.push(`• ${a.accountant}: ${a.count}`);
  } else {
    lines.push(`— за день тикетов нет`);
  }
  lines.push(
    ``,
    `<b>Проверка точности:</b>`,
    `Бот посчитал: ${r.total} тикетов.`,
    `Фактически по проверке Sona: ___ тикетов.`,
    `Разница: ___.`,
    ``,
    `Комментарий:`,
    `Сравните число бота с реальным количеством у Sona («бот сказал ${r.total}, в реальности сколько было?»). Если числа расходятся — подсчёт нужно проверить вместе с Sona.`,
  );
  return lines.join('\n');
}

// Public entry point for Render Cron (GET or POST /api/cron/sona-tickets-daily).
// Optional guard: when CRON_SECRET is set, the caller must pass it as ?token=…
// or the X-Cron-Secret header. When auth is enabled (REQUIRE_AUTH=true) the
// endpoint refuses to run without a CRON_SECRET so it can't become an open door.
// Errors are always caught and answered as JSON — a failing report or Telegram
// outage must never crash the platform.
export async function sonaTicketsDailyCronHandler(req: Request, res: Response) {
  const token = String(req.query.token ?? req.headers['x-cron-secret'] ?? '');
  if (env.cronSecret) {
    if (token !== env.cronSecret) return res.status(401).json({ ok: false, error: 'bad_token' });
  } else if (env.authRequired) {
    return res.status(403).json({ ok: false, error: 'cron_secret_required_when_auth_enabled' });
  }

  try {
    const date = String(req.query.date ?? todayInTz());
    const report = await buildSonaTicketsDaily(date);
    const send = await sendReport('tickets', date, formatSonaTicketsDailyText(report));
    console.log(`[sona-tickets] telegram ${send.ok ? 'sent' : `not sent (${send.error ?? 'unknown'})`} for ${date}`);
    res.json({
      ok: send.ok,
      date,
      total: report.total,
      ticketsCreated: report.ticketsCreated,
      byAccountant: report.byAccountant,
      telegram: send,
    });
  } catch (e) {
    console.error('[sona-tickets] cron endpoint failed:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'internal_error' });
  }
}
