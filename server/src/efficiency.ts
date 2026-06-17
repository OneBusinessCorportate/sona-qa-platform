// Quality scoring for an accountant review, mirroring Sona's actual Excel method.
//
// Sona grades each review against a 9-point Yes/No checklist; the score is the
// share of "good" answers: Оценка % = good / 9 * 100  (e.g. 8/9 = 88.9%).
// This is the single source of truth so the form preview and the stored value
// cannot drift; keep client/src/pages/SonaForm.tsx in sync.

// Each criterion's "good" answer ('yes' or 'no'). Order matches Sona's sheet.
export const CHECKLIST: Array<{ id: string; label: string; good: 'yes' | 'no' }> = [
  { id: 'overdue',    label: 'Есть просрочка',                     good: 'no'  },
  { id: 'signed',     label: 'Счета подписаны',                    good: 'yes' },
  { id: 'correct',    label: 'Корректность и полнота',             good: 'yes' },
  { id: 'confirmed',  label: 'Подтверждение цифр первичкой',       good: 'yes' },
  { id: 'format',     label: 'Формат и техническая сдача',         good: 'yes' },
  { id: 'errors',     label: 'Ошибки',                             good: 'no'  },
  { id: 'desk_audit', label: 'Камеральные требования / уточнения', good: 'no'  },
  { id: 'penalties',  label: 'Штрафы / уведомления',               good: 'no'  },
  { id: 'standards',  label: 'Внутренние стандарты',               good: 'yes' },
];

export type Checklist = Record<string, 'yes' | 'no' | undefined>;

// Оценка %: share of criteria answered with their "good" value, over all 9.
export function checklistScore(checklist: Checklist | null | undefined): number {
  const c = checklist ?? {};
  const good = CHECKLIST.reduce((n, item) => n + (c[item.id] === item.good ? 1 : 0), 0);
  return Math.round((good / CHECKLIST.length) * 10000) / 100; // 2 decimals, like the sheet
}

// Баллы: Sona's 0–20 banding of the percentage (100→20, ~78–99→15, ~66–77→10…).
export function scoreBand(pct: number): number {
  if (pct >= 95) return 20;
  if (pct >= 75) return 15;
  if (pct >= 60) return 10;
  if (pct >= 40) return 5;
  return 0;
}

// Legacy error-penalty efficiency, kept only as a fallback for reviews saved
// before the checklist existed (no checklist data present).
const ERROR_PENALTY: Record<string, number> = { minor: 3, serious: 12, low: 3, medium: 6, high: 12 };
function errorPenaltyScore(errors: Array<{ severity?: string }> | null | undefined): number {
  const list = Array.isArray(errors) ? errors : [];
  const penalty = list.reduce((s, e) => s + (ERROR_PENALTY[e?.severity ?? 'minor'] ?? 3), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

// Headline score % for a review: checklist if present, else legacy fallback.
export function computeScore(
  checklist: Checklist | null | undefined,
  errors?: Array<{ severity?: string }> | null,
): number {
  if (checklist && Object.keys(checklist).length) return checklistScore(checklist);
  return errorPenaltyScore(errors);
}
