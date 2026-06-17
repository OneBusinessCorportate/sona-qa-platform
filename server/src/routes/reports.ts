import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { supabase } from '../supabase.js';
import { buildDailyReport, buildWeeklyReport, buildAuditorReport, formatDailyText, formatWeeklyText, formatAuditorText } from '../reports.js';
import { sendReport } from '../telegram.js';
import { isoWeekLabel, mondayOf, todayInTz } from '../time.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/daily', async (req: AuthedRequest, res: Response) => {
  const date = String(req.query.date ?? todayInTz());
  res.json(await buildDailyReport(date));
});

reportsRouter.get('/weekly', async (req: AuthedRequest, res: Response) => {
  const weekStart = String(req.query.week ?? mondayOf(todayInTz()));
  res.json(await buildWeeklyReport(weekStart));
});

// Дневной отчёт аудитора (проверено/всего + план на завтра).
reportsRouter.get('/auditor', async (req: AuthedRequest, res: Response) => {
  const date = String(req.query.date ?? todayInTz());
  res.json(await buildAuditorReport(date));
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
  const kind = req.body?.kind === 'weekly' ? 'weekly' : req.body?.kind === 'auditor' ? 'auditor' : 'daily';
  if (kind === 'auditor') {
    const date = String(req.body?.date ?? todayInTz());
    const report = await buildAuditorReport(date);
    const result = await sendReport('auditor', date, formatAuditorText(report));
    return res.json({ kind, periodLabel: date, ...result });
  } else if (kind === 'daily') {
    const date = String(req.body?.date ?? todayInTz());
    const report = await buildDailyReport(date);
    const result = await sendReport('daily', date, formatDailyText(report));
    return res.json({ kind, periodLabel: date, ...result });
  } else {
    const weekStart = String(req.body?.week ?? mondayOf(todayInTz()));
    const report = await buildWeeklyReport(weekStart);
    const result = await sendReport('weekly', isoWeekLabel(weekStart), formatWeeklyText(report));
    return res.json({ kind, periodLabel: isoWeekLabel(weekStart), ...result });
  }
});
