import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { supabase } from '../supabase.js';
import { buildDailyReport, buildWeeklyReport, buildAuditorReport, buildScorecard, formatDailyText, formatWeeklyText, formatAuditorText } from '../reports.js';
import { buildSonaTicketsDaily, formatSonaTicketsDailyText } from '../ticketsDaily.js';
import { sendReport } from '../telegram.js';
import { isoWeekLabel, mondayOf, todayInTz } from '../time.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/daily', async (req: AuthedRequest, res: Response) => {
  const date = String(req.query.date ?? todayInTz());
  const to = String(req.query.to ?? date);
  res.json(await buildDailyReport(date, to < date ? date : to));
});

reportsRouter.get('/weekly', async (req: AuthedRequest, res: Response) => {
  const weekStart = String(req.query.week ?? mondayOf(todayInTz()));
  res.json(await buildWeeklyReport(weekStart));
});

// Отчёт аудитора (проверено/всего + план на следующий день). Supports a date
// range via ?date=…&to=… — single-day when `to` is omitted.
reportsRouter.get('/auditor', async (req: AuthedRequest, res: Response) => {
  const date = String(req.query.date ?? todayInTz());
  const to = String(req.query.to ?? date);
  res.json(await buildAuditorReport(date, to < date ? date : to));
});

// Дневной подсчёт тикетов Sona (проверки за день + разбивка по бухгалтерам +
// подтверждение + статусы ответов). Keyed on checking_date — same source of
// truth as the Telegram report.
reportsRouter.get('/tickets-daily', async (req: AuthedRequest, res: Response) => {
  try {
    const date = String(req.query.date ?? todayInTz());
    res.json(await buildSonaTicketsDaily(date));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'internal_error' });
  }
});

// Sona's confirmation of the detected daily count. Body:
//   { date, confirmation_status: 'confirmed'|'incorrect'|'needs_review'|'pending',
//     corrected_total?: number, comment?: string }
// detected_total is recomputed server-side (never trust the client) so the
// stored figure always matches the shared counter.
const CONFIRM_STATUSES = ['pending', 'confirmed', 'incorrect', 'needs_review'] as const;
reportsRouter.put('/tickets-daily/confirm', async (req: AuthedRequest, res: Response) => {
  try {
    const date = String(req.body?.date ?? todayInTz());
    const status = CONFIRM_STATUSES.includes(req.body?.confirmation_status)
      ? (req.body.confirmation_status as (typeof CONFIRM_STATUSES)[number]) : 'confirmed';
    const report = await buildSonaTicketsDaily(date);
    const correctedRaw = req.body?.corrected_total;
    const corrected_total = correctedRaw === '' || correctedRaw === null || correctedRaw === undefined
      ? null : Number(correctedRaw);
    if (corrected_total !== null && !Number.isFinite(corrected_total)) {
      return res.status(400).json({ error: 'corrected_total_must_be_number' });
    }
    const confirmed = status === 'confirmed' || status === 'incorrect';
    const row = {
      check_date: date,
      detected_total: report.total,
      corrected_total,
      confirmation_status: status,
      confirmed_by_sona: confirmed,
      sona_comment: (req.body?.comment ?? '').toString().trim() || null,
      confirmed_at: confirmed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('sqa_ticket_confirmations').upsert(row, { onConflict: 'check_date' });
    if (error) return res.status(500).json({ error: error.message });
    res.json(await buildSonaTicketsDaily(date));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'internal_error' });
  }
});

// Всего отчётов в работе у бухгалтеров (знаменатель "проверено/всего").
reportsRouter.get('/workload', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase.from('sqa_accountant_workload').select('*').order('accountant');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ workload: data ?? [] });
});

reportsRouter.put('/workload', async (req: AuthedRequest, res: Response) => {
  const { accountant, total_reports, period } = req.body ?? {};
  if (!accountant) return res.status(400).json({ error: 'accountant_required' });
  const { data, error } = await supabase
    .from('sqa_accountant_workload')
    .upsert({ accountant, total_reports: Number(total_reports) || 0, period: period ?? null, updated_at: new Date().toISOString() }, { onConflict: 'accountant' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ workload: data });
});

// План на дату: список назначений по бухгалтерам.
reportsRouter.get('/plan', async (req: AuthedRequest, res: Response) => {
  const date = String(req.query.date ?? todayInTz());
  const { data, error } = await supabase.from('sqa_daily_plan').select('*').eq('plan_date', date).order('accountant');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ plan: data ?? [] });
});

// Replace the whole plan for a given date in one call.
reportsRouter.put('/plan', async (req: AuthedRequest, res: Response) => {
  const date = String(req.body?.date ?? todayInTz());
  const items: Array<{ accountant: string; planned_reports: number; note?: string }> = Array.isArray(req.body?.items) ? req.body.items : [];
  await supabase.from('sqa_daily_plan').delete().eq('plan_date', date);
  const rows = items
    .filter((i) => i.accountant && (Number(i.planned_reports) || i.note))
    .map((i) => ({ plan_date: date, accountant: i.accountant, planned_reports: Number(i.planned_reports) || 0, note: i.note ?? null }));
  if (rows.length) {
    const { error } = await supabase.from('sqa_daily_plan').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true, count: rows.length });
});

// Weighted scorecard ("Общая оценка"): Итог Q per accountant over a range.
// Defaults to the current month (1st → today) when from/to are omitted.
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

reportsRouter.get('/scorecard', async (req: AuthedRequest, res: Response) => {
  const to = String(req.query.to ?? todayInTz());
  const from = String(req.query.from ?? monthStart(to));
  res.json(await buildScorecard(from, to));
});

// Save Sona's manual overrides for one accountant over a period. Each of
// k1..k5 may be a number (override) or null (use the auto-derived value).
reportsRouter.put('/scorecard/override', async (req: AuthedRequest, res: Response) => {
  const { accountant, from, to } = req.body ?? {};
  if (!accountant || !from || !to) return res.status(400).json({ error: 'accountant_from_to_required' });
  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
  const row = {
    accountant, period_from: from, period_to: to,
    k1: num(req.body.k1), k2: num(req.body.k2), k3: num(req.body.k3), k4: num(req.body.k4), k5: num(req.body.k5),
    note: req.body.note ?? null, updated_at: new Date().toISOString(),
  };
  const allEmpty = [row.k1, row.k2, row.k3, row.k4, row.k5].every((v) => v === null) && !row.note;
  if (allEmpty) {
    await supabase.from('sqa_efficiency_overrides').delete().match({ accountant, period_from: from, period_to: to });
    return res.json({ ok: true, cleared: true });
  }
  const { error } = await supabase
    .from('sqa_efficiency_overrides').upsert(row, { onConflict: 'accountant,period_from,period_to' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Raw efficiency/accountant breakdowns for the dashboard.
reportsRouter.get('/efficiency', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('sqa_sona_efficiency').select('*').order('week_start', { ascending: false }).limit(12);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ efficiency: data ?? [] });
});

reportsRouter.get('/notifications', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('sqa_notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ notifications: data ?? [] });
});

// Manually trigger a Telegram send (e.g. "Send now" button in the UI).
reportsRouter.post('/send', async (req: AuthedRequest, res: Response) => {
  const kind = ['weekly', 'auditor', 'tickets'].includes(req.body?.kind) ? (req.body.kind as 'weekly' | 'auditor' | 'tickets') : 'daily';
  if (kind === 'tickets') {
    try {
      const date = String(req.body?.date ?? todayInTz());
      const report = await buildSonaTicketsDaily(date);
      const result = await sendReport('tickets', date, formatSonaTicketsDailyText(report));
      return res.json({ kind, periodLabel: date, ...result });
    } catch (e) {
      return res.status(500).json({ kind, ok: false, error: e instanceof Error ? e.message : 'internal_error' });
    }
  }
  if (kind === 'auditor') {
    const date = String(req.body?.date ?? todayInTz());
    const to = String(req.body?.to ?? date);
    const end = to < date ? date : to;
    const report = await buildAuditorReport(date, end);
    const label = end !== date ? `${date}_${end}` : date;
    const result = await sendReport('auditor', label, formatAuditorText(report));
    return res.json({ kind, periodLabel: label, ...result });
  } else if (kind === 'daily') {
    const date = String(req.body?.date ?? todayInTz());
    const to = String(req.body?.to ?? date);
    const end = to < date ? date : to;
    const report = await buildDailyReport(date, end);
    const label = end !== date ? `${date}_${end}` : date;
    const result = await sendReport('daily', label, formatDailyText(report));
    return res.json({ kind, periodLabel: label, ...result });
  } else {
    const weekStart = String(req.body?.week ?? mondayOf(todayInTz()));
    const report = await buildWeeklyReport(weekStart);
    const result = await sendReport('weekly', isoWeekLabel(weekStart), formatWeeklyText(report));
    return res.json({ kind, periodLabel: isoWeekLabel(weekStart), ...result });
  }
});
