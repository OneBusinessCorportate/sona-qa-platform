// Thin fetch wrapper that attaches the JWT and parses JSON.
const TOKEN_KEY = 'sqa_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export interface Company {
  agr_no: string; name_agr: string | null; name_tax: string | null;
  hvhh: string | null; accountant: string | null; manager: string | null; status: string;
}
// ── Companies overview (checked / not-checked mechanism + accountant filter) ──
export type CompanyCheckStatus = 'checked' | 'not_checked' | 'needs_recheck';
export interface CompanyOverview {
  agr_no: string;
  name: string;
  name_tax: string | null;
  accountant: string | null;
  manager: string | null;
  company_status: string;
  status: CompanyCheckStatus;
  total_checks: number;
  last_check_date: string | null;
  last_score: number | null;
  last_points: number | null;
  last_report_type: string | null;
  last_period: string | null;
  last_comment: string | null;
  open_tickets: number;
}
export interface CompaniesOverview {
  companies: CompanyOverview[];
  accountants: string[];
}

export interface Ticket {
  id: string; company_agr_no: string; accountant: string | null; type: string;
  priority: string; urgent: boolean; status: string; title: string | null;
  description: string | null; start_date: string | null; due_date: string | null; created_at: string;
}

export interface TicketFeedback {
  kk_status: string | null;
  situation_comment: string | null;
  solution_comment: string | null;
  feedback_submitted_at: string | null;
  accountant_name: string | null;
  review_action: string | null;
  review_comment: string | null;
  reviewer_name: string | null;
  review_acted_at: string | null;
  attachments?: TicketAttachment[];
  appeals?: TicketAppeal[];
}

// An accountant's appeal («Подать апелляцию») against a Sona ticket, read from
// the kk-accountants app. status: 'pending' | 'approved' | 'rejected'.
export interface TicketAppeal {
  id: string;
  problem_id: string;
  status: string;
  comment: string | null;
  accountant_name: string | null;
  resolved_by: string | null;
  resolution_comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface TicketAttachment {
  id: string;
  file_name: string;
  public_url: string;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface SonaComment {
  id: string;
  problem_id: string;
  author: string;
  body: string;
  created_at: string;
}

// ── Sona daily ticket-checks (shared with the Telegram report) ───────────────
export type AccountantResponse = 'pending' | 'agreed' | 'appealed';
export type AppealDecision = 'accepted' | 'rejected' | null;
export type ConfirmationStatus = 'pending' | 'confirmed' | 'incorrect' | 'needs_review';

export interface ResponseSummary {
  total: number; agreed: number; appealed: number;
  appealAccepted: number; appealRejected: number; pending: number;
}
export interface AccountantBreakdown extends ResponseSummary { accountant: string; count: number }

export interface SonaTicketCheck {
  id: string;
  checkingDate: string;
  accountant: string;
  companyAgrNo: string;
  companyName: string | null;
  reportType: string | null;
  recordType: string | null;
  efficiencyPct: number | null;
  evidence: string | null;
  reviewer: string;
  hasTicket: boolean;
  ticketId: string | null;
  accountantResponse: AccountantResponse;
  appealDecision: AppealDecision;
}
export interface SonaTicketConfirmation {
  checkDate: string;
  detectedTotal: number;
  correctedTotal: number | null;
  confirmationStatus: ConfirmationStatus;
  confirmedBySona: boolean;
  sonaComment: string | null;
  confirmedAt: string | null;
}
export interface SonaTicketsDaily {
  date: string;
  total: number;
  ticketsCreated: number;
  byAccountant: AccountantBreakdown[];
  responses: ResponseSummary;
  confirmation: SonaTicketConfirmation | null;
  checks: SonaTicketCheck[];
}

export interface AccountantTask {
  id: string;
  task_date: string;
  accountant: string | null;
  review_id: string | null;
  ticket_id: string | null;
  description: string;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  priority: string | null;
  source: 'sona_ticket_check' | 'appeal' | 'manual';
  created_at: string;
  updated_at: string;
}
