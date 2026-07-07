import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByAccountant, formatSonaTicketsDailyText, NO_ACCOUNTANT, type SonaTicketsDaily } from './ticketsDaily.js';
import { dayRangeUtc } from './time.js';

test('dayRangeUtc: a Yerevan day maps to the right UTC window (UTC+4, no DST)', () => {
  assert.deepEqual(dayRangeUtc('2026-07-07', 'Asia/Yerevan'), {
    fromIso: '2026-07-06T20:00:00.000Z',
    toIso: '2026-07-07T20:00:00.000Z',
  });
});

test('dayRangeUtc: UTC day is the identity window', () => {
  assert.deepEqual(dayRangeUtc('2026-07-07', 'UTC'), {
    fromIso: '2026-07-07T00:00:00.000Z',
    toIso: '2026-07-08T00:00:00.000Z',
  });
});

test('dayRangeUtc: 19:00 cutoff → the day runs 19:00 yesterday .. 19:00 today', () => {
  // Yerevan 19:00 = 15:00 UTC; after-19:00 submissions land in the next day.
  assert.deepEqual(dayRangeUtc('2026-07-07', 'Asia/Yerevan', 19), {
    fromIso: '2026-07-06T15:00:00.000Z',
    toIso: '2026-07-07T15:00:00.000Z',
  });
});

test('countByAccountant: groups, trims, lumps blank names', () => {
  const rows = [
    { accountant: 'Aida' }, { accountant: 'Aida ' }, { accountant: 'Gayane' },
    { accountant: '' }, { accountant: null }, { accountant: 'Gayane' }, { accountant: 'Gayane' },
  ];
  assert.deepEqual(countByAccountant(rows), [
    { accountant: 'Gayane', count: 3 },
    { accountant: 'Aida', count: 2 },
    { accountant: NO_ACCOUNTANT, count: 2 },
  ]);
});

test('countByAccountant: empty input → empty breakdown', () => {
  assert.deepEqual(countByAccountant([]), []);
});

const sample: SonaTicketsDaily = {
  date: '2026-07-07',
  cutoffHour: 19,
  fromIso: '2026-07-06T15:00:00.000Z',
  toIso: '2026-07-07T15:00:00.000Z',
  total: 5,
  ticketsCreated: 3,
  byAccountant: [
    { accountant: 'Gayane', count: 3 },
    { accountant: 'Aida', count: 2 },
  ],
};

test('formatSonaTicketsDailyText: full message with breakdown and accuracy block', () => {
  const text = formatSonaTicketsDailyText(sample);
  assert.match(text, /Ежедневный отчёт по тикетам Sona/);
  assert.match(text, /Дата: 07\.07\.2026/);
  assert.match(text, /Период: 06\.07\.2026 19:00 — 07\.07\.2026 19:00/);
  assert.match(text, /Всего тикетов: <b>5<\/b>/);
  assert.match(text, /передано бухгалтерам как тикет: 3/);
  assert.match(text, /• Gayane: 3\n• Aida: 2/);
  assert.match(text, /Бот посчитал: 5 тикетов\./);
  assert.match(text, /Фактически по проверке Sona: ___ тикетов\./);
  assert.match(text, /Разница: ___\./);
  assert.match(text, /бот сказал 5, в реальности сколько было\?/);
});

test('formatSonaTicketsDailyText: zero-ticket day still renders a valid message', () => {
  const text = formatSonaTicketsDailyText({ ...sample, total: 0, ticketsCreated: 0, byAccountant: [] });
  assert.match(text, /Всего тикетов: <b>0<\/b>/);
  assert.match(text, /— за день тикетов нет/);
});
