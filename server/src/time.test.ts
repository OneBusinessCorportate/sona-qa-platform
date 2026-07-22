import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayInTz, yesterdayInTz } from './time.js';

// Default env.tz is Asia/Yerevan (UTC+4, no DST).

test('todayInTz: converts a UTC instant to the local calendar day', () => {
  // 2026-07-20 22:00 UTC = 2026-07-21 02:00 Yerevan → local day rolls to 21st.
  assert.equal(todayInTz(new Date('2026-07-20T22:00:00Z')), '2026-07-21');
  // 2026-07-20 12:00 UTC = 2026-07-20 16:00 Yerevan → still the 20th.
  assert.equal(todayInTz(new Date('2026-07-20T12:00:00Z')), '2026-07-20');
});

test('yesterdayInTz: is the local day before today', () => {
  // The 19:00 Yerevan send on 2026-07-21 (= 15:00 UTC) reports 2026-07-20 —
  // exactly the checking_date of the 5 late-night checks that used to be lost.
  assert.equal(yesterdayInTz(new Date('2026-07-21T15:00:00Z')), '2026-07-20');
});

test('yesterdayInTz: uses the LOCAL day, not the UTC day', () => {
  // 2026-07-20 22:00 UTC is already 2026-07-21 locally, so "yesterday" is the
  // 20th (not the 19th). This is the case that made the original bug possible.
  assert.equal(yesterdayInTz(new Date('2026-07-20T22:00:00Z')), '2026-07-20');
});

test('yesterdayInTz: crosses month and year boundaries correctly', () => {
  assert.equal(yesterdayInTz(new Date('2026-08-01T15:00:00Z')), '2026-07-31');
  assert.equal(yesterdayInTz(new Date('2026-03-01T15:00:00Z')), '2026-02-28');
  assert.equal(yesterdayInTz(new Date('2026-01-01T15:00:00Z')), '2025-12-31');
});
