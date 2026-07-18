// ============================================================================
// AI-visibility dimension calculator — the single programmatic source of truth
// for docs/PRODUCT_TRUTH_RULES.md §8.
//
// The aiVisibility score / confidence / rationale MUST be derived from the
// real aiVisibilityTests counts here; an LLM must never free-write them.
//
// §8 formula (only once >= 3 VALID tests exist):
//   brand mention rate  50%
//   answer accuracy     30%   ACCURATE=100 PARTIAL=60 INACCURATE=0 NOT_MENTIONED=0
//   recommendation      20%   STRONG=100 MODERATE=60 WEAK=25 NONE=0
// Fewer than 3 VALID tests -> score = null, confidence <= 0.40.
//
// This module is a pure calculator (Agent B). It does NOT call Providers and
// is intentionally not wired into publish-guard: it produces the numbers the
// diagnosis engine (Agent D) writes into the aiVisibility ScoreDimension.
// ============================================================================

import type { AIVisibilityTest, MeasurementStatus } from "../../contracts";
import { roundInternal } from "../../contracts/rounding";

// index.ts (frozen) exports these enums as Zod *values* only, not TS types.
// Derive the string-literal unions from the canonical AIVisibilityTest fields
// so we never fork a second definition.
type AIVisibilityAccuracy = NonNullable<AIVisibilityTest["accuracy"]>;
type AIVisibilityRecommendationStrength = NonNullable<
  AIVisibilityTest["recommendationStrength"]
>;

/** §8: score is only computed once at least this many VALID tests exist. */
export const MIN_VALID_AI_TESTS = 3;
/** §8: below the minimum, confidence must not exceed this cap. */
export const INSUFFICIENT_CONFIDENCE_CAP = 0.4;

const BRAND_MENTION_WEIGHT = 0.5;
const ACCURACY_WEIGHT = 0.3;
const RECOMMENDATION_WEIGHT = 0.2;

const ACCURACY_POINTS: Record<AIVisibilityAccuracy, number> = {
  ACCURATE: 100,
  PARTIAL: 60,
  INACCURATE: 0,
  NOT_MENTIONED: 0,
};

const RECOMMENDATION_POINTS: Record<AIVisibilityRecommendationStrength, number> = {
  STRONG: 100,
  MODERATE: 60,
  WEAK: 25,
  NONE: 0,
};

// Confidence for the "measured" regime: a deterministic, sample-size-driven
// ramp above the insufficient cap, clamped so heuristic AI sampling never
// masquerades as certainty. B owns this seam; documented for Agent D.
const MEASURED_BASE_CONFIDENCE = 0.5; // at exactly MIN_VALID_AI_TESTS
const MEASURED_CONFIDENCE_PER_EXTRA = 0.1; // per additional VALID test
const MEASURED_CONFIDENCE_MAX = 0.9;

export interface AIVisibilityComputation {
  /** 0..100, or null when fewer than MIN_VALID_AI_TESTS VALID tests exist. */
  score: number | null;
  /** 0..1. Capped at INSUFFICIENT_CONFIDENCE_CAP below the minimum. */
  confidence: number;
  measurementStatus: MeasurementStatus;
  /** Program-generated wording built from the real counts (never LLM-authored). */
  rationale: string;
  validTestCount: number;
  brandMentionCount: number;
  /** Union of the VALID tests' evidenceIds (helper for building the dimension). */
  evidenceIds: string[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function uniqueUnion(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Compute the aiVisibility dimension score/confidence/rationale from tests.
 * Pure and deterministic.
 */
export function computeAIVisibility(tests: AIVisibilityTest[]): AIVisibilityComputation {
  const valid = tests.filter((t) => t.status === "VALID");
  const validTestCount = valid.length;
  const brandMentionCount = valid.filter((t) => t.brandMentioned === true).length;
  const evidenceIds = uniqueUnion(valid.flatMap((t) => t.evidenceIds));

  if (validTestCount < MIN_VALID_AI_TESTS) {
    const confidence = roundInternal(
      Math.min(
        INSUFFICIENT_CONFIDENCE_CAP,
        INSUFFICIENT_CONFIDENCE_CAP * (validTestCount / MIN_VALID_AI_TESTS),
      ),
    );
    return {
      score: null,
      confidence,
      measurementStatus: "INSUFFICIENT_EVIDENCE",
      rationale: `有效 AI 问答样本 ${validTestCount} 个,少于 ${MIN_VALID_AI_TESTS} 个,本次暂不计算 AI 可见度分数。`,
      validTestCount,
      brandMentionCount,
      evidenceIds,
    };
  }

  const brandMentionRate = (brandMentionCount / validTestCount) * 100;
  const accuracyAvg = average(valid.map((t) => ACCURACY_POINTS[t.accuracy ?? "NOT_MENTIONED"]));
  const recommendationAvg = average(
    valid.map((t) => RECOMMENDATION_POINTS[t.recommendationStrength ?? "NONE"]),
  );

  const score = roundInternal(
    BRAND_MENTION_WEIGHT * brandMentionRate +
      ACCURACY_WEIGHT * accuracyAvg +
      RECOMMENDATION_WEIGHT * recommendationAvg,
  );

  const confidence = roundInternal(
    Math.min(
      MEASURED_CONFIDENCE_MAX,
      MEASURED_BASE_CONFIDENCE +
        MEASURED_CONFIDENCE_PER_EXTRA * (validTestCount - MIN_VALID_AI_TESTS),
    ),
  );

  const rationale =
    `基于 ${validTestCount} 个有效 AI 问答样本:品牌被提及 ${brandMentionCount}/${validTestCount},` +
    `回答准确度均值 ${roundInternal(accuracyAvg)} 分,推荐强度均值 ${roundInternal(recommendationAvg)} 分。` +
    `此为当前模型、当前时间、当前问题集的诊断样本,不代表全网 AI 推荐率。`;

  return {
    score,
    confidence,
    measurementStatus: "MEASURED",
    rationale,
    validTestCount,
    brandMentionCount,
    evidenceIds,
  };
}
