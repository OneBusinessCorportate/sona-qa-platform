import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSonaCheck, summarizeByAccountant, formatSonaTicketsDailyText, NO_ACCOUNTANT,
  type SonaTicketCheck, type SonaTicketsDaily,
} from './ticketsDaily.js';

const check = (over: Partial<SonaTicketCheck>): SonaTicketCheck => ({
  id: Math.random().toString(36).slice(2),
  checkingDate: '2026-07-07',
  accountant: 'Aida',
  companyAgrNo: 'A1',
  companyName: 'Co',
  reportType: 'vat',
  recordType: 'other',
  efficiencyPct: 90,
  evidence: null,
  reviewer: 'Sona',
  hasTicket: false,
  ticketId: null,
  accountantResponse: 'pending',
  appealDecision: null,
  ...over,
});

test('isSonaCheck: keeps Sona/email/blank, drops AI and Margarita', () => {
  assert.equal(isSonaCheck({ reviewer: 'Sona' }), true);
  assert.equal(isSonaCheck({ reviewer: 'sona@onebusiness.am' }), true);
  assert.equal(isSonaCheck({ reviewer: '' }), true);
  assert.equal(isSonaCheck({ reviewer: null }), true);
  assert.equal(isSonaCheck({ reviewer: 'AI' }), false);
  assert.equal(isSonaCheck({ reviewer: 'AI detector' }), false);
  assert.equal(isSonaCheck({ reviewer: 'Бот' }), false);
  assert.equal(isSonaCheck({ reviewer: 'Margarita' }), false);
  assert.equal(isSonaCheck({ reviewer: 'Маргарита' }), false);
});

test('summarizeByAccountant: groups, lumps blanks, tallies responses', () => {
  const checks = [
    check({ accountant: 'Gayane', accountantResponse: 'agreed' }),
    check({ accountant: 'Gayane', accountantResponse: 'appealed', appealDecision: 'accepted' }),
    check({ accountant: 'Gayane', accountantResponse: 'appealed', appealDecision: 'rejected' }),
    check({ accountant: 'Aida', accountantResponse: 'pending' }),
    check({ accountant: '', accountantResponse: 'agreed' }),
  ];
  const out = summarizeByAccountant(checks);
  assert.equal(out.length, 3);
  const g = out.find((r) => r.accountant === 'Gayane')!;
  assert.deepEqual(
    { count: g.count, agreed: g.agreed, appealed: g.appealed, acc: g.appealAccepted, rej: g.appealRejected, pend: g.pending },
    { count: 3, agreed: 1, appealed: 2, acc: 1, rej: 1, pend: 0 },
  );
  assert.equal(out.find((r) => r.accountant === NO_ACCOUNTANT)!.count, 1);
  // Sorted by count desc: Gayane (3) first.
  assert.equal(out[0].accountant, 'Gayane');
});

test('summarizeByAccountant: empty input → empty breakdown', () => {
  assert.deepEqual(summarizeByAccountant([]), []);
});

const sample: SonaTicketsDaily = {
  date: '2026-07-07',
  total: 5,
  ticketsCreated: 3,
  byAccountant: [
    { accountant: 'Gayane', count: 3, total: 3, agreed: 0, appealed: 0, appealAccepted: 0, appealRejected: 0, pending: 3 },
    { accountant: 'Aida', count: 2, total: 2, agreed: 0, appealed: 0, appealAccepted: 0, appealRejected: 0, pending: 2 },
  ],
  responses: { total: 5, agreed: 0, appealed: 0, appealAccepted: 0, appealRejected: 0, pending: 5 },
  confirmation: null,
  checks: [],
};

test('formatSonaTicketsDailyText: full message keyed on checking_date', () => {
  const text = formatSonaTicketsDailyText(sample);
  assert.match(text, /Ежедневный отчёт по тикетам Sona/);
  assert.match(text, /Дата: 07\.07\.2026 \(по дате проверки\)/);
  assert.match(text, /Всего тикетов: <b>5<\/b>/);
  assert.match(text, /передано бухгалтерам как тикет: 3/);
  assert.match(text, /• Gayane: 3\n• Aida: 2/);
  assert.match(text, /Бот посчитал: 5 тикетов\./);
  assert.match(text, /Подтвердите число в дашборде/);
});

test('formatSonaTicketsDailyText: zero-ticket day still renders', () => {
  const text = formatSonaTicketsDailyText({ ...sample, total: 0, ticketsCreated: 0, byAccountant: [], responses: sample.responses });
  assert.match(text, /Всего тикетов: <b>0<\/b>/);
  assert.match(text, /— за день тикетов нет/);
});

test('formatSonaTicketsDailyText: shows Sona confirmation when reviewed', () => {
  const text = formatSonaTicketsDailyText({
    ...sample,
    confirmation: {
      checkDate: '2026-07-07', detectedTotal: 5, correctedTotal: 7,
      confirmationStatus: 'incorrect', confirmedBySona: true,
      sonaComment: 'две проверки не учтены', confirmedAt: '2026-07-07T18:00:00Z',
    },
  });
  assert.match(text, /Подтверждение Sona:<\/b> ❌ отмечено как неверное/);
  assert.match(text, /Исправлено Sona: <b>7<\/b> \(бот посчитал 5\)/);
  assert.match(text, /Комментарий Sona: две проверки не учтены/);
});
