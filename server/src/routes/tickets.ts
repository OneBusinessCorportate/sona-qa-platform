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
