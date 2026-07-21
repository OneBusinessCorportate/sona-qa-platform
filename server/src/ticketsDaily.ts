import type { Request, Response } from 'express';
import { env } from './env.js';
import { supabase } from './supabase.js';
import { sendReport } from './telegram.js';
import { todayInTz } from './time.js';

// Ежедневный подсчёт тикетов/проверок Sona — single source of truth shared by
// the Telegram report AND the dashboard "Подсчёт тикетов" section. Counts the
// technical checks Sona performed on a given LOCAL day and breaks them down per
// accountant.
//
// A "detected ticket/check" IS one sqa_reviews row (one company check Sona did),
// so there is no separate detection table to drift out of sync.
//
// The day is keyed on `checking_date` — the date Sona says she performed the
// check — NOT on `created_at` (when the row was inserted). Sona enters reviews
// in batches, often a day late or back-dated, so binning by insertion time put
// checks on the wrong day and produced spurious 0-ticket days. `checking_date`
// is exactly what every other report/dashboard already uses, so Telegram and
// the dashboard now agree by construction.
//
// Scope: ONLY the Sona QA platform (sqa_*). AI and Margarita detections live in
// separate mqa_* tables and are never read here; as an explicit guard we also
// drop any sqa_reviews row whose reviewer is an AI/Margarita marker (see
// isSonaCheck) so such data could never leak into the count.

export type AccountantResponse = 'pending' | 'agreed' | 'appealed';
export type AppealDecision = 'accepted' | 'rejected' | null;
export type ConfirmationStatus = 'pending' | 'confirmed' | 'incorrect' | 'needs_review';

export interface SonaTicketCheck {
  id: string; // sqa_reviews.id
  checkingDate: string;
  accountant: string;
  companyAgrNo: string;
  companyName: string | null;
  reportType: string | null;
  recordType: string | null;
  efficiencyPct: number | null;
  evidence: string | null; // Sona's comment on the review — the visible proof
  reviewer: string;
  hasTicket: boolean; // produced an accountant ticket (record_type = 'problem')
  ticketId: string | null;
  accountantResponse: AccountantResponse;
  appealDecision: AppealDecision;
}

export interface ResponseSummary {
  total: number;
  agreed: number;
  appealed: number;
  appealAccepted: number;
  appealRejected: number;
  pending: number;
}

export interface AccountantBreakdown extends ResponseSummary {
  accountant: string;
  count: number; // = total; kept for the Telegram formatter / back-compat
}

export interface SonaTicketConfirmation {
  checkDate: string;
  detectedTotal: number;
  correctedTotal: number | null;
  confirmationStatus: ConfirmationStatus;
  confirmedBySona: boolean;
  sonaComment: string | null;
  confirmedAt: string | null;
}

export interface SonaTicketsDaily {
  date: string; // local day (env.tz) being counted, keyed on checking_date
  total: number; // Sona technical checks that day (AI/Margarita excluded)
  ticketsCreated: number; // of those, how many produced an accountant ticket
  byAccountant: AccountantBreakdown[];
  responses: ResponseSummary;
  confirmation: SonaTicketConfirmation | null;
  checks: SonaTicketCheck[]; // per-check evidence rows for the dashboard
}

export const NO_ACCOUNTANT = 'Без бухгалтера';

// One stored review as far as counting cares about it.
interface ReviewRow {
  id: string;
  accountant?: string | null;
  company_agr_no?: string | null;
  report_type?: string | null;
  record_type?: string | null;
  efficiency_pct?: number | null;
  comment?: string | null;
  reviewer?: string | null;
  checking_date?: string | null;
  accountant_response_status?: string | null;
  sona_appeal_decision?: string | null;
}

// A review counts as a Sona technical check unless its reviewer is an AI or
// Margarita marker. sqa_reviews is already Sona-only (reviewer defaults to
// 'Sona' / Sona's login email), but this keeps the exclusion explicit and safe
// if a non-Sona reviewer is ever written.
export function isSonaCheck(row: { reviewer?: string | null }): boolean {
  const r = (row.reviewer ?? '').trim().toLowerCase();
  if (!r) return true; // unlabelled → treat as Sona's own
  if (r.includes('margarita') || r.includes('марг')) return false; // Margarita detections
  if (r.includes('бот') || r.includes('bot')) return false; // bot detections
  // "ai" as a standalone word/prefix (JS \b is ASCII-only, so match explicitly).
  if (/(^|[^a-z])ai([^a-z]|$)/.test(r)) return false;
  return true;
}

const normResponse = (v?: string | null): AccountantResponse =>
  v === 'agreed' || v === 'appealed' ? v : 'pending';
const normAppeal = (v?: string | null): AppealDecision =>
  v === 'accepted' || v === 'rejected' ? v : null;

const emptySummary = (): ResponseSummary =>
  ({ total: 0, agreed: 0, appealed: 0, appealAccepted: 0, appealRejected: 0, pending: 0 });

function tally(acc: ResponseSummary, resp: AccountantResponse, appeal: AppealDecision): void {
  acc.total += 1;
  if (resp === 'agreed') acc.agreed += 1;
  else if (resp === 'appealed') acc.appealed += 1;
  else acc.pending += 1;
  if (appeal === 'accepted') acc.appealAccepted += 1;
  else if (appeal === 'rejected') acc.appealRejected += 1;
}

// Per-accountant counts + response tally; blank names lump under NO_ACCOUNTANT.
export function summarizeByAccountant(checks: SonaTicketCheck[]): AccountantBreakdown[] {
  const by = new Map<string, AccountantBreakdown>();
  for (const c of checks) {
    const name = (c.accountant ?? '').trim() || NO_ACCOUNTANT;
    let row = by.get(name);
    if (!row) { row = { accountant: name, count: 0, ...emptySummary() }; by.set(name, row); }
    row.count += 1;
    tally(row, c.accountantResponse, c.appealDecision);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.accountant.localeCompare(b.accountant));
}

function mapConfirmation(row: any | null | undefined): SonaTicketConfirmation | null {
  if (!row) return null;
  return {
    checkDate: row.check_date,
    detectedTotal: row.detected_total ?? 0,
    correctedTotal: row.corrected_total ?? null,
    confirmationStatus: (row.confirmation_status ?? 'pending') as ConfirmationStatus,
    confirmedBySona: Boolean(row.confirmed_by_sona),
    sonaComment: row.sona_comment ?? null,
    confirmedAt: row.confirmed_at ?? null,
  };
}

export async function buildSonaTicketsDaily(date: string): Promise<SonaTicketsDaily> {
  console.log(`[sona-tickets] module=sqa (Sona QA only) day=${date} tz=${env.tz} keyed_on=checking_date`);

  const { data: rawRows, error } = await supabase
    .from('sqa_reviews')
    .select('id, accountant, company_agr_no, report_type, record_type, efficiency_pct, comment, reviewer, checking_date, accountant_response_status, sona_appeal_decision')
    .eq('checking_date', date)
    .limit(5000);
  if (error) throw new Error(`sqa_reviews query failed: ${error.message}`);

  // Exclude AI / Margarita detections (requirements 4 & 5).
  const rows = ((rawRows ?? []) as ReviewRow[]).filter(isSonaCheck);
  const reviewIds = rows.map((r) => r.id);

  // Which of these reviews produced an accountant ticket, and its id.
  const ticketByReview = new Map<string, string>();
  if (reviewIds.length) {
    const { data: tickets, error: tErr } = await supabase
      .from('sqa_tickets').select('id, review_id').in('review_id', reviewIds);
    if (tErr) console.warn(`[sona-tickets] sqa_tickets lookup failed (non-fatal): ${tErr.message}`);
    for (const t of tickets ?? []) if (t.review_id) ticketByReview.set(t.review_id, t.id);
  }

  // Resolve company names for the evidence table (best-effort).
  const names = new Map<string, string>();
  const agrNos = [...new Set(rows.map((r) => r.company_agr_no).filter(Boolean))] as string[];
  if (agrNos.length) {
    const { data: chats } = await supabase.from('mqa_chats').select('agr_no, name_agr, name_tax').in('agr_no', agrNos);
    for (const c of chats ?? []) names.set(c.agr_no, c.name_agr ?? c.name_tax ?? c.agr_no);
  }

  const checks: SonaTicketCheck[] = rows.map((r) => ({
    id: r.id,
    checkingDate: r.checking_date ?? date,
    accountant: (r.accountant ?? '').trim() || NO_ACCOUNTANT,
    companyAgrNo: r.company_agr_no ?? '',
    companyName: r.company_agr_no ? (names.get(r.company_agr_no) ?? null) : null,
    reportType: r.report_type ?? null,
    recordType: r.record_type ?? null,
    efficiencyPct: r.efficiency_pct ?? null,
    evidence: r.comment ?? null,
    reviewer: r.reviewer ?? 'Sona',
    hasTicket: ticketByReview.has(r.id),
    ticketId: ticketByReview.get(r.id) ?? null,
    accountantResponse: normResponse(r.accountant_response_status),
    appealDecision: normAppeal(r.sona_appeal_decision),
  }));

  const responses = emptySummary();
  for (const c of checks) tally(responses, c.accountantResponse, c.appealDecision);

  const { data: confRow } = await supabase
    .from('sqa_ticket_confirmations').select('*').eq('check_date', date).maybeSingle();

  const report: SonaTicketsDaily = {
    date,
    total: checks.length,
    ticketsCreated: [...ticketByReview.keys()].length,
    byAccountant: summarizeByAccountant(checks),
    responses,
    confirmation: mapConfirmation(confRow),
    checks,
  };
  console.log(
    `[sona-tickets] found=${report.total} checks (sqa_reviews by checking_date), ` +
    `ticketsCreated=${report.ticketsCreated}, accountants=${report.byAccountant.length}, ` +
    `confirmation=${report.confirmation?.confirmationStatus ?? 'none'}`,
  );
  return report;
}

const ddmmyyyy = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
};

export function formatSonaTicketsDailyText(r: SonaTicketsDaily): string {
  // «По бухгалтерам» is now a two-line appeal summary rather than a per-accountant
  // list, per Sona's request:
  //   • «Апелляций от бухгалтеров» — how many of Sona's checks the accountant
  //     disputed (accountant_response_status = 'appealed').
  //   • «Проверок от Сони» — how many of those appeals Sona has already ruled on
  //     (accepted + rejected, i.e. sona_appeal_decision is set).
  const appealsFromAccountants = r.responses.appealed;
  const sonaAppealReviews = r.responses.appealAccepted + r.responses.appealRejected;

  const lines = [
    `📊 <b>Ежедневный отчёт по тикетам Sona</b>`,
    ``,
    `Дата: ${ddmmyyyy(r.date)} (по дате проверки)`,
    ``,
    `Всего тикетов: <b>${r.total}</b>`,
    `(из них передано бухгалтерам как тикет: ${r.ticketsCreated})`,
    ``,
    `<b>По бухгалтерам:</b>`,
    `— Апелляций от бухгалтеров: <b>${appealsFromAccountants}</b>`,
    `— Проверок от Сони: <b>${sonaAppealReviews}</b>`,
  ];
  return lines.join('\n');
}

// Public entry point for Render Cron / GitHub Action
// (GET or POST /api/cron/sona-tickets-daily). Optional guard: when CRON_SECRET
// is set, the caller must pass it as ?token=… or the X-Cron-Secret header. When
// auth is enabled (REQUIRE_AUTH=true) the endpoint refuses to run without a
// CRON_SECRET so it can't become an open door. Errors are always caught and
// answered as JSON — a failing report or Telegram outage must never crash the
// platform.
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
