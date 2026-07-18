import { describe, expect, it } from "vitest";
import { computeOverall, type DimensionScoreMap } from "../../src/report/generation";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import type { ScoreDimension } from "../../src/contracts";

function dim(score: number | null, status: ScoreDimension["measurementStatus"] = "MEASURED"): ScoreDimension {
  return { score, measurementStatus: status, confidence: 0.5, evidenceIds: [] };
}

describe("computeOverall — SCORE_CONTRACT seam", () => {
  it("reproduces the shared sample's 62.53 / coverage 0.85", () => {
    const s = SAMPLE_DIAGNOSIS_REPORT.scores;
    const res = computeOverall({
      companyClarity: s.companyClarity,
      websiteCompleteness: s.websiteCompleteness,
      customerQuestionCoverage: s.customerQuestionCoverage,
      trustEvidence: s.trustEvidence,
      aiVisibility: s.aiVisibility,
    });
    // aiVisibility null -> renormalise over 0.85: (14.4+13+13.75+12)/0.85 = 62.53
    expect(res.overallScore).toBe(62.53);
    expect(res.scoreCoverage).toBe(0.85);
  });

  it("renormalizes weights over the non-null dimensions", () => {
    // Only companyClarity(.2)=80 and customerQuestionCoverage(.25)=40 present.
    // coverage = .45 (< .70) → overallScore null.
    const map: DimensionScoreMap = {
      companyClarity: dim(80),
      websiteCompleteness: dim(null, "INSUFFICIENT_EVIDENCE"),
      customerQuestionCoverage: dim(40),
      trustEvidence: dim(null, "INSUFFICIENT_EVIDENCE"),
      aiVisibility: dim(null, "INSUFFICIENT_EVIDENCE"),
    };
    const res = computeOverall(map);
    expect(res.overallScore).toBeNull();
    expect(res.scoreCoverage).toBe(0.45);
  });

  it("returns null overallScore exactly at the sub-70% boundary", () => {
    // companyClarity(.2)+websiteCompleteness(.2)+trustEvidence(.2) = .60 < .70.
    const map: DimensionScoreMap = {
      companyClarity: dim(90),
      websiteCompleteness: dim(90),
      customerQuestionCoverage: dim(null, "INSUFFICIENT_EVIDENCE"),
      trustEvidence: dim(90),
      aiVisibility: dim(null, "INSUFFICIENT_EVIDENCE"),
    };
    const res = computeOverall(map);
    expect(res.scoreCoverage).toBe(0.6);
    expect(res.overallScore).toBeNull();
  });

  it("computes a renormalized score once coverage reaches 70%", () => {
    // companyClarity(.2)=60, websiteCompleteness(.2)=80, customerQuestionCoverage(.25)=50,
    // trustEvidence(.2)=70 → coverage .85; weightedSum = 12+16+12.5+14 = 54.5; /0.85 = 64.12.
    const map: DimensionScoreMap = {
      companyClarity: dim(60),
      websiteCompleteness: dim(80),
      customerQuestionCoverage: dim(50),
      trustEvidence: dim(70),
      aiVisibility: dim(null, "INSUFFICIENT_EVIDENCE"),
    };
    const res = computeOverall(map);
    expect(res.scoreCoverage).toBe(0.85);
    expect(res.overallScore).toBe(64.12);
  });

  it("treats a null dimension as absent, never as 0", () => {
    const allNull: DimensionScoreMap = {
      companyClarity: dim(null, "INSUFFICIENT_EVIDENCE"),
      websiteCompleteness: dim(null, "INSUFFICIENT_EVIDENCE"),
      customerQuestionCoverage: dim(null, "INSUFFICIENT_EVIDENCE"),
      trustEvidence: dim(null, "INSUFFICIENT_EVIDENCE"),
      aiVisibility: dim(null, "INSUFFICIENT_EVIDENCE"),
    };
    const res = computeOverall(allNull);
    expect(res.overallScore).toBeNull();
    expect(res.scoreCoverage).toBe(0);
  });
});
