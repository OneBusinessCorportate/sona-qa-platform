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

// ── Weighted scorecard ("Общая оценка" / Итог Q) ──────────────────────────
//
// Sona's "Общая оценка" sheet grades each accountant over a period on five
// criteria (each 0–100) and weights them into a single Итог Q. Weights and the
// scale come from her "Гайд" sheet:
//   К1 ошибки/уровень   ×0.1   К2 сроки      ×0.3   К3 качество отчётности ×0.2
//   К4 полнота докум.   ×0.3   К5 доработки  ×0.1
// Per the chosen approach we DERIVE К1..К5 from the daily reviews she already
// fills (one entry → auto scorecard), and let her override any value.

export const SCORECARD_CRITERIA: Array<{ id: 'k1' | 'k2' | 'k3' | 'k4' | 'k5'; label: string; weight: number }> = [
  { id: 'k1', label: 'Ошибки / уровень',        weight: 0.1 },
  { id: 'k2', label: 'Соблюдение сроков',       weight: 0.3 },
  { id: 'k3', label: 'Качество отчётности',     weight: 0.2 },
  { id: 'k4', label: 'Полнота документов',      weight: 0.3 },
  { id: 'k5', label: 'Доработки после проверки', weight: 0.1 },
];

export interface Criteria { k1: number; k2: number; k3: number; k4: number; k5: number }

// Map a single review's checklist (+ problem flag) to the five criteria, 0–100.
// Mirrors the "1/3/5" scale of Sona's guide, expressed as 20/60/100 style bands.
export function reviewToCriteria(review: {
  scores?: { checklist?: Checklist | null } | null;
  record_type?: string | null;
}): Criteria {
  const c = review.scores?.checklist ?? {};
  const yes = (id: string) => c[id] === 'yes';

  // К1 — ошибки: штрафы → критично (20); ошибки/камералка → некритично (60); иначе 100.
  const k1 = yes('penalties') ? 20 : yes('errors') || yes('desk_audit') ? 60 : 100;
  // К2 — сроки: просрочка → 40, иначе 100.
  const k2 = yes('overdue') ? 40 : 100;
  // К3 — качество отчётности: доля {корректность, формат}.
  const k3 = [20, 60, 100][(yes('correct') ? 1 : 0) + (yes('format') ? 1 : 0)];
  // К4 — полнота документов: доля {счета подписаны, первичка, стандарты}.
  const k4good = (yes('signed') ? 1 : 0) + (yes('confirmed') ? 1 : 0) + (yes('standards') ? 1 : 0);
  const k4 = Math.round(20 + k4good * (80 / 3));
  // К5 — доработки: запись-«проблема» → требовались доработки (40), иначе 100.
  const k5 = review.record_type === 'problem' ? 40 : 100;

  return { k1, k2, k3, k4, k5 };
}

// Average a set of per-review criteria into one accountant's К1..К5.
export function averageCriteria(list: Criteria[]): Criteria {
  if (!list.length) return { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 };
  const sum = list.reduce<Criteria>(
    (a, c) => ({ k1: a.k1 + c.k1, k2: a.k2 + c.k2, k3: a.k3 + c.k3, k4: a.k4 + c.k4, k5: a.k5 + c.k5 }),
    { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 },
  );
  const n = list.length;
  return {
    k1: Math.round(sum.k1 / n), k2: Math.round(sum.k2 / n), k3: Math.round(sum.k3 / n),
    k4: Math.round(sum.k4 / n), k5: Math.round(sum.k5 / n),
  };
}

// Weighted Итог Q (0–100, rounded) from the five criteria.
export function itogQ(c: Criteria): number {
  const q = SCORECARD_CRITERIA.reduce((s, k) => s + c[k.id] * k.weight, 0);
  return Math.round(q);
}

// Action level for an Итог Q, from the guide's scale (1–5 bands × 20).
export function scorecardLevel(q: number): string {
  if (q >= 90) return 'Премирование, кадровый резерв';
  if (q >= 70) return 'План развития по слабым зонам';
  if (q >= 50) return 'План корректирующих мероприятий';
  return 'Административные меры / доп. обучение';
}
