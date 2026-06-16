import cron from 'node-cron';
import { env, telegramConfigured } from './env.js';
import { buildDailyReport, buildWeeklyReport, formatDailyText, formatWeeklyText } from './reports.js';
import { sendReport } from './telegram.js';
import { isoWeekLabel, mondayOf, todayInTz } from './time.js';

export function startCron() {
  if (!env.cronEnabled) {
    console.log('Cron disabled (CRON_ENABLED != true). Reports can still be sent manually.');
    return;
  }
  if (!telegramConfigured()) {
    console.warn('Cron enabled but Telegram not configured — scheduled sends will be skipped.');
  }

  cron.schedule(env.cronDaily, async () => {
    const date = todayInTz();
    const report = await buildDailyReport(date);
    const r = await sendReport('daily', date, formatDailyText(report));
    console.log(`[cron] daily ${date}:`, r);
  }, { timezone: env.tz });

  cron.schedule(env.cronWeekly, async () => {
    // Report on the week that just ended.
    const lastWeekMonday = mondayOf(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const report = await buildWeeklyReport(lastWeekMonday);
    const r = await sendReport('weekly', isoWeekLabel(lastWeekMonday), formatWeeklyText(report));
    console.log(`[cron] weekly ${lastWeekMonday}:`, r);
  }, { timezone: env.tz });

  console.log(`Cron started (tz=${env.tz}, daily="${env.cronDaily}", weekly="${env.cronWeekly}").`);
}
