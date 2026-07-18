// ============================================================================
// Shared numeric rounding helpers used by score-calculator and
// ai-visibility-calculator. Kept tiny and dependency-free so both modules
// share identical rounding behaviour (avoids float-dust drift between them).
// Agent B owned (src/contracts/** except index.ts).
// ============================================================================

/**
 * Rounds a number to a fixed number of decimal places using "round half away
 * from zero" semantics, correcting for common floating point drift
 * (e.g. 0.2 + 0.2 + 0.25 + 0.2 + 0.15 not landing exactly on 1).
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Display-facing rounding: 1 decimal place (docs/SCORE_CONTRACT.md). */
export function roundForDisplay(value: number): number;
export function roundForDisplay(value: null): null;
export function roundForDisplay(value: number | null): number | null;
export function roundForDisplay(value: number | null): number | null {
  return value === null ? null : roundTo(value, 1);
}

/** Internal-facing rounding: 2 decimal places (docs/SCORE_CONTRACT.md). */
export function roundInternal(value: number): number;
export function roundInternal(value: null): null;
export function roundInternal(value: number | null): number | null;
export function roundInternal(value: number | null): number | null {
  return value === null ? null : roundTo(value, 2);
}
