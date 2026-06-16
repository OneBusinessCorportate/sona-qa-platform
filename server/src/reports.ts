import { supabase } from './supabase.js';

// NOTE (TODO): The exact metrics/structure of the final report must mirror the
// sample Sona already sends (to be provided by Lilit). The functions below are a
// baseline built on the sqa_* views; adjust column selection / formatting once the
// reference report is available.

export interface DailyReport {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_score: number | null; problems: number }>;
  openTickets: number;
  urgentTickets: number;
}

export async function buildDailyReport(date: string): Promise<DailyReport> {
  const { data: totalsRows } = await supabase.from('sqa_daily_report').select('*').eq('checking_date', date);
  const t = totalsRows?.[0];
  const { data: byAcc } = await supabase.from('sqa_accountant_daily').select('*').eq('checking_date', date);
  const { count: openTickets } = await supabase
    .from('sqa_tickets').select('id', { count: 'exact', head: true }).neq('status', 'done').neq('status', 'cancelled');
  const { count: urgentTickets } = await supabase
    .from('sqa_tickets').select('id', { count: 'exact', head: true }).eq('urgent', true).neq('status', 'done').neq('status', 'cancelled');

  return {
    date,
    totals: {
      reviews: t?.reviews_count ?? 0,
      companies: t?.companies_checked ?? 0,
      problems: t?.problems ?? 0,
      praises: t?.praises ?? 0,
      avgAccountant: t?.avg_score_accountant ?? null,
      avgClient: t?.avg_score_client ?? null,
    },
    byAccountant: (byAcc ?? []).map((r) => ({
      accountant: r.accountant, reviews: r.reviews_count, avg_score: r.avg_score, problems: r.problems,
    })),
    openTickets: openTickets ?? 0,
    urgentTickets: urgentTickets ?? 0,
  };
}

export interface WeeklyReport {
  weekStart: string;
  totals: { reviews: number; companies: number; accountants: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null };
  efficiency: { totalReviews: number; activeDays: number; avgPerDay: number | null };
}

export async function buildWeeklyReport(weekStart: string): Promise<WeeklyReport> {
  const { data: w } = await supabase.from('sqa_weekly_report').select('*').eq('week_start', weekStart);
  const r = w?.[0];
  const { data: e } = await supabase.from('sqa_sona_efficiency').select('*').eq('week_start', weekStart);
  const eff = e?.[0];
  return {
    weekStart,
    totals: {
      reviews: r?.reviews_count ?? 0,
      companies: r?.companies_checked ?? 0,
      accountants: r?.accountants_covered ?? 0,
      problems: r?.problems ?? 0,
      praises: r?.praises ?? 0,
      avgAccountant: r?.avg_score_accountant ?? null,
      avgClient: r?.avg_score_client ?? null,
    },
    efficiency: {
      totalReviews: eff?.total_reviews ?? 0,
      activeDays: eff?.active_days ?? 0,
      avgPerDay: eff?.avg_reviews_per_day ?? null,
    },
  };
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

export function formatDailyText(r: DailyReport): string {
  const lines = [
    `📋 <b>Отчёт Соны за ${r.date}</b>`,
    ``,
    `Проверок: <b>${r.totals.reviews}</b> · Компаний: <b>${r.totals.companies}</b>`,
    `Проблем: <b>${r.totals.problems}</b> · Похвал: <b>${r.totals.praises}</b>`,
    `Средняя оценка — бухгалтер: <b>${n(r.totals.avgAccountant)}</b> · клиент: <b>${n(r.totals.avgClient)}</b>`,
    `Открытых тикетов: <b>${r.openTickets}</b> · 🔴 ОЧЕНЬ СРОЧНО: <b>${r.urgentTickets}</b>`,
  ];
  if (r.byAccountant.length) {
    lines.push(``, `<b>По бухгалтерам:</b>`);
    for (const a of r.byAccountant) {
      lines.push(`• ${a.accountant}: ${a.reviews} проверок, ср. ${n(a.avg_score)}, проблем ${a.problems}`);
    }
  }
  return lines.join('\n');
}

export function formatWeeklyText(r: WeeklyReport): string {
  return [
    `🗓 <b>Недельный отчёт Соны (с ${r.weekStart})</b>`,
    ``,
    `Проверок: <b>${r.totals.reviews}</b> · Компаний: <b>${r.totals.companies}</b> · Бухгалтеров: <b>${r.totals.accountants}</b>`,
    `Проблем: <b>${r.totals.problems}</b> · Похвал: <b>${r.totals.praises}</b>`,
    `Средняя оценка — бухгалтер: <b>${n(r.totals.avgAccountant)}</b> · клиент: <b>${n(r.totals.avgClient)}</b>`,
    ``,
    `<b>Эффективность Соны:</b> ${r.efficiency.totalReviews} проверок за ${r.efficiency.activeDays} дн. (≈ ${n(r.efficiency.avgPerDay)}/день)`,
  ].join('\n');
}
