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
}

export interface SonaComment {
  id: string;
  problem_id: string;
  author: string;
  body: string;
  created_at: string;
}
