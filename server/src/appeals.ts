// Accountant appeals on Sona's tickets — the cross-app bridge.
//
// When an accountant disputes a Sona review in the kk-accountants app they file
// an appeal («Подать апелляцию») that lands in kk_problem_appeals, keyed
//   kk_problem_appeals.problem_id = 'sona:' || sqa_tickets.id
// exactly like every other kk row this platform already reads. This module keeps
// the pure, DB-free logic (which appeal is actionable, how a decision maps onto
// the kk rows) so the tickets route and its tests share one source of truth.
//
// Resolving an appeal here mirrors the kk app's own resolveAppeal():
//   approved → uphold the accountant: appeal 'approved', problem
//              'appeal_approved' + verdict 'not_problematic' (drops it from the
//              dashboard) and any fine is cancelled.
//   rejected → keep the issue active: appeal 'rejected', problem
//              'appeal_rejected' (returns to the accountant's queue).

export type AppealDecision = 'approved' | 'rejected';

// One row of kk_problem_appeals as read through the service-role client.
export interface AppealRow {
  id: string;
  problem_id: string;
  status: string; // 'pending' | 'approved' | 'rejected'
  comment: string | null;
  accountant_name: string | null;
  resolved_by: string | null;
  resolution_comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

// The checker stays anonymous on the accountant's side (same rule the shared
// comment thread already follows — no name, no email).
export const ANON_REVIEWER = 'Проверяющий';

// kk_problems statuses that mean the case is settled; such items drop out of the
// default «Ответы бухгалтеров» feed (unless still forced open below).
export const CLOSED_KK_STATUSES = new Set(['explained_accepted', 'fixed', 'auto_resolved']);

// Only 'approved' / 'rejected' are valid decisions from Sona's platform.
export function parseDecision(v: unknown): AppealDecision | null {
  return v === 'approved' || v === 'rejected' ? v : null;
}

// The single pending appeal awaiting a decision (a DB partial-unique index
// guarantees at most one), or null.
export function pendingAppeal(appeals: readonly AppealRow[] | null | undefined): AppealRow | null {
  return (appeals ?? []).find((a) => a.status === 'pending') ?? null;
}

// An item stays in the default (open) feed unless its kk status is settled — but
// a pending appeal always keeps it visible, since it needs Sona's decision.
export function isOpenFeedItem(kkStatus: string | null | undefined, hasPendingAppeal: boolean): boolean {
  if (hasPendingAppeal) return true;
  return !CLOSED_KK_STATUSES.has(kkStatus ?? '');
}

export interface AppealResolution {
  appealPatch: {
    status: AppealDecision;
    resolved_by: string;
    resolution_comment: string | null;
    resolved_at: string;
  };
  problemPatch: Record<string, unknown>;
}

// Faithful mirror of the kk app's resolveAppeal() write path, as pure data so it
// can be unit-tested without a database. `nowIso` is injected for determinism.
export function buildAppealResolution(
  decision: AppealDecision,
  comment: string | null | undefined,
  nowIso: string,
  resolvedBy: string = ANON_REVIEWER,
): AppealResolution {
  const cleanComment = (comment ?? '').trim() || null;
  const appealPatch = {
    status: decision,
    resolved_by: resolvedBy,
    resolution_comment: cleanComment,
    resolved_at: nowIso,
  };
  const problemPatch =
    decision === 'approved'
      ? {
          status: 'appeal_approved',
          verdict: 'not_problematic',
          verdict_at: nowIso,
          penalty_cancelled: true,
          penalty_cancelled_at: nowIso,
        }
      : { status: 'appeal_rejected' };
  return { appealPatch, problemPatch };
}
