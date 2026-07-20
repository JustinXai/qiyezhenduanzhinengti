import { describe, expect, it } from "vitest";
import type { QuickReportViewModel, ScoreDimension } from "../../src/contracts";
import {
  crossFieldGuard,
  viewModelEvidenceGuard,
} from "../../src/report/validation/cross-field-guard";
import { buildValidReport, codesOf } from "./support";

const NULL_DIM: ScoreDimension = {
  score: null,
  measurementStatus: "INSUFFICIENT_EVIDENCE",
  confidence: 0,
  evidenceIds: [],
};

function minimalQuick(report = buildValidReport()): QuickReportViewModel {
  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: "zh-CN" as const,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    headlineConclusion: "企业在 AI 问答中的基础可见度仍有提升空间。",
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: "部分维度暂未测得。",
    measurementComposition: { measuredWeight: 0.15, estimatedWeight: 0.85, insufficientWeight: 0, providerFailedWeight: 0 },
    estimationNotice: null,
    topStrength: report.strengths[0] ?? null,
    topIssue: report.coreIssues[0] ?? null,
    topOpportunity: report.geoOpportunities[0] ?? null,
    // aiVisibilitySamples removed from Quick
    competitorGapSummary: {
      available: false,
      reason: "",
    },
    coreIssues: [],
    demonstrationFix: null,
    geoOpportunities: [],
    // New fields
    questionCoverageStats: { totalQuestions: 0, fullySupportedCount: 0, partiallySupportedCount: 0, unansweredCount: 0 },
    questionCoverageRestrainedMessage: null,
    keyCustomerQuestions: [],
    priorityDirections: [],
  };
}

describe("crossFieldGuard", () => {
  it("passes a consistent report", () => {
    expect(crossFieldGuard(buildValidReport())).toEqual({ ok: true });
  });

  it("flags a scoreCoverage that disagrees with the dimensions", () => {
    const report = buildValidReport();
    report.scores.scoreCoverage = 0.8; // real coverage is 1.0
    expect(codesOf(crossFieldGuard(report))).toContain("CROSS_FIELD_SCORE_COVERAGE_MISMATCH");
  });

  it("flags an overallScore that disagrees with the dimensions", () => {
    const report = buildValidReport();
    report.scores.overallScore = 42; // real value is 59.15
    expect(codesOf(crossFieldGuard(report))).toContain("CROSS_FIELD_OVERALL_SCORE_MISMATCH");
  });

  it("flags a null overallScore when coverage is above threshold", () => {
    const report = buildValidReport();
    report.scores.overallScore = null; // coverage is 1.0 -> should be a number
    expect(codesOf(crossFieldGuard(report))).toContain("CROSS_FIELD_OVERALL_SCORE_MISMATCH");
  });

  it("flags a non-null overallScore when coverage is below threshold", () => {
    const report = buildValidReport();
    report.scores.customerQuestionCoverage = { ...NULL_DIM };
    report.scores.trustEvidence = { ...NULL_DIM };
    report.scores.aiVisibility = { ...NULL_DIM };
    report.scores.scoreCoverage = 0.4; // matches recomputed coverage
    report.scores.overallScore = 70; // must be null below 0.70
    expect(codesOf(crossFieldGuard(report))).toContain(
      "CROSS_FIELD_OVERALL_SCORE_NOT_NULL_BELOW_COVERAGE_THRESHOLD",
    );
  });

  it("accepts a below-threshold report whose overallScore is correctly null", () => {
    const report = buildValidReport();
    report.scores.customerQuestionCoverage = { ...NULL_DIM };
    report.scores.trustEvidence = { ...NULL_DIM };
    report.scores.aiVisibility = { ...NULL_DIM };
    report.scores.scoreCoverage = 0.4;
    report.scores.overallScore = null;
    expect(crossFieldGuard(report)).toEqual({ ok: true });
  });

  it("flags a demonstrationFix citing missing evidence", () => {
    const report = buildValidReport();
    report.demonstrationFix = { ...report.demonstrationFix!, evidenceIds: ["ev_ghost"] };
    expect(codesOf(crossFieldGuard(report))).toContain(
      "CROSS_FIELD_DEMONSTRATION_FIX_WITHOUT_EVIDENCE",
    );
  });
});

describe("viewModelEvidenceGuard", () => {
  it("passes when every view-model evidenceId resolves", () => {
    const report = buildValidReport();
    expect(
      viewModelEvidenceGuard(report, {
        quick: minimalQuick(report),
        evidenceView: { items: report.evidence },
      }),
    ).toEqual({ ok: true });
  });

  it("flags a Quick view-model evidenceId absent from the report", () => {
    const report = buildValidReport();
    const quick = minimalQuick(report);
    quick.topIssue = { ...report.coreIssues[0]!, evidenceIds: ["ev_ghost"] };
    expect(codesOf(viewModelEvidenceGuard(report, { quick }))).toContain(
      "CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND",
    );
  });

  it("flags an Evidence view-model item absent from the report", () => {
    const report = buildValidReport();
    const evidenceView = {
      items: [...report.evidence, { ...report.evidence[0]!, id: "ev_ghost" }],
    };
    expect(codesOf(viewModelEvidenceGuard(report, { evidenceView }))).toContain(
      "CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND",
    );
  });
});
