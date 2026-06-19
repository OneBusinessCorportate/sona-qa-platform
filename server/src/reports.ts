import { supabase } from './supabase.js';
import {
  reviewToCriteria, averageCriteria, itogQ, scorecardLevel,
  type Criteria,
} from './efficiency.js';

// Report builders over the sqa_* views. The auditor report mirrors the format
// Sona already sends ("проверено/всего" per accountant + plan for the next day);
// the daily/weekly reports are supplementary summaries for the team.

export interface FinanceTotals { income: number; expense: number }

// One income/expense line Sona logs on a review.
interface FinanceLine { kind?: string; section?: string; amount?: number | string; note?: string }
export interface CompanyFinance {
  agr_no: string;
  name: string;
  accountant: string | null;
  income: number;
  expense: number;
  lines: Array<{ kind: 'income' | 'expense'; section: string; amount: number; note: string | null }>;
}

export interface DailyReport {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null; avgEfficiency: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_score: number | null; avg_efficiency: number | null; problems: number }>;
  finance: FinanceTotals;
  financeByCompany: CompanyFinance[];
  openTickets: number;
  urgentTickets: number;
}

// Group the income/expense lines Sona logs into a per-company breakdown
// (which company, which section, how much income vs expense) — points 6 & 7.
export function financeByCompany(
  rows: Array<{ company_agr_no?: string; accountant?: string | null; financials?: any }> | null | undefined,
  names: Map<string, string>,
): CompanyFinance[] {
  const byCo = new Map<string, CompanyFinance>();
  for (const r of rows ?? []) {
    const agr = r.company_agr_no ?? '';
    const lines = Array.isArray(r.financials) ? (r.financials as FinanceLine[]) : [];
    for (const f of lines) {
      const kind = f?.kind === 'income' ? 'income' : f?.kind === 'expense' ? 'expense' : null;
      if (!kind) continue;
      const amount = Number(f?.amount) || 0;
      let co = byCo.get(agr);
      if (!co) {
        co = { agr_no: agr, name: names.get(agr) ?? agr, accountant: r.accountant ?? null, income: 0, expense: 0, lines: [] };
        byCo.set(agr, co);
      }
      co[kind] += amount;
      co.lines.push({ kind, section: String(f?.section ?? '').trim() || '—', amount, note: f?.note ?? null });
    }
  }
  return [...byCo.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}

export const sumFinance = (cos: CompanyFinance[]): FinanceTotals =>
  cos.reduce<FinanceTotals>((t, c) => ({ income: t.income + c.income, expense: t.expense + c.expense }), { income: 0, expense: 0 });

export async function buildDailyReport(date: string): Promise<DailyReport> {
  const { data: totalsRows } = await supabase.from('sqa_daily_report').select('*').eq('checking_date', date);
  const t = totalsRows?.[0];
  const { data: byAcc } = await supabase.from('sqa_accountant_daily').select('*').eq('checking_date', date);
  const { data: finRows } = await supabase
    .from('sqa_reviews').select('company_agr_no, accountant, financials').eq('checking_date', date);
  const agrNos = [...new Set((finRows ?? []).map((r) => r.company_agr_no).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (agrNos.length) {
    const { data: chats } = await supabase.from('mqa_chats').select('agr_no, name_agr, name_tax').in('agr_no', agrNos);
    for (const c of chats ?? []) names.set(c.agr_no, c.name_agr ?? c.name_tax ?? c.agr_no);
  }
  const coFinance = financeByCompany(finRows, names);
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
    finance: sumFinance(coFinance),
    financeByCompany: coFinance,
    openTickets: openTickets ?? 0,
    urgentTickets: urgentTickets ?? 0,
  };
}

// ── Weighted scorecard ("Общая оценка") over a date range ─────────────────
export interface ScorecardRow extends Criteria {
  accountant: string;
  reviews: number;
  auto: Criteria; // auto-derived baseline (before overrides), for the UI
  itogQ: number;
  level: string;
  overridden: boolean;
}
export interface Scorecard { from: string; to: string; rows: ScorecardRow[] }

export async function buildScorecard(from: string, to: string): Promise<Scorecard> {
  const { data: reviews } = await supabase
    .from('sqa_reviews')
    .select('accountant, record_type, scores')
    .gte('checking_date', from)
    .lte('checking_date', to);

  // Group reviews per accountant and derive average К1..К5.
  const groups = new Map<string, Criteria[]>();
  for (const r of reviews ?? []) {
    const name = r.accountant?.trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(reviewToCriteria(r as any));
  }

  const { data: overrides } = await supabase
    .from('sqa_efficiency_overrides').select('*').eq('period_from', from).eq('period_to', to);
  const ovMap = new Map((overrides ?? []).map((o) => [o.accountant, o]));

  const rows: ScorecardRow[] = [...groups.entries()].map(([accountant, list]) => {
    const auto = averageCriteria(list);
    const ov = ovMap.get(accountant);
    // Any non-null override value replaces the derived one.
    const merged: Criteria = {
      k1: ov?.k1 ?? auto.k1, k2: ov?.k2 ?? auto.k2, k3: ov?.k3 ?? auto.k3,
      k4: ov?.k4 ?? auto.k4, k5: ov?.k5 ?? auto.k5,
    };
    const q = itogQ(merged);
    return {
      accountant, reviews: list.length, ...merged, auto,
      itogQ: q, level: scorecardLevel(q),
      overridden: Boolean(ov && [ov.k1, ov.k2, ov.k3, ov.k4, ov.k5].some((v) => v !== null && v !== undefined)),
    };
  });

  rows.sort((a, b) => b.itogQ - a.itogQ);
  return { from, to, rows };
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

// "Дневной отчёт аудитора" — Sona's format: per-accountant "проверено/всего"
// for the day plus the plan for the next day.
export interface AuditorReport {
  date: string;
  planDate: string;
  reports: Array<{ accountant: string; checked: number; total: number; avgScore: number | null }>;
  plan: Array<{ accountant: string; planned_reports: number; note: string | null }>;
}

const nextDay = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const ddmmyy = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

export async function buildAuditorReport(date: string): Promise<AuditorReport> {
  const planDate = nextDay(date);
  const { data: byAcc } = await supabase.from('sqa_accountant_daily').select('*').eq('checking_date', date);
  const { data: workload } = await supabase.from('sqa_accountant_workload').select('accountant, total_reports');
  const { data: plan } = await supabase
    .from('sqa_daily_plan').select('accountant, planned_reports, note').eq('plan_date', planDate);

  const totals = new Map<string, number>();
  for (const w of workload ?? []) totals.set(w.accountant, w.total_reports ?? 0);

  return {
    date,
    planDate,
    reports: (byAcc ?? [])
      .map((r) => ({
        accountant: r.accountant,
        checked: r.reviews_count ?? 0,
        total: totals.get(r.accountant) ?? 0,
        avgScore: r.avg_efficiency ?? null,
      }))
      .sort((a, b) => a.accountant.localeCompare(b.accountant)),
    plan: (plan ?? []).map((p) => ({ accountant: p.accountant, planned_reports: p.planned_reports ?? 0, note: p.note ?? null })),
  };
}

export function formatAuditorText(r: AuditorReport): string {
  const lines = [`📑 <b>ЕЖЕДНЕВНЫЙ ОТЧЁТ АУДИТОРА — ${ddmmyy(r.date)}</b>`, ``, `<b>ОТЧЁТЫ:</b>`];
  if (r.reports.length) {
    r.reports.forEach((a, i) => {
      const eff = a.avgScore === null ? '' : ` · ср. ${a.avgScore}%`;
      lines.push(`${i + 1}. ${a.accountant} — ${a.checked}/${a.total} (проверено/всего)${eff}`);
    });
  } else {
    lines.push('— за день проверок не зафиксировано');
  }
  lines.push(``, `<b>План на завтра: ${ddmmyy(r.planDate)}</b>`);
  if (r.plan.length) {
    for (const p of r.plan) lines.push(`${p.accountant} — ${p.planned_reports} отчётов${p.note ? ` (${p.note})` : ''}`);
  } else {
    lines.push('— план не задан');
  }
  return lines.join('\n');
}

export function formatDailyText(r: DailyReport): string {
  const lines = [
    `📋 <b>Сводка за ${ddmmyy(r.date)}</b>`,
    ``,
    `Проверок: <b>${r.totals.reviews}</b> · Компаний: <b>${r.totals.companies}</b>`,
    `Средняя оценка: <b>${pct(r.totals.avgEfficiency)}</b> · Проблем: <b>${r.totals.problems}</b>`,
    `Открытых тикетов: <b>${r.openTickets}</b> · 🔴 Срочных: <b>${r.urgentTickets}</b>`,
  ];
  if (r.finance.income || r.finance.expense) {
    lines.push(`Доход: <b>${r.finance.income.toLocaleString('ru-RU')}</b> · Расход: <b>${r.finance.expense.toLocaleString('ru-RU')}</b>`);
  }
  if (r.byAccountant.length) {
    lines.push(``, `<b>По бухгалтерам:</b>`);
    for (const a of r.byAccountant) {
      lines.push(`• ${a.accountant}: ${a.reviews} — ${pct(a.avg_efficiency)}${a.problems ? `, проблем ${a.problems}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function formatWeeklyText(r: WeeklyReport): string {
  return [
    `🗓 <b>Недельный отчёт (с ${r.weekStart})</b>`,
    ``,
    `Проверок: <b>${r.totals.reviews}</b> · Компаний: <b>${r.totals.companies}</b> · Бухгалтеров: <b>${r.totals.accountants}</b>`,
    `Средняя оценка: <b>${pct(r.totals.avgEfficiency)}</b> · Проблем: <b>${r.totals.problems}</b>`,
    ``,
    `Объём проверок: ${r.efficiency.totalReviews} за ${r.efficiency.activeDays} дн. (≈ ${n(r.efficiency.avgPerDay)}/день)`,
  ].join('\n');
}
