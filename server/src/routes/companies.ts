import { Router, type Response } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

// Company dropdown source — reuses Margarita's shared reference table mqa_chats.
companiesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const activeOnly = req.query.active !== '0';
  let q = supabase
    .from('mqa_chats')
    .select('agr_no, name_agr, name_tax, hvhh, accountant, manager, status')
    .order('name_agr', { ascending: true })
    .limit(5000); // explicit cap so the full list is returned (Supabase default is 1000)
  if (activeOnly) q = q.eq('status', 'Active');
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ companies: data ?? [] });
});

// Single company → used to auto-fill accountant / manager when one is picked.
companiesRouter.get('/:agrNo', async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('mqa_chats')
    .select('agr_no, name_agr, name_tax, hvhh, accountant, manager, status, debts, tax_activation_date')
    .eq('agr_no', req.params.agrNo)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ company: data });
});

// Accountants reference (active by default).
companiesRouter.get('/meta/accountants', async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('mqa_accountants')
    .select('name, role, active')
    .eq('active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ accountants: data ?? [] });
});
