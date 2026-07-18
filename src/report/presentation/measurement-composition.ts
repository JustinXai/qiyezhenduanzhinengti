// ============================================================================
// measurementComposition (Round-5.1 §八) — deterministic transparency numbers.
//
// Does NOT touch scores or weights: it only reports how much of the FROZEN
// dimension weight (SCORE_DIMENSION_WEIGHTS) sits in each measurement status,
// so the customer sees "实测 X% / 公开网页估算 Y%" instead of a bare
// "覆盖率100%". Pure function of the ScoreBlock; no provider calls.
// ============================================================================

import {
  SCORE_DIMENSION_WEIGHTS,
  type DiagnosisReport,
  type ScoreDimensionKey,
} from "../../contracts";

export interface MeasurementComposition {
  /** Weight share (0–1) of dimensions whose status is MEASURED. */
  measuredWeight: number;
  /** Weight share of ESTIMATED dimensions (公开网页估算). */
  estimatedWeight: number;
  /** Weight share of INSUFFICIENT_EVIDENCE dimensions. */
  insufficientWeight: number;
  /** Weight share of PROVIDER_FAILED dimensions (暂未测得). */
  providerFailedWeight: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Compute the frozen-weight share of each measurement status. */
export function computeMeasurementComposition(
  scores: DiagnosisReport["scores"],
): MeasurementComposition {
  const acc: MeasurementComposition = {
    measuredWeight: 0,
    estimatedWeight: 0,
    insufficientWeight: 0,
    providerFailedWeight: 0,
  };
  for (const key of Object.keys(SCORE_DIMENSION_WEIGHTS) as ScoreDimensionKey[]) {
    const weight = SCORE_DIMENSION_WEIGHTS[key];
    switch (scores[key].measurementStatus) {
      case "MEASURED":
        acc.measuredWeight += weight;
        break;
      case "ESTIMATED":
        acc.estimatedWeight += weight;
        break;
      case "INSUFFICIENT_EVIDENCE":
        acc.insufficientWeight += weight;
        break;
      case "PROVIDER_FAILED":
        acc.providerFailedWeight += weight;
        break;
    }
  }
  return {
    measuredWeight: round2(acc.measuredWeight),
    estimatedWeight: round2(acc.estimatedWeight),
    insufficientWeight: round2(acc.insufficientWeight),
    providerFailedWeight: round2(acc.providerFailedWeight),
  };
}

/** Frozen §八 disclaimer, shown whenever估算 outweighs实测. */
export const ESTIMATION_DOMINANT_NOTICE =
  "本报告多数维度基于本次公开网页和搜索证据估算,建议结合企业内部资料进一步确认。";

/** The notice to attach to Quick (null when实测 dominates). */
export function estimationNoticeFor(composition: MeasurementComposition): string | null {
  return composition.estimatedWeight > composition.measuredWeight ? ESTIMATION_DOMINANT_NOTICE : null;
}
