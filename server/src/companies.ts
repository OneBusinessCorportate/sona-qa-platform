import { supabase } from './supabase.js';
import { env } from './env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Company reference source.
//
// The company dropdown (and the accountant auto-fill) is driven by the master
// "Agreements" spreadsheet Наири maintains in Google Sheets. This module pulls
// that sheet **live** (its CSV export is link-readable, so no OAuth is needed),
// maps the rows to the shape the app already uses, and caches the result in
// memory for a short TTL so we don't hit Google on every request.
//
// If the sheet is unconfigured / unreachable we fall back to the shared Supabase
// reference table `mqa_chats` (the previous source), so the app never goes dark.
//
// NOTE: the sheet also holds tax-cabinet and bank credentials. We deliberately
// map only the non-sensitive columns the app needs and never read/expose the
// login/password columns.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyRecord {
  agr_no: string;
  name_agr: string | null;
  name_tax: string | null;
  hvhh: string | null;
  accountant: string | null;
  manager: string | null;
  status: string;
  tax_activation_date: string | null;
  debts: string | null;
}

// ── CSV parsing (RFC 4180: quoted fields may contain commas, quotes and \n) ──
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote ""
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore, handled by \n */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Locate the columns we care about by header text (order-independent, so the
// sheet can gain/lose columns without breaking the mapping).
export function resolveColumns(headers: string[]) {
  const h = headers.map((x) => (x ?? '').trim());
  const idx = (pred: (s: string) => boolean) => h.findIndex(pred);
  return {
    agrNo: idx((s) => s.includes('№ договора')),
    nameAgr: idx((s) => s.includes('Имя клиента из договора')),
    nameTax: idx((s) => s === 'Наименование клиента'),
    hvhh: idx((s) => s.includes('ՀՎՀՀ')),
    status: idx((s) => s.includes('կարգավիճակ')), // «Պայմանագրի կարգավիճակ» (agreement status)
    accountant: idx((s) => s === 'Бухгалтер'), // exact, so «Бухгалтер ex» is not matched
    taxActivation: idx((s) => s.includes('Дата активации налогового кабинета')),
  };
}

export function rowsToCompanies(rows: string[][]): CompanyRecord[] {
  if (rows.length < 2) return [];
  const cols = resolveColumns(rows[0]);
  if (cols.agrNo < 0) throw new Error('sheet header: «№ договора» column not found');
  const out: CompanyRecord[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i: number) => (i >= 0 && i < row.length ? (row[i] ?? '').trim() : '');
    const nz = (v: string) => (v ? v : null);
    const agr_no = cell(cols.agrNo);
    if (!agr_no || seen.has(agr_no)) continue; // skip blanks / keep first occurrence
    seen.add(agr_no);
    out.push({
      agr_no,
      name_agr: nz(cell(cols.nameAgr)),
      name_tax: nz(cell(cols.nameTax)),
      hvhh: nz(cell(cols.hvhh)),
      accountant: nz(cell(cols.accountant)),
      manager: null, // the sheet has no manager column — enriched from Supabase below
      status: cell(cols.status), // trims trailing spaces («Active » → «Active»)
      tax_activation_date: nz(cell(cols.taxActivation)),
      debts: null,
    });
  }
  return out;
}

// ── In-memory cache ──────────────────────────────────────────────────────────
interface CacheState {
  companies: CompanyRecord[];
  fetchedAt: number;
  source: 'sheet' | 'supabase';
  error?: string;
}
let cache: CacheState | null = null;
let inflight: Promise<CompanyRecord[]> | null = null;

const sheetCsvUrl = () =>
  `https://docs.google.com/spreadsheets/d/${env.googleSheetId}/export?format=csv&gid=${env.googleSheetGid}`;

async function loadFromSheet(): Promise<CompanyRecord[]> {
  const res = await fetch(sheetCsvUrl(), { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google Sheets returned HTTP ${res.status}`);
  const text = await res.text();
  // A private sheet answers with an HTML sign-in page instead of CSV.
  if (/^\s*</.test(text) || text.toLowerCase().includes('<html')) {
    throw new Error('sheet is not publicly accessible (received HTML, not CSV)');
  }
  const companies = rowsToCompanies(parseCsv(text));
  if (!companies.length) throw new Error('sheet returned no company rows');
  return companies;
}

// The sheet has no manager column; keep the manager working by filling it from
// the shared Supabase reference (best-effort — never fails the sheet load).
async function enrichManagers(companies: CompanyRecord[]): Promise<void> {
  try {
    const { data, error } = await supabase.from('mqa_chats').select('agr_no, manager').limit(5000);
    if (error || !data) return;
    const byAgr = new Map<string, string | null>();
    for (const c of data) byAgr.set(c.agr_no, c.manager ?? null);
    for (const c of companies) if (byAgr.has(c.agr_no)) c.manager = byAgr.get(c.agr_no) ?? null;
  } catch {
    /* best-effort enrichment */
  }
}

async function loadFromSupabase(): Promise<CompanyRecord[]> {
  const { data, error } = await supabase
    .from('mqa_chats')
    .select('agr_no, name_agr, name_tax, hvhh, accountant, manager, status, debts, tax_activation_date')
    .limit(5000);
  const companies: CompanyRecord[] = (data ?? []).map((c: any) => ({
    agr_no: c.agr_no,
    name_agr: c.name_agr ?? null,
    name_tax: c.name_tax ?? null,
    hvhh: c.hvhh ?? null,
    accountant: c.accountant ?? null,
    manager: c.manager ?? null,
    status: c.status ?? '',
    tax_activation_date: c.tax_activation_date ?? null,
    debts: c.debts ?? null,
  }));
  cache = { companies, fetchedAt: Date.now(), source: 'supabase', error: error?.message };
  return companies;
}

async function loadCompanies(): Promise<CompanyRecord[]> {
  if (env.companiesSource === 'supabase' || !env.googleSheetId) return loadFromSupabase();
  try {
    const companies = await loadFromSheet();
    await enrichManagers(companies);
    cache = { companies, fetchedAt: Date.now(), source: 'sheet' };
    return companies;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cache?.companies.length) {
      // Serve the last good snapshot rather than an empty list; retry after TTL.
      console.warn(`[companies] sheet refresh failed, serving cached snapshot: ${msg}`);
      cache = { ...cache, fetchedAt: Date.now(), error: msg };
      return cache.companies;
    }
    console.warn(`[companies] sheet fetch failed, falling back to Supabase mqa_chats: ${msg}`);
    return loadFromSupabase();
  }
}

/** Full company reference list (cached). `force` bypasses the TTL. */
export async function getCompanies(opts?: { force?: boolean }): Promise<CompanyRecord[]> {
  const fresh = cache && Date.now() - cache.fetchedAt < env.companiesCacheTtlMs;
  if (!opts?.force && fresh) return cache!.companies;
  if (!inflight) inflight = loadCompanies().finally(() => { inflight = null; });
  return inflight;
}

/** One company by agreement number, or null. */
export async function getCompany(agrNo: string): Promise<CompanyRecord | null> {
  const list = await getCompanies();
  return list.find((c) => c.agr_no === agrNo) ?? null;
}

/** agr_no → display name map, optionally restricted to the given agr_nos. */
export async function getCompanyNameMap(agrNos?: string[]): Promise<Map<string, string>> {
  const list = await getCompanies();
  const want = agrNos ? new Set(agrNos) : null;
  const m = new Map<string, string>();
  for (const c of list) {
    if (want && !want.has(c.agr_no)) continue;
    m.set(c.agr_no, c.name_agr ?? c.name_tax ?? c.agr_no);
  }
  return m;
}

/** Force a re-pull now (used by the manual-refresh endpoint). */
export function refreshCompanies(): Promise<CompanyRecord[]> {
  return getCompanies({ force: true });
}

/** Diagnostics for the current cache/source (safe to expose — no credentials). */
export function companiesSourceStatus() {
  return {
    source: cache?.source ?? null,
    configured_source: env.companiesSource,
    sheet_id: env.googleSheetId || null,
    sheet_gid: env.googleSheetGid || null,
    count: cache?.companies.length ?? 0,
    fetched_at: cache ? new Date(cache.fetchedAt).toISOString() : null,
    ttl_ms: env.companiesCacheTtlMs,
    error: cache?.error ?? null,
  };
}
