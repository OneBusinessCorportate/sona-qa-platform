// The three review-stage comments Sona keeps on each review and how they
// collapse into the single `comment` column used by lists and reports:
//   before — до передачи бухгалтеру
//   work   — по работе бухгалтера
//   after  — после завершения
// Kept as a small pure module so the form, the route, and tests share one
// source of truth for trimming and joining.

export interface ReviewComments {
  before?: string | null;
  work?: string | null;
  after?: string | null;
}
export type NormalizedComments = { before: string | null; work: string | null; after: string | null };

// Trim each stage and turn blanks into null; returns null when nothing given.
export function normalizeComments(c: ReviewComments | null | undefined): NormalizedComments | null {
  if (!c) return null;
  return {
    before: (c.before ?? '').trim() || null,
    work: (c.work ?? '').trim() || null,
    after: (c.after ?? '').trim() || null,
  };
}

// Labelled single-string join for the `comment` column (skips empty stages).
export function combineComments(c: NormalizedComments | null): string | null {
  if (!c) return null;
  return [
    c.before && `До: ${c.before}`,
    c.work && `Работа: ${c.work}`,
    c.after && `После: ${c.after}`,
  ].filter(Boolean).join('\n') || null;
}
