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

// Aggregated feed of everything accountants sent back on Sona's tickets —
// feedback forms, thread comments, attachments — grouped per ticket and
// sorted by latest activity, so nothing requires expanding tickets one by one.
ticketsRouter.get('/feed', async (_req: AuthedRequest, res: Response) => {
  const [{ data: fb }, { data: cm }, { data: at }] = await Promise.all([
    supabase
      .from('kk_accountant_feedback')
      .select('problem_id, situation_comment, solution_comment, submitted_at, accountant_name')
      .like('problem_id', 'sona:%')
      .order('submitted_at', { ascending: false })
      .limit(300),
    supabase
      .from('kk_sona_comments')
      .select('problem_id, author, body, created_at')
      .like('problem_id', 'sona:%')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('kk_problem_attachments')
      .select('problem_id, file_name, public_url, mime_type, uploaded_by, created_at')
      .like('problem_id', 'sona:%')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const ids = [...new Set([...(fb ?? []), ...(cm ?? []), ...(at ?? [])].map((r) => r.problem_id))];
  if (!ids.length) return res.json({ items: [] });

  const { data: problems } = await supabase
    .from('kk_problems')
    .select('problem_id, problem_title, client_name, accountant_name, status')
    .in('problem_id', ids);
  const pMap = new Map((problems ?? []).map((p) => [p.problem_id, p]));

  // A closed case («Закрыть» / resolved on the kk side) disappears from the
  // feed entirely — only live conversations stay visible.
  const CLOSED = new Set(['explained_accepted', 'fixed', 'auto_resolved']);
  const openIds = ids.filter((id) => !CLOSED.has(pMap.get(id)?.status ?? ''));

  const items = openIds.map((problemId) => {
    const p = pMap.get(problemId);
    const feedbacks = (fb ?? []).filter((r) => r.problem_id === problemId);
    const comments = (cm ?? []).filter((r) => r.problem_id === problemId).reverse(); // oldest first in thread
    const attachments = (at ?? []).filter((r) => r.problem_id === problemId).reverse();
    const lastActivity = [
      ...feedbacks.map((r) => r.submitted_at),
      ...comments.map((r) => r.created_at),
      ...attachments.map((r) => r.created_at),
    ].sort().pop() ?? null;
    return {
      ticket_id: problemId.slice('sona:'.length),
      problem_id: problemId,
      title: p?.problem_title ?? null,
      client_name: p?.client_name ?? null,
      accountant_name: p?.accountant_name ?? null,
      kk_status: p?.status ?? null,
      feedbacks,
      comments,
      attachments,
      last_activity: lastActivity,
    };
  });
  items.sort((a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? ''));
  res.json({ items });
});

ticketsRouter.get('/:id/feedback', async (req: AuthedRequest, res: Response) => {
  const problemId = `sona:${req.params.id}`;

  const { data: problem } = await supabase
    .from('kk_problems')
    .select('status, problem_id')
    .eq('problem_id', problemId)
    .maybeSingle();

  if (!problem) return res.json({ feedback: null });

  const [{ data: feedbacks }, { data: actions }, { data: attachments }] = await Promise.all([
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
    // Files (documents/screenshots) the accountant optionally attached.
    supabase
      .from('kk_problem_attachments')
      .select('id, file_name, public_url, mime_type, uploaded_by, created_at')
      .eq('problem_id', problemId)
      .order('created_at', { ascending: true }),
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
      attachments: attachments ?? [],
    },
  });
});

// Sona's decision after reading the accountant's answer. Two outcomes:
//   close  → the case is settled: kk problem becomes «Объяснено / принято»
//            (leaves the accountant's queue) and the ticket is marked done.
//   return → not good enough: kk problem returns to the accountant's queue
//            («Возвращена бухгалтеру») so they must answer again; a comment
//            explaining why is required and lands in the shared thread.
ticketsRouter.post('/:id/resolve', async (req: AuthedRequest, res: Response) => {
  const problemId = `sona:${req.params.id}`;
  const action = req.body?.action === 'return' ? 'return' : req.body?.action === 'close' ? 'close' : null;
  const comment = String(req.body?.comment ?? '').trim();
  if (!action) return res.status(400).json({ error: 'action_must_be_close_or_return' });
  if (action === 'return' && !comment) return res.status(400).json({ error: 'comment_required_for_return' });

  const kkStatus = action === 'close' ? 'explained_accepted' : 'returned_to_accountant';

  const { data: problem, error: pErr } = await supabase
    .from('kk_problems')
    .update({ status: kkStatus })
    .eq('problem_id', problemId)
    .select('problem_id, status')
    .maybeSingle();
  if (pErr) return res.status(500).json({ error: pErr.message });
  if (!problem) return res.status(404).json({ error: 'problem_not_found' });

  // Record the decision in the kk history; stay anonymous.
  await supabase.from('kk_review_actions').insert({
    problem_id: problemId,
    reviewer_name: 'Проверяющий',
    action: kkStatus,
    review_comment: comment || null,
  });

  // The comment is what the accountant actually reads — put it in the thread.
  if (comment) {
    await supabase.from('kk_sona_comments').insert({ problem_id: problemId, author: 'Проверяющий', body: comment });
  }

  // Mirror onto the ticket itself: closing settles it, returning keeps it live.
  const ticketPatch = action === 'close'
    ? { status: 'done', resolved_at: new Date().toISOString() }
    : { status: 'in_progress', resolved_at: null };
  await supabase.from('sqa_tickets').update(ticketPatch).eq('id', req.params.id);

  res.json({ ok: true, kk_status: kkStatus });
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

  // Deliberately anonymous: accountants reading the thread in the kk app must
  // not learn who performs the checks (no name, no email).
  const author = 'Проверяющий';

  const { data, error } = await supabase
    .from('kk_sona_comments')
    .insert({ problem_id: problemId, author, body })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ comment: data });
});
