import { env, telegramConfigured } from './env.js';
import { supabase } from './supabase.js';

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

// Sends an HTML message to the configured Telegram chat and logs it to
// sqa_notifications (unique on kind+period_label prevents duplicate sends).
export async function sendReport(kind: 'daily' | 'weekly', periodLabel: string, text: string): Promise<SendResult> {
  if (!telegramConfigured()) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping send.');
    return { ok: false, skipped: true, error: 'telegram_not_configured' };
  }

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.telegramChatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const json = (await resp.json()) as { ok: boolean; description?: string };
    if (!json.ok) { status = 'failed'; error = json.description ?? 'telegram_error'; }
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : 'fetch_failed';
  }

  // upsert keeps one row per (kind, period_label); records last attempt outcome.
  await supabase.from('sqa_notifications').upsert(
    { kind, period_label: periodLabel, chat_id: env.telegramChatId, status, payload: text, error: error ?? null },
    { onConflict: 'kind,period_label' },
  );

  return { ok: status === 'sent', error };
}
