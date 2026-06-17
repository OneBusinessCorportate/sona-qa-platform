import { supabase } from './supabase.js';

// NOTE (TODO): The exact metrics/structure of the final report must mirror the
// sample Sona already sends (to be provided by Lilit). The functions below are a
// baseline built on the sqa_* views; adjust column selection / formatting once the
// reference report is available.

export interface FinanceTotals { income: number; expense: number }

export interface DailyReport {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null; avgEfficiency: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_score: number | null; avg_efficiency: number | null; problems: number }>;
  finance: FinanceTotals;
  openTickets: number;
  urgentTickets: number;
}

// Sums the income/expense line items Sona logs across a set of reviews.
function sumFinancials(rows: Array<{ financials?: any }> | null | undefined): FinanceTotals {
  let income = 0;
  let expense = 0;
  for (const r of rows ?? []) {
    for (const f of Array.isArray(r.financials) ? r.financials : []) {
      const amount = Number(f?.amount) || 0;
      if (f?.kind === 'income') income += amount;
      else if (f?.kind === 'expense') expense += amount;
    }
  }
  return { income, expense };
}

export async function buildDailyReport(date: string): Promise<DailyReport> {
  const { data: totalsRows } = await supabase.from('sqa_daily_report').select('*').eq('checking_date', date);
  const t = totalsRows?.[0];
  const { data: byAcc } = await supabase.from('sqa_accountant_daily').select('*').eq('checking_date', date);
  const { data: finRows } = await supabase.from('sqa_reviews').select('financials').eq('checking_date', date);
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
      avgEfficiency: t?.avg_efficiency ?? null,
    },
    byAccountant: (byAcc ?? []).map((r) => ({
      accountant: r.accountant, reviews: r.reviews_count, avg_score: r.avg_score, avg_efficiency: r.avg_efficiency, problems: r.problems,
    })),
    finance: sumFinancials(finRows),
    openTickets: openTickets ?? 0,
    urgentTickets: urgentTickets ?? 0,
  };
}

export interface WeeklyReport {
  weekStart: string;
  totals: { reviews: number; companies: number; accountants: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null; avgEfficiency: number | null };
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
      avgEfficiency: r?.avg_efficiency ?? null,
    },
    efficiency: {
      totalReviews: eff?.total_reviews ?? 0,
      activeDays: eff?.active_days ?? 0,
      avgPerDay: eff?.avg_reviews_per_day ?? null,
    },
  };
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
const money = (v: number) => v.toLocaleString('ru-RU');

export function formatDailyText(r: DailyReport): string {
  const lines = [
    `📋 <b>Отчёт Соны за ${r.date}</b>`,
    ``,
    `Проверок: <b>${r.totals.reviews}</b> · Компаний: <b>${r.totals.companies}</b>`,
    `Проблем: <b>${r.totals.problems}</b> · Похвал: <b>${r.totals.praises}</b>`,
    `Средняя оценка — бухгалтер: <b>${n(r.totals.avgAccountant)}</b> · клиент: <b>${n(r.totals.avgClient)}</b>`,
    `⚙️ Эффективность бухгалтеров: <b>${pct(r.totals.avgEfficiency)}</b>`,
    `💰 Доходы: <b>${money(r.finance.income)}</b> · Расходы: <b>${money(r.finance.expense)}</b>`,
    `Открытых тикетов: <b>${r.openTickets}</b> · 🔴 ОЧЕНЬ СРОЧНО: <b>${r.urgentTickets}</b>`,
  ];
  if (r.byAccountant.length) {
    lines.push(``, `<b>По бухгалтерам:</b>`);
    for (const a of r.byAccountant) {
      lines.push(`• ${a.accountant}: ${a.reviews} проверок, ср. ${n(a.avg_score)}, эфф. ${pct(a.avg_efficiency)}, проблем ${a.problems}`);
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
    `⚙️ Эффективность бухгалтеров: <b>${pct(r.totals.avgEfficiency)}</b>`,
    ``,
    `<b>Эффективность Соны:</b> ${r.efficiency.totalReviews} проверок за ${r.efficiency.activeDays} дн. (≈ ${n(r.efficiency.avgPerDay)}/день)`,
  ].join('\n');
}
