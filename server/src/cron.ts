import cron from 'node-cron';
import { env, telegramConfigured } from './env.js';
import { buildDailyReport, buildWeeklyReport, formatDailyText, formatWeeklyText } from './reports.js';
import { buildSonaTicketsDaily, formatSonaTicketsDailyText } from './ticketsDaily.js';
import { sendReport } from './telegram.js';
import { isoWeekLabel, mondayOf, todayInTz, yesterdayInTz } from './time.js';

export function startCron() {
  if (!env.cronEnabled && !env.cronTicketsEnabled) {
    console.log('Cron disabled (CRON_ENABLED != true). Reports can still be sent manually.');
    return;
  }
  if (!telegramConfigured()) {
    console.warn('Cron enabled but Telegram not configured — scheduled sends will be skipped.');
  }

  if (env.cronTicketsEnabled) {
    cron.schedule(env.cronTicketsDaily, async () => {
      try {
        // Report the day that just closed at the 19:00 cutoff, not "today":
        // Sona enters checks late/back-dated, so yesterday's checking_date is
        // complete by now while today's is still filling up. See yesterdayInTz.
        const date = yesterdayInTz();
        const report = await buildSonaTicketsDaily(date);
        const r = await sendReport('tickets', date, formatSonaTicketsDailyText(report));
        console.log(`[cron] sona-tickets ${date}:`, r);
      } catch (e) {
        // A failing count/send must never take the platform down.
        console.error('[cron] sona-tickets failed:', e);
      }
    }, { timezone: env.tz });
    console.log(`Sona tickets cron started (tz=${env.tz}, schedule="${env.cronTicketsDaily}").`);
  }

  if (!env.cronEnabled) return;

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
