import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from repo root (one level up from /server) and local.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  adminEmail: process.env.SQA_ADMIN_EMAIL ?? '',
  adminPassword: process.env.SQA_ADMIN_PASSWORD ?? '',
  cronEnabled: (process.env.CRON_ENABLED ?? 'false') === 'true',
  cronDaily: process.env.CRON_DAILY ?? '0 18 * * *',
  cronWeekly: process.env.CRON_WEEKLY ?? '0 9 * * 1',
  tz: process.env.TZ ?? 'Asia/Yerevan',
};

export const telegramConfigured = () => Boolean(env.telegramBotToken && env.telegramChatId);
