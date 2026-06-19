import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  financeByCompany, sumFinance,
  buildScorecard, // not called (needs DB), only imported to ensure it stays exported
  avgPct, markOf,
  formatAuditorText, formatDailyText,
  type DailyReport, type AuditorReport,
} from './reports.js';

void buildScorecard;

const perfect = {
  overdue: 'no', signed: 'yes', correct: 'yes', confirmed: 'yes', format: 'yes',
  errors: 'no', desk_audit: 'no', penalties: 'no', standards: 'yes',
};

test('avgPct: averages stored percentages, ignores missing', () => {
  assert.equal(avgPct([{ efficiency_pct: 100 }, { efficiency_pct: 80 }]), 90);
  assert.equal(avgPct([{ efficiency_pct: 88.89 }, { efficiency_pct: null }]), 88.89);
  assert.equal(avgPct([]), null);
  assert.equal(avgPct([{ efficiency_pct: null }]), null);
});

test('markOf: empty window → Итог Q 0, pct null, 0 reviews', () => {
  assert.deepEqual(markOf([]), {
    itogQ: 0, pct: null, reviews: 0, level: 'Административные меры / доп. обучение',
  });
});

test('markOf: derives Итог Q + avg % from the window', () => {
  const m = markOf([
    { scores: { checklist: perfect }, record_type: 'other', efficiency_pct: 100 },
    { scores: { checklist: perfect }, record_type: 'other', efficiency_pct: 100 },
  ]);
  assert.equal(m.itogQ, 100);
  assert.equal(m.pct, 100);
  assert.equal(m.reviews, 2);
  assert.equal(m.level, 'Премирование, кадровый резерв');
});

const names = new Map([['100', 'ООО Ромашка'], ['200', 'ИП Иванов']]);

test('financeByCompany: groups income/expense per company', () => {
  const rows = [
    { company_agr_no: '100', accountant: 'Лилит', financials: [
      { kind: 'income', section: 'Продажи', amount: 1000 },
      { kind: 'expense', section: 'Аренда', amount: 300 },
    ] },
    { company_agr_no: '100', accountant: 'Лилит', financials: [
      { kind: 'income', section: 'Услуги', amount: 500 },
    ] },
    { company_agr_no: '200', accountant: 'Оля', financials: [
      { kind: 'expense', section: 'Налоги', amount: 700 },
    ] },
  ];
  const out = financeByCompany(rows, names);
  const c100 = out.find((c) => c.agr_no === '100')!;
  assert.equal(c100.name, 'ООО Ромашка');
  assert.equal(c100.income, 1500);
  assert.equal(c100.expense, 300);
  assert.equal(c100.lines.length, 3);
  const c200 = out.find((c) => c.agr_no === '200')!;
  assert.equal(c200.expense, 700);
  assert.equal(c200.income, 0);
});

test('financeByCompany: unknown kind ignored, missing section → "—", amount coerced', () => {
  const out = financeByCompany(
    [{ company_agr_no: '100', accountant: null, financials: [
      { kind: 'bogus', amount: 999 },
      { kind: 'income', amount: '250' },
    ] }],
    names,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].income, 250);
  assert.equal(out[0].lines.length, 1);
  assert.equal(out[0].lines[0].section, '—');
});

test('financeByCompany: name falls back to agr_no when unknown', () => {
  const out = financeByCompany([{ company_agr_no: '999', financials: [{ kind: 'income', amount: 1 }] }], names);
  assert.equal(out[0].name, '999');
});

test('financeByCompany: empty / no financials → empty', () => {
  assert.deepEqual(financeByCompany([], names), []);
  assert.deepEqual(financeByCompany([{ company_agr_no: '100', financials: [] }], names), []);
  assert.deepEqual(financeByCompany(null, names), []);
});

test('sumFinance: totals across companies', () => {
  const cos = financeByCompany([
    { company_agr_no: '100', financials: [{ kind: 'income', amount: 1000 }, { kind: 'expense', amount: 300 }] },
    { company_agr_no: '200', financials: [{ kind: 'expense', amount: 700 }] },
  ], names);
  assert.deepEqual(sumFinance(cos), { income: 1000, expense: 1000 });
});

const baseDaily: DailyReport = {
  date: '2026-06-15',
  totals: { reviews: 12, companies: 12, problems: 1, praises: 0, avgAccountant: null, avgClient: null, avgEfficiency: 88 },
  byAccountant: [{ accountant: 'Наира З.', reviews: 12, avg_score: 88, avg_efficiency: 88, problems: 1 }],
  finance: { income: 1500, expense: 1000 },
  financeByCompany: [],
  openTickets: 2,
  urgentTickets: 1,
};

test('formatDailyText: includes finance line and date dd/mm/yy', () => {
  const txt = formatDailyText(baseDaily);
  assert.match(txt, /Сводка за 15\/06\/26/);
  assert.match(txt, /Доход:/);
  assert.match(txt, /Расход:/);
  assert.match(txt, /Наира З\./);
});

test('formatDailyText: no finance line when zero', () => {
  const txt = formatDailyText({ ...baseDaily, finance: { income: 0, expense: 0 } });
  assert.doesNotMatch(txt, /Доход:/);
});

const auditor: AuditorReport = {
  date: '2026-06-15',
  planDate: '2026-06-16',
  reports: [{ accountant: 'Наира З.', checked: 12, total: 63, avgScore: 88 }],
  plan: [{ accountant: 'Аваг', planned_reports: 10, note: null }],
};

test('formatAuditorText: matches Sona\'s "проверено/всего" format', () => {
  const txt = formatAuditorText(auditor);
  assert.match(txt, /ЕЖЕДНЕВНЫЙ ОТЧЁТ АУДИТОРА — 15\/06\/26/);
  assert.match(txt, /Наира З\. — 12\/63 \(проверено\/всего\)/);
  assert.match(txt, /План на завтра: 16\/06\/26/);
  assert.match(txt, /Аваг — 10 отчётов/);
});
