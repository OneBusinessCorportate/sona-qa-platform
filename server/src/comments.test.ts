import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComments, combineComments } from './comments.js';

test('normalizeComments: trims and blanks → null', () => {
  assert.deepEqual(
    normalizeComments({ before: '  до  ', work: '', after: '   ' }),
    { before: 'до', work: null, after: null },
  );
});

test('normalizeComments: missing input → null', () => {
  assert.equal(normalizeComments(null), null);
  assert.equal(normalizeComments(undefined), null);
});

test('combineComments: labels only the filled stages', () => {
  assert.equal(
    combineComments({ before: 'a', work: null, after: 'c' }),
    'До: a\nПосле: c',
  );
  assert.equal(
    combineComments({ before: 'a', work: 'b', after: 'c' }),
    'До: a\nРабота: b\nПосле: c',
  );
});

test('combineComments: all empty / null → null', () => {
  assert.equal(combineComments({ before: null, work: null, after: null }), null);
  assert.equal(combineComments(null), null);
});

test('normalize → combine round-trip for a single stage', () => {
  assert.equal(combineComments(normalizeComments({ work: ' замечание ' })), 'Работа: замечание');
});
