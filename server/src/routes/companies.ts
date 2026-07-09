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

// Companies overview for Sona: every company with its check status
// (checked / not_checked / needs_recheck), latest check date + score, open
// tickets and the latest comment. Powers the "Компании" tab — the accountant
// filter, the checked/not-checked mechanism, counters and company search.
//
// Base list = all Active companies PLUS any company that already has a review
// (so a checked-but-inactive company like a former client still shows up).
// Everything is small (sqa_reviews ~ hundreds, sqa_tickets ~ tens), so we pull
// the tables once and aggregate in memory.
companiesRouter.get('/meta/overview', async (_req: AuthedRequest, res: Response) => {
  const [companiesRes, reviewsRes, ticketsRes] = await Promise.all([
    supabase
      .from('mqa_chats')
      .select('agr_no, name_agr, name_tax, hvhh, accountant, manager, status')
      .limit(5000),
    supabase
      .from('sqa_reviews')
      .select('company_agr_no, accountant, checking_date, efficiency_pct, record_type, report_type, period, comment, scores, created_at')
      .order('checking_date', { ascending: false })
      .limit(5000),
    supabase
      .from('sqa_tickets')
      .select('company_agr_no, status')
      .eq('status', 'open'),
  ]);
  if (companiesRes.error) return res.status(500).json({ error: companiesRes.error.message });
  if (reviewsRes.error) return res.status(500).json({ error: reviewsRes.error.message });
  if (ticketsRes.error) return res.status(500).json({ error: ticketsRes.error.message });

  // Group reviews by company (already sorted newest-first by checking_date; a
  // secondary created_at sort settles same-day ties).
  const reviewsByCo = new Map<string, any[]>();
  for (const rv of reviewsRes.data ?? []) {
    if (!rv.company_agr_no) continue;
    let list = reviewsByCo.get(rv.company_agr_no);
    if (!list) { list = []; reviewsByCo.set(rv.company_agr_no, list); }
    list.push(rv);
  }
  for (const list of reviewsByCo.values()) {
    list.sort((a, b) =>
      String(b.checking_date ?? '').localeCompare(String(a.checking_date ?? '')) ||
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  }

  const openTicketsByCo = new Map<string, number>();
  for (const tk of ticketsRes.data ?? []) {
    if (!tk.company_agr_no) continue;
    openTicketsByCo.set(tk.company_agr_no, (openTicketsByCo.get(tk.company_agr_no) ?? 0) + 1);
  }

  // Build the base company map.
  const coMap = new Map<string, any>();
  for (const c of companiesRes.data ?? []) {
    if (c.status === 'Active' || reviewsByCo.has(c.agr_no)) coMap.set(c.agr_no, c);
  }
  // Include any reviewed company that is (unexpectedly) not in mqa_chats.
  for (const [agr, list] of reviewsByCo) {
    if (!coMap.has(agr)) {
      coMap.set(agr, { agr_no: agr, name_agr: null, name_tax: null, hvhh: null, accountant: list[0]?.accountant ?? null, manager: null, status: 'Unknown' });
    }
  }

  const companies = Array.from(coMap.values()).map((c) => {
    const rvs = reviewsByCo.get(c.agr_no) ?? [];
    const latest = rvs[0] ?? null;
    const openTickets = openTicketsByCo.get(c.agr_no) ?? 0;
    let status: 'checked' | 'not_checked' | 'needs_recheck';
    if (rvs.length === 0) status = 'not_checked';
    else if (openTickets > 0 || latest?.record_type === 'problem') status = 'needs_recheck';
    else status = 'checked';
    return {
      agr_no: c.agr_no,
      name: c.name_agr ?? c.name_tax ?? c.agr_no,
      name_tax: c.name_tax ?? null,
      accountant: c.accountant ?? latest?.accountant ?? null,
      manager: c.manager ?? null,
      company_status: c.status,
      status,
      total_checks: rvs.length,
      last_check_date: latest?.checking_date ?? null,
      last_score: latest?.efficiency_pct ?? null,
      last_points: latest?.scores?.points ?? null,
      last_report_type: latest?.report_type ?? null,
      last_period: latest?.period ?? null,
      last_comment: latest?.comment ?? null,
      open_tickets: openTickets,
    };
  });

  // Sort so the work-needed rows float to the top, then alphabetically.
  const rank: Record<string, number> = { needs_recheck: 0, not_checked: 1, checked: 2 };
  companies.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.name).localeCompare(String(b.name), 'ru'));

  const accountants = Array.from(new Set(companies.map((c) => c.accountant).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b), 'ru'));

  res.json({ companies, accountants });
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
