import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistScore, scoreBand, computeScore,
  reviewToCriteria, averageCriteria, itogQ, scorecardLevel,
  type Checklist,
} from './efficiency.js';

const perfect: Checklist = {
  overdue: 'no', signed: 'yes', correct: 'yes', confirmed: 'yes', format: 'yes',
  errors: 'no', desk_audit: 'no', penalties: 'no', standards: 'yes',
};

test('checklistScore: 9/9 = 100%', () => {
  assert.equal(checklistScore(perfect), 100);
});

test('checklistScore: 8/9 = 88.89% (one bad)', () => {
  assert.equal(checklistScore({ ...perfect, errors: 'yes' }), 88.89);
});

test('checklistScore: empty checklist = 0', () => {
  assert.equal(checklistScore({}), 0);
  assert.equal(checklistScore(null), 0);
});

test('scoreBand: Sona\'s 0-20 banding', () => {
  assert.equal(scoreBand(100), 20);
  assert.equal(scoreBand(88.89), 15);
  assert.equal(scoreBand(66.67), 10);
  assert.equal(scoreBand(40), 5);
  assert.equal(scoreBand(0), 0);
});

test('computeScore: prefers checklist, falls back to error penalty', () => {
  assert.equal(computeScore(perfect), 100);
  // No checklist → legacy error-penalty path (serious = -12).
  assert.equal(computeScore(null, [{ severity: 'serious' }]), 88);
  assert.equal(computeScore({}, []), 100);
});

test('reviewToCriteria: perfect review → all 100', () => {
  assert.deepEqual(
    reviewToCriteria({ scores: { checklist: perfect }, record_type: 'other' }),
    { k1: 100, k2: 100, k3: 100, k4: 100, k5: 100 },
  );
});

test('reviewToCriteria: penalties → K1 critical (20)', () => {
  const c = reviewToCriteria({ scores: { checklist: { ...perfect, penalties: 'yes' } }, record_type: 'other' });
  assert.equal(c.k1, 20);
});

test('reviewToCriteria: errors but no penalty → K1 minor (60)', () => {
  const c = reviewToCriteria({ scores: { checklist: { ...perfect, errors: 'yes' } }, record_type: 'other' });
  assert.equal(c.k1, 60);
});

test('reviewToCriteria: overdue → K2 = 40; problem → K5 = 40', () => {
  const c = reviewToCriteria({ scores: { checklist: { ...perfect, overdue: 'yes' } }, record_type: 'problem' });
  assert.equal(c.k2, 40);
  assert.equal(c.k5, 40);
});

test('averageCriteria: averages and rounds', () => {
  const avg = averageCriteria([
    { k1: 100, k2: 100, k3: 100, k4: 100, k5: 100 },
    { k1: 20, k2: 40, k3: 60, k4: 73, k5: 40 },
  ]);
  assert.deepEqual(avg, { k1: 60, k2: 70, k3: 80, k4: 87, k5: 70 });
});

test('averageCriteria: empty list → zeros', () => {
  assert.deepEqual(averageCriteria([]), { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 });
});

// The weighted formula must reproduce Sona's own "Общая оценка" sheet exactly.
test('itogQ: matches Sona\'s real Итог Q values', () => {
  assert.equal(itogQ({ k1: 20, k2: 80, k3: 90, k4: 100, k5: 100 }), 84); // Թագուհի
  assert.equal(itogQ({ k1: 10, k2: 80, k3: 100, k4: 100, k5: 100 }), 85); // Լիլիթ
  assert.equal(itogQ({ k1: 100, k2: 80, k3: 100, k4: 100, k5: 100 }), 94); // Հասմիկ
  assert.equal(itogQ({ k1: 20, k2: 80, k3: 100, k4: 100, k5: 100 }), 86); // Նաիրա Զ
});

test('scorecardLevel: band boundaries from the guide', () => {
  assert.equal(scorecardLevel(90), 'Премирование, кадровый резерв');
  assert.equal(scorecardLevel(89), 'План развития по слабым зонам');
  assert.equal(scorecardLevel(70), 'План развития по слабым зонам');
  assert.equal(scorecardLevel(69), 'План корректирующих мероприятий');
  assert.equal(scorecardLevel(50), 'План корректирующих мероприятий');
  assert.equal(scorecardLevel(49), 'Административные меры / доп. обучение');
});
