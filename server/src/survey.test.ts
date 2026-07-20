import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPromptSurvey, SURVEY_CHECK_THRESHOLD, SURVEY_EVENING_HOUR } from './survey.js';

test('shouldPromptSurvey: nudges on the 3rd check of the day', () => {
  assert.equal(shouldPromptSurvey({ checksToday: 2, alreadySubmitted: false, hour: 11 }), false);
  assert.equal(shouldPromptSurvey({ checksToday: SURVEY_CHECK_THRESHOLD, alreadySubmitted: false, hour: 11 }), true);
  assert.equal(shouldPromptSurvey({ checksToday: 5, alreadySubmitted: false, hour: 11 }), true);
});

test('shouldPromptSurvey: evening fallback needs ≥1 check', () => {
  // Morning with a light day: no nudge yet.
  assert.equal(shouldPromptSurvey({ checksToday: 1, alreadySubmitted: false, hour: 11 }), false);
  // Evening, one check done → ask once.
  assert.equal(shouldPromptSurvey({ checksToday: 1, alreadySubmitted: false, hour: SURVEY_EVENING_HOUR }), true);
  // Evening but no checks at all → never nag.
  assert.equal(shouldPromptSurvey({ checksToday: 0, alreadySubmitted: false, hour: 20 }), false);
});

test('shouldPromptSurvey: never nudges twice once submitted', () => {
  assert.equal(shouldPromptSurvey({ checksToday: 9, alreadySubmitted: true, hour: 20 }), false);
  assert.equal(shouldPromptSurvey({ checksToday: 3, alreadySubmitted: true, hour: 11 }), false);
});
