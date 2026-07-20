import { env } from './env.js';

// «Что улучшить в платформе» — a short survey Sona is nudged to fill once a day.
// She is asked AFTER she has done enough checks to have an opinion (the 3rd
// check of the day) OR in the evening, so that a lighter day (but where she
// still used the platform) also gets asked once. Pure + tested; the route and
// the client modal call `shouldPromptSurvey`.
export const SURVEY_CHECK_THRESHOLD = 3;
export const SURVEY_EVENING_HOUR = 18; // 18:00 local (Asia/Yerevan) and later.

// Hour (0..23) in the configured timezone.
export function hourInTz(d = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: env.tz, hour: '2-digit', hour12: false }).format(d),
  );
}

export interface SurveyPromptInput {
  checksToday: number;
  alreadySubmitted: boolean;
  hour: number; // local hour (0..23)
}

// Decide whether to show the survey nudge right now.
// - Never nudge twice in a day (once submitted, we stop).
// - Nudge as soon as the 3rd check of the day is logged.
// - Evening fallback: from SURVEY_EVENING_HOUR onwards, a day with at least one
//   check still gets asked once (so we never nag on a day she didn't work).
export function shouldPromptSurvey({ checksToday, alreadySubmitted, hour }: SurveyPromptInput): boolean {
  if (alreadySubmitted) return false;
  if (checksToday >= SURVEY_CHECK_THRESHOLD) return true;
  if (hour >= SURVEY_EVENING_HOUR && checksToday >= 1) return true;
  return false;
}
