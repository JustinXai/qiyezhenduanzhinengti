import { describe, expect, it } from "vitest";
import type { ScoreDimension } from "../../src/contracts";
import {
  computeScoreBlock,
  SCORE_COVERAGE_THRESHOLD,
  type ScoreDimensionMap,
} from "../../src/report/validation/score-calculator";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

function dim(score: number | null): ScoreDimension {
  return {
    score,
    measurementStatus: score === null ? "INSUFFICIENT_EVIDENCE" : "MEASURED",
    confidence: score === null ? 0 : 0.7,
    evidenceIds: [],
  };
}

/** Build a dimension map from a partial map of scores (missing keys = null). */
function scores(partial: Partial<Record<keyof ScoreDimensionMap, number>>): ScoreDimensionMap {
  return {
    companyClarity: dim(partial.companyClarity ?? null),
    websiteCompleteness: dim(partial.websiteCompleteness ?? null),
    customerQuestionCoverage: dim(partial.customerQuestionCoverage ?? null),
    trustEvidence: dim(partial.trustEvidence ?? null),
    aiVisibility: dim(partial.aiVisibility ?? null),
  };
}

describe("computeScoreBlock", () => {
  it("reproduces the canonical sample's overallScore and coverage", () => {
    const result = computeScoreBlock(SAMPLE_DIAGNOSIS_REPORT.scores);
    // 0.20*72 + 0.20*65 + 0.25*55 + 0.20*60 + 0.15*40 = 59.15
    expect(result.overallScore).toBe(59.15);
    expect(result.scoreCoverage).toBe(1);
  });

  it("returns overallScore null and coverage 0 when every dimension is null", () => {
    const result = computeScoreBlock(scores({}));
    expect(result.overallScore).toBeNull();
    expect(result.scoreCoverage).toBe(0);
  });

  it("does NOT treat a null dimension as 0 when re-normalising", () => {
    // Only two 0.20 dimensions present -> coverage 0.40 (< threshold) -> null,
    // but the presence check proves the mean would be 80, never dragged to 0.
    const result = computeScoreBlock(scores({ companyClarity: 80, websiteCompleteness: 80 }));
    expect(result.scoreCoverage).toBe(0.4);
    expect(result.overallScore).toBeNull();
  });

  it("re-normalises weights over the non-null dimensions", () => {
    // Drop customerQuestionCoverage (0.25) -> coverage 0.75, above threshold.
    // weightedSum = 0.20*80 + 0.20*60 + 0.20*40 + 0.15*20 = 39 ; 39 / 0.75 = 52
    const result = computeScoreBlock(
      scores({ companyClarity: 80, websiteCompleteness: 60, trustEvidence: 40, aiVisibility: 20 }),
    );
    expect(result.scoreCoverage).toBe(0.75);
    expect(result.overallScore).toBe(52);
  });

  it("nulls overallScore just below the 70% coverage threshold (0.65)", () => {
    // companyClarity + websiteCompleteness + customerQuestionCoverage = 0.65
    const result = computeScoreBlock(
      scores({ companyClarity: 90, websiteCompleteness: 90, customerQuestionCoverage: 90 }),
    );
    expect(result.scoreCoverage).toBe(0.65);
    expect(result.scoreCoverage).toBeLessThan(SCORE_COVERAGE_THRESHOLD);
    expect(result.overallScore).toBeNull();
  });

  it("computes overallScore at the first reachable coverage above threshold (0.75)", () => {
    const result = computeScoreBlock(
      scores({ companyClarity: 90, websiteCompleteness: 90, trustEvidence: 90, aiVisibility: 90 }),
    );
    expect(result.scoreCoverage).toBe(0.75);
    expect(result.scoreCoverage).toBeGreaterThan(SCORE_COVERAGE_THRESHOLD);
    expect(result.overallScore).toBe(90);
  });

  it("rounds internal maths to 2 decimals", () => {
    // Full coverage; pick scores whose weighted mean has >2 decimals of drift.
    // 0.20*33.33 + 0.20*33.33 + 0.25*33.33 + 0.20*33.33 + 0.15*33.33 = 33.33
    const result = computeScoreBlock(
      scores({
        companyClarity: 33.33,
        websiteCompleteness: 33.33,
        customerQuestionCoverage: 33.33,
        trustEvidence: 33.33,
        aiVisibility: 33.33,
      }),
    );
    expect(result.scoreCoverage).toBe(1);
    expect(result.overallScore).toBe(33.33);
  });
});
