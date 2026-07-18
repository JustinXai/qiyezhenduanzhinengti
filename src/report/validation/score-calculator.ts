// ============================================================================
// Pure overall-score / score-coverage calculator.
// Single source of truth for docs/SCORE_CONTRACT.md's "综合分规则":
//   - only non-null dimensions contribute,
//   - weights are re-normalised over the non-null dimensions,
//   - scoreCoverage = sum of the frozen weights that carry a non-null score,
//   - scoreCoverage < 0.70  ->  overallScore = null  (null is NOT 0),
//   - internal maths keep 2 decimals (docs/SCORE_CONTRACT.md).
//
// Frozen weights live in src/contracts/index.ts (SCORE_DIMENSION_WEIGHTS,
// Supervisor-owned). This module never redefines them.
//
// NOTE on the 70% boundary: with the frozen weights
//   {0.20, 0.20, 0.25, 0.20, 0.15}
// the reachable coverage sums are
//   .15 .20 .25 .35 .40 .45 .55 .60 .65 .75 .80 .85 1.00
// — 0.70 is structurally UNREACHABLE from real dimension subsets, so the
// meaningful boundary is 0.65 (below -> null) vs 0.75 (computed). The strict
// `< THRESHOLD` comparison is still applied so the rule holds if weights ever
// change through the Supervisor.
// ============================================================================

import {
  SCORE_DIMENSION_WEIGHTS,
  type ScoreDimension,
  type ScoreDimensionKey,
} from "../../contracts";
import { roundInternal } from "../../contracts/rounding";

/** docs/SCORE_CONTRACT.md: coverage strictly below this -> overallScore = null. */
export const SCORE_COVERAGE_THRESHOLD = 0.7;

/** The five frozen dimensions keyed by their SCORE_DIMENSION_WEIGHTS key. */
export type ScoreDimensionMap = Record<ScoreDimensionKey, ScoreDimension>;

export interface ScoreComputation {
  /** Re-normalised weighted mean of non-null dimensions, or null below threshold. */
  overallScore: number | null;
  /** Sum of the frozen weights carrying a non-null score (0..1), 2 decimals. */
  scoreCoverage: number;
}

const DIMENSION_KEYS = Object.keys(SCORE_DIMENSION_WEIGHTS) as ScoreDimensionKey[];

/**
 * Compute { overallScore, scoreCoverage } from the five score dimensions.
 * Pure and deterministic — no Provider calls, no I/O.
 */
export function computeScoreBlock(dimensions: ScoreDimensionMap): ScoreComputation {
  let coverageWeight = 0;
  let weightedSum = 0;

  for (const key of DIMENSION_KEYS) {
    const dim = dimensions[key];
    const weight = SCORE_DIMENSION_WEIGHTS[key];
    if (dim && dim.score !== null) {
      coverageWeight += weight;
      weightedSum += weight * dim.score;
    }
  }

  const scoreCoverage = roundInternal(coverageWeight);

  // null (not 0) whenever nothing was measured or coverage is below threshold.
  if (coverageWeight === 0 || scoreCoverage < SCORE_COVERAGE_THRESHOLD) {
    return { overallScore: null, scoreCoverage };
  }

  const overallScore = roundInternal(weightedSum / coverageWeight);
  return { overallScore, scoreCoverage };
}
