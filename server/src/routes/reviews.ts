import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { computeScore, scoreBand } from '../efficiency.js';
import { normalizeComments, combineComments } from '../comments.js';

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

// Criteria for the scoring form (seeded later with Sona/Lilit).
reviewsRouter.get('/criteria', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('sqa_criteria')
    .select('*')
    .eq('active', true)
    .order('sort');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ criteria: data ?? [] });
});

// List reviews with optional filters.
reviewsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  let q = supabase.from('sqa_reviews').select('*').order('created_at', { ascending: false }).limit(500);
  if (req.query.date) q = q.eq('checking_date', String(req.query.date));
  if (req.query.accountant) q = q.eq('accountant', String(req.query.accountant));
  if (req.query.company) q = q.eq('company_agr_no', String(req.query.company));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reviews: data ?? [] });
});

// Create a daily review. Accountant/manager auto-filled from the company if absent.
// A ticket is auto-created by a DB trigger when record_type = 'problem'.
reviewsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  if (!b.company_agr_no) return res.status(400).json({ error: 'company_agr_no_required' });
  if (!b.period || !String(b.period).trim()) return res.status(400).json({ error: 'period_required' });

  let accountant = b.accountant ?? null;
  let manager = b.manager ?? null;
  if (!accountant || !manager) {
    const { data: company } = await supabase
      .from('mqa_chats')
      .select('accountant, manager')
      .eq('agr_no', b.company_agr_no)
      .maybeSingle();
    accountant = accountant ?? company?.accountant ?? null;
    manager = manager ?? company?.manager ?? null;
  }

  const errors = Array.isArray(b.errors) ? b.errors : [];
  const checklist = (b.scores && b.scores.checklist) || b.checklist || null;
  // Оценка % is recomputed server-side from Sona's 9-point checklist (falling
  // back to the legacy error-penalty for old data) so the stored value is
  // always trustworthy regardless of what the client sends.
  const efficiency_pct = computeScore(checklist, errors);
  const points = scoreBand(efficiency_pct);

  // Three review-stage comments (before handing feedback to the accountant /
  // during the accountant's work / after it is finished). Kept structured in
  // `scores.comments`; the top-level `comment` column gets a labelled join so
  // the reviews list and reports still show readable text.
  const comments = normalizeComments(b.comments ?? b.scores?.comments ?? null);
  const combinedComment = comments ? combineComments(comments) : (b.comment ?? null);
  const scores = { ...(b.scores ?? {}), points, ...(comments ? { comments } : {}) };

  const row = {
    company_agr_no: b.company_agr_no,
    accountant,
    manager,
    checking_date: b.checking_date ?? undefined,
    period: b.period ?? null,
    reviewer: b.reviewer ?? req.user?.email ?? 'Sona',
    report_type: b.report_type ?? null,
    risk_level: b.risk_level ?? null,
    score_accountant: b.score_accountant ?? null,
    score_client: b.score_client ?? null,
    efficiency_pct,
    financials: Array.isArray(b.financials) ? b.financials : [],
    scores,
    record_type: b.record_type ?? 'other',
    errors,
    praise: b.praise ?? null,
    comment: combinedComment,
    quality_band: b.quality_band ?? null,
    ticket_priority: b.ticket_priority ?? null,
    ticket_urgent: Boolean(b.ticket_urgent),
  };

  const { data: review, error } = await supabase.from('sqa_reviews').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Return the ticket the trigger may have created.
  const { data: ticket } = await supabase
    .from('sqa_tickets')
    .select('*')
    .eq('review_id', review.id)
    .maybeSingle();

  res.status(201).json({ review, ticket: ticket ?? null });
});

// Update fields of an existing review. If company_agr_no changes, accountant/manager auto-update.
reviewsRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  const allowed = ['company_agr_no', 'period', 'report_type', 'risk_level', 'record_type', 'comment', 'accountant', 'checking_date'];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in b) patch[key] = b[key] ?? null;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no_fields' });
  if (patch.company_agr_no) {
    const { data: co } = await supabase.from('mqa_chats').select('accountant, manager').eq('agr_no', patch.company_agr_no).maybeSingle();
    if (co) { patch.accountant = co.accountant ?? null; patch.manager = co.manager ?? null; }
  }
  const { data, error } = await supabase.from('sqa_reviews').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ review: data });
});

// Delete a review (so Sona can correct a mistaken entry). There is no FK
// cascade from sqa_tickets, so remove any auto-created ticket first.
reviewsRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  await supabase.from('sqa_tickets').delete().eq('review_id', req.params.id);
  const { error } = await supabase.from('sqa_reviews').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
