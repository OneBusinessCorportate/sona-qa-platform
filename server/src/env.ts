import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from repo root (one level up from /server) and local.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Returns the first non-empty env var among the given names, or throws.
function requiredAny(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  throw new Error(`Missing required env var (one of): ${names.join(', ')}`);
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  supabaseUrl: requiredAny('SUPABASE_URL'),
  // Accept either name; Supabase's canonical is SUPABASE_SERVICE_ROLE_KEY.
  supabaseServiceKey: requiredAny('SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  adminEmail: process.env.SQA_ADMIN_EMAIL ?? '',
  adminPassword: process.env.SQA_ADMIN_PASSWORD ?? '',
  // Auth is OFF by default for now (open access). Set REQUIRE_AUTH=true to re-enable login.
  authRequired: (process.env.REQUIRE_AUTH ?? 'false') === 'true',
  cronEnabled: (process.env.CRON_ENABLED ?? 'false') === 'true',
  cronDaily: process.env.CRON_DAILY ?? '0 18 * * *',
  cronWeekly: process.env.CRON_WEEKLY ?? '0 9 * * 1',
  // Daily Sona ticket-count report. Can be enabled on its own via
  // CRON_TICKETS_ENABLED without turning on the other scheduled reports.
  cronTicketsEnabled: (process.env.CRON_TICKETS_ENABLED ?? process.env.CRON_ENABLED ?? 'false') === 'true',
  cronTicketsDaily: process.env.CRON_TICKETS_DAILY ?? '0 19 * * *',
  // The Sona ticket day closes at this local hour: the report for date D counts
  // [D-1 19:00 .. D 19:00); everything after the cutoff goes to the next day.
  ticketsCutoffHour: Number(process.env.TICKETS_DAY_CUTOFF_HOUR ?? 19),
  // Optional shared secret for the public /api/cron/* endpoints (Render Cron).
  cronSecret: process.env.CRON_SECRET ?? '',
  tz: process.env.TZ ?? 'Asia/Yerevan',

  // Company reference — live Google Sheets sync (Наири's master "Agreements"
  // sheet). Defaults point at that sheet; its CSV export must be link-readable.
  googleSheetId: process.env.GOOGLE_SHEET_ID ?? '1HEy3QVrl-gFUtPAnPRpnKp7ZYEHtksgRBXb5PbtE514',
  googleSheetGid: process.env.GOOGLE_SHEET_GID ?? '569387782',
  // 'sheet' (default) pulls companies live from Google Sheets; 'supabase'
  // reverts to the shared mqa_chats reference table.
  companiesSource: (process.env.COMPANIES_SOURCE ?? 'sheet') as 'sheet' | 'supabase',
  // How long a fetched sheet snapshot is served before the next refresh.
  companiesCacheTtlMs: Number(process.env.COMPANIES_CACHE_TTL_MS ?? 5 * 60 * 1000),
};

export const telegramConfigured = () => Boolean(env.telegramBotToken && env.telegramChatId);
