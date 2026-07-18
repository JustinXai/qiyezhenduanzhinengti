import { describe, expect, it } from "vitest";
import { DiagnosisReport, REPORT_CONTRACT_VERSION, SCORE_CONTRACT_VERSION } from "../../src/contracts";

describe("DiagnosisReport contract", () => {
  it("accepts a minimal valid canonical report", () => {
    const sample = {
      reportContractVersion: REPORT_CONTRACT_VERSION,
      scoreContractVersion: SCORE_CONTRACT_VERSION,
      diagnosisId: "diag_1",
      publicToken: "tok_1",
      generatedAt: new Date(0).toISOString(),
      companyProfile: {
        brandName: "示例企业",
        website: "https://example.com",
        industry: "SaaS",
        productOrService: "示例产品",
        targetRegion: "华东",
        competitors: [],
        unresolvedQuestions: [],
      },
      scores: {
        companyClarity: { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] },
        websiteCompleteness: { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] },
        customerQuestionCoverage: { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] },
        trustEvidence: { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] },
        aiVisibility: { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] },
        overallScore: null,
        scoreCoverage: 0,
      },
      aiVisibilityTests: [],
      strengths: [],
      coreIssues: [],
      competitorGaps: [],
      geoOpportunities: [],
      demonstrationFix: null,
      evidence: [],
    };

    expect(() => DiagnosisReport.parse(sample)).not.toThrow();
  });
});
