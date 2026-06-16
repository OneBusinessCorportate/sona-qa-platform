import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

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

  const row = {
    company_agr_no: b.company_agr_no,
    accountant,
    manager,
    checking_date: b.checking_date ?? undefined,
    reviewer: b.reviewer ?? req.user?.email ?? 'Sona',
    score_accountant: b.score_accountant ?? null,
    score_client: b.score_client ?? null,
    scores: b.scores ?? {},
    record_type: b.record_type ?? 'other',
    errors: b.errors ?? [],
    praise: b.praise ?? null,
    comment: b.comment ?? null,
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
