import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecision,
  pendingAppeal,
  isOpenFeedItem,
  buildAppealResolution,
  ANON_REVIEWER,
  type AppealRow,
} from './appeals.js';

const row = (over: Partial<AppealRow>): AppealRow => ({
  id: 'a1',
  problem_id: 'sona:t1',
  status: 'pending',
  comment: null,
  accountant_name: null,
  resolved_by: null,
  resolution_comment: null,
  created_at: '2026-07-20T10:00:00.000Z',
  resolved_at: null,
  ...over,
});

test('parseDecision: only approved/rejected are valid', () => {
  assert.equal(parseDecision('approved'), 'approved');
  assert.equal(parseDecision('rejected'), 'rejected');
  assert.equal(parseDecision('pending'), null);
  assert.equal(parseDecision(''), null);
  assert.equal(parseDecision(undefined), null);
});

test('pendingAppeal: picks the pending row, else null', () => {
  assert.equal(pendingAppeal([]), null);
  assert.equal(pendingAppeal(null), null);
  assert.equal(pendingAppeal([row({ status: 'approved' })]), null);
  const p = row({ id: 'p', status: 'pending' });
  assert.equal(pendingAppeal([row({ id: 'x', status: 'rejected' }), p]), p);
});

test('isOpenFeedItem: closed statuses drop out unless a pending appeal forces it open', () => {
  assert.equal(isOpenFeedItem('waiting_for_accountant', false), true);
  assert.equal(isOpenFeedItem('appeal_pending', false), true);
  assert.equal(isOpenFeedItem('explained_accepted', false), false);
  assert.equal(isOpenFeedItem('fixed', false), false);
  // A pending appeal keeps even a settled-looking item visible for a decision.
  assert.equal(isOpenFeedItem('explained_accepted', true), true);
});

test('buildAppealResolution: approve upholds accountant and cancels the fine', () => {
  const now = '2026-07-20T12:00:00.000Z';
  const { appealPatch, problemPatch } = buildAppealResolution('approved', '  ок  ', now);
  assert.deepEqual(appealPatch, {
    status: 'approved',
    resolved_by: ANON_REVIEWER,
    resolution_comment: 'ок',
    resolved_at: now,
  });
  assert.deepEqual(problemPatch, {
    status: 'appeal_approved',
    verdict: 'not_problematic',
    verdict_at: now,
    penalty_cancelled: true,
    penalty_cancelled_at: now,
  });
});

test('buildAppealResolution: reject keeps the issue active, blank comment → null', () => {
  const now = '2026-07-20T12:00:00.000Z';
  const { appealPatch, problemPatch } = buildAppealResolution('rejected', '   ', now);
  assert.equal(appealPatch.status, 'rejected');
  assert.equal(appealPatch.resolution_comment, null);
  assert.deepEqual(problemPatch, { status: 'appeal_rejected' });
});
