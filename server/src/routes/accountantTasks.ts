import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

// Follow-up "accountant system tasks" tracker (sqa_accountant_tasks). Items are
// raised from Sona ticket checks / appeals or added manually, and worked to a
// terminal status. Deliberately minimal — just enough to track and complete.
export const accountantTasksRouter = Router();
accountantTasksRouter.use(requireAuth);

const STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const SOURCES = ['sona_ticket_check', 'appeal', 'manual'];

// List tasks with optional filters: ?date= (task_date), ?status=, ?accountant=.
accountantTasksRouter.get('/', async (req: AuthedRequest, res: Response) => {
  let q = supabase.from('sqa_accountant_tasks').select('*').order('created_at', { ascending: false }).limit(500);
  if (req.query.date) q = q.eq('task_date', String(req.query.date));
  if (req.query.status) q = q.eq('status', String(req.query.status));
  if (req.query.accountant) q = q.eq('accountant', String(req.query.accountant));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tasks: data ?? [] });
});

accountantTasksRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  const description = String(b.description ?? '').trim();
  if (!description) return res.status(400).json({ error: 'description_required' });
  const source = SOURCES.includes(b.source) ? b.source : 'manual';
  const row = {
    task_date: b.task_date || undefined, // defaults to current_date in DB
    accountant: b.accountant ?? null,
    review_id: b.review_id ?? null,
    ticket_id: b.ticket_id ?? null,
    description,
    status: STATUSES.includes(b.status) ? b.status : 'open',
    priority: b.priority ?? null,
    source,
  };
  const { data, error } = await supabase.from('sqa_accountant_tasks').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ task: data });
});

const PATCHABLE = ['status', 'priority', 'description', 'accountant', 'task_date'];
accountantTasksRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) if (k in (req.body ?? {})) patch[k] = req.body[k];
  if ('status' in patch && !STATUSES.includes(patch.status as string)) return res.status(400).json({ error: 'bad_status' });
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing_to_update' });
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('sqa_accountant_tasks').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ task: data });
});

accountantTasksRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const { error } = await supabase.from('sqa_accountant_tasks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
