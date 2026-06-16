import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { supabase } from '../supabase.js';
import { buildDailyReport, buildWeeklyReport, formatDailyText, formatWeeklyText } from '../reports.js';
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
  const kind = req.body?.kind === 'weekly' ? 'weekly' : 'daily';
  if (kind === 'daily') {
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
