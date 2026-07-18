// INTEGRATION SEAM (Agent B score-calculator) — replace at integration.
//
// The AUTHORITATIVE overallScore / scoreCoverage calculator is owned by Agent B at
// src/report/validation/score-calculator.ts, which is NOT in this worktree. So that
// assemble-report.ts can run and be tested in isolation this round, this file
// implements the frozen SCORE_CONTRACT.md formula only. At integration the
// Supervisor swaps calls to `computeOverall` for Agent B's implementation.
// Do NOT copy any of B's other guards here.
//
// SCORE_CONTRACT.md:
//   - scoreCoverage = Σ weight of dimensions that have a non-null score.
//   - overallScore uses only non-null dimensions with their weights renormalized.
//   - scoreCoverage < 70% → overallScore = null (null is never treated as 0).
//   - internal precision: 2 decimals.

import { SCORE_DIMENSION_WEIGHTS, type ScoreDimension, type ScoreDimensionKey } from "../../contracts";
import { round2 } from "../../diagnosis/analysis/evidence-index";

export const SCORE_COVERAGE_THRESHOLD = 0.7;

export type DimensionScoreMap = Record<ScoreDimensionKey, ScoreDimension>;

export interface OverallScoreResult {
  overallScore: number | null;
  scoreCoverage: number;
}

export function computeOverall(dimensions: DimensionScoreMap): OverallScoreResult {
  let coverage = 0;
  let weightedSum = 0;

  for (const key of Object.keys(SCORE_DIMENSION_WEIGHTS) as ScoreDimensionKey[]) {
    const dim = dimensions[key];
    const weight = SCORE_DIMENSION_WEIGHTS[key];
    if (dim.score !== null) {
      coverage += weight;
      weightedSum += weight * dim.score;
    }
  }

  const scoreCoverage = round2(coverage);
  if (coverage < SCORE_COVERAGE_THRESHOLD) {
    return { overallScore: null, scoreCoverage };
  }
  return { overallScore: round2(weightedSum / coverage), scoreCoverage };
}
