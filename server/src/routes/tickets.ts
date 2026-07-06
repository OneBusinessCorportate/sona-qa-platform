import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

ticketsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  let q = supabase.from('sqa_tickets').select('*').order('created_at', { ascending: false }).limit(500);
  if (req.query.status) q = q.eq('status', String(req.query.status));
  if (req.query.urgent === '1') q = q.eq('urgent', true);
  if (req.query.company) q = q.eq('company_agr_no', String(req.query.company));
  if (req.query.accountant) q = q.eq('accountant', String(req.query.accountant));
  if (req.query.from) q = q.gte('created_at', String(req.query.from));
  if (req.query.to)   q = q.lte('created_at', String(req.query.to) + 'T23:59:59');
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tickets: data ?? [] });
});

const PATCHABLE = ['status', 'priority', 'urgent', 'title', 'description', 'start_date', 'due_date', 'resolved_at'];

ticketsRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const patch: Record<string, unknown> = {};
  for (const key of PATCHABLE) if (key in (req.body ?? {})) patch[key] = req.body[key];
  if (patch.status === 'done' && !patch.resolved_at) patch.resolved_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing_to_update' });

  const { data, error } = await supabase
    .from('sqa_tickets')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ticket: data });
});

ticketsRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const { error } = await supabase.from('sqa_tickets').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Cross-platform feedback (kk-accountants ↔ sona) ──────────────────────────
//
// The link between the two systems:
//   kk_problems.problem_id = 'sona:' || sqa_tickets.id

ticketsRouter.get('/:id/feedback', async (req: AuthedRequest, res: Response) => {
  const problemId = `sona:${req.params.id}`;

  const { data: problem } = await supabase
    .from('kk_problems')
    .select('status, problem_id')
    .eq('problem_id', problemId)
    .maybeSingle();

  if (!problem) return res.json({ feedback: null });

  const [{ data: feedbacks }, { data: actions }] = await Promise.all([
    supabase
      .from('kk_accountant_feedback')
      .select('situation_comment, solution_comment, submitted_at, accountant_name')
      .eq('problem_id', problemId)
      .order('submitted_at', { ascending: false })
      .limit(1),
    supabase
      .from('kk_review_actions')
      .select('action, review_comment, reviewer_name, created_at')
      .eq('problem_id', problemId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const latest = feedbacks?.[0] ?? null;
  const latestAction = actions?.[0] ?? null;

  res.json({
    feedback: {
      kk_status: problem.status,
      situation_comment: latest?.situation_comment ?? null,
      solution_comment: latest?.solution_comment ?? null,
      feedback_submitted_at: latest?.submitted_at ?? null,
      accountant_name: latest?.accountant_name ?? null,
      review_action: latestAction?.action ?? null,
      review_comment: latestAction?.review_comment ?? null,
      reviewer_name: latestAction?.reviewer_name ?? null,
      review_acted_at: latestAction?.created_at ?? null,
    },
  });
});

ticketsRouter.get('/:id/comments', async (req: AuthedRequest, res: Response) => {
  const problemId = `sona:${req.params.id}`;
  const { data, error } = await supabase
    .from('kk_sona_comments')
    .select('*')
    .eq('problem_id', problemId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ comments: data ?? [] });
});

ticketsRouter.post('/:id/comments', async (req: AuthedRequest, res: Response) => {
  const problemId = `sona:${req.params.id}`;
  const body = String(req.body?.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'body_required' });

  const author = req.user?.email ?? 'Sona';

  const { data, error } = await supabase
    .from('kk_sona_comments')
    .insert({ problem_id: problemId, author, body })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ comment: data });
});
