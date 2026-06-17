// Accountant efficiency %, computed from the errors Sona logs on a review.
// Sona grades errors by accounting standards as "minor" vs "serious" (her words);
// efficiency starts at 100% and each error subtracts a penalty by severity.
//
// NOTE: penalties are intentionally simple and tunable — confirm the final
// weights with Sona/Lilit. Kept here as the single source of truth so the form
// preview and the stored value cannot drift.
export const ERROR_PENALTY: Record<string, number> = {
  minor: 3,
  serious: 12,
  // legacy 3-level scale (kept so old records still compute)
  low: 3,
  medium: 6,
  high: 12,
};

export interface ReviewError { text?: string; severity?: string }

export function computeEfficiency(errors: ReviewError[] | null | undefined): number {
  const list = Array.isArray(errors) ? errors : [];
  const penalty = list.reduce((sum, e) => sum + (ERROR_PENALTY[e?.severity ?? 'minor'] ?? 3), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
