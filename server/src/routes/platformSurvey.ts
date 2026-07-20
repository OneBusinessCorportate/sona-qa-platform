import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { todayInTz } from '../time.js';
import { hourInTz, shouldPromptSurvey, SURVEY_CHECK_THRESHOLD, SURVEY_EVENING_HOUR } from '../survey.js';

// «Что улучшить в платформе» survey. The client polls /prompt to decide whether
// to show the nudge; POST / stores an answer; GET / lists answers for review.
export const platformSurveyRouter = Router();
platformSurveyRouter.use(requireAuth);

// Should Sona be nudged right now? Counts today's checks (sqa_reviews on the
// local checking_date) and whether she already answered today.
platformSurveyRouter.get('/prompt', async (_req: AuthedRequest, res: Response) => {
  const today = todayInTz();
  const [{ count: checksToday, error: e1 }, { count: submitted, error: e2 }] = await Promise.all([
    supabase.from('sqa_reviews').select('id', { count: 'exact', head: true }).eq('checking_date', today),
    supabase.from('sqa_platform_feedback').select('id', { count: 'exact', head: true }).eq('feedback_date', today),
  ]);
  if (e1 || e2) return res.status(500).json({ error: (e1 ?? e2)!.message });
  const hour = hourInTz();
  const alreadySubmitted = (submitted ?? 0) > 0;
  const checks = checksToday ?? 0;
  res.json({
    date: today,
    checksToday: checks,
    alreadySubmitted,
    hour,
    threshold: SURVEY_CHECK_THRESHOLD,
    eveningHour: SURVEY_EVENING_HOUR,
    shouldPrompt: shouldPromptSurvey({ checksToday: checks, alreadySubmitted, hour }),
  });
});

// Recent answers, newest first (for a management / follow-up view).
platformSurveyRouter.get('/', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('sqa_platform_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ feedback: data ?? [] });
});

// Store one survey answer.
platformSurveyRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  const ease = b.ease_rating == null || b.ease_rating === '' ? null : Number(b.ease_rating);
  if (ease != null && (!Number.isInteger(ease) || ease < 1 || ease > 5)) {
    return res.status(400).json({ error: 'bad_ease_rating' });
  }
  const slowed = typeof b.slowed_down === 'string' ? b.slowed_down.trim() : '';
  const improvements = typeof b.improvements === 'string' ? b.improvements.trim() : '';
  // Require at least one substantive answer so an empty submit is a no-op.
  if (ease == null && !slowed && !improvements) {
    return res.status(400).json({ error: 'empty_response' });
  }
  const row = {
    feedback_date: b.feedback_date || undefined, // defaults to current_date in DB
    reviewer: b.reviewer ?? req.user?.email ?? 'Sona',
    ease_rating: ease,
    slowed_down: slowed || null,
    improvements: improvements || null,
    responses: b.responses && typeof b.responses === 'object' ? b.responses : {},
  };
  const { data, error } = await supabase.from('sqa_platform_feedback').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ feedback: data });
});
