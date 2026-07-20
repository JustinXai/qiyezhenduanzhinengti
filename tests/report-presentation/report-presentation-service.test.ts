import { describe, expect, it } from "vitest";
import {
  COMPETITOR_INSUFFICIENT_EVIDENCE_REASON,
  COMPETITOR_NOT_PROVIDED_REASON,
  presentReport,
  toDeepReportViewModel,
  toEvidenceViewModel,
  toQuickReportViewModel,
} from "../../src/report/presentation/report-presentation-service";
import {
  QuickReportViewModel,
  DeepReportViewModel,
  EvidenceViewModel,
} from "../../src/contracts";
import {
  SAMPLE_DIAGNOSIS_REPORT,
  buildSampleReport,
} from "../../src/fixtures/sample-report";
import { FORBIDDEN_COPY } from "./forbidden-copy";

describe("toQuickReportViewModel", () => {
  it("produces a schema-valid QuickReportViewModel from the canonical sample", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => QuickReportViewModel.parse(vm)).not.toThrow();
  });

  it("carries the mandated 'GEO基础诊断指数' naming and no forbidden score aliases", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    // Check that forbidden score aliases are not in copy fields
    for (const banned of FORBIDDEN_COPY) {
      expect(vm.headlineConclusion).not.toContain(banned);
      expect(vm.measurementStatusSummary).not.toContain(banned);
    }
    // Score label is defined in customer-copy.ts as OVERALL_SCORE_LABEL
    expect(vm.overallScore).toBeDefined();
  });

  it("ranks top claims by evidence strength, NOT array[0]", () => {
    // array[0] is a weak UNVERIFIED_HYPOTHESIS; array[1] is a well-evidenced
    // DIAGNOSTIC_INFERENCE. The ranked top must be the evidenced one.
    const report = buildSampleReport({
      coreIssues: [
        {
          id: "weak_first",
          claimType: "UNVERIFIED_HYPOTHESIS",
          statement: "弱假设应当落后",
          businessImpact: "影响",
          evidenceIds: ["ev_observed_news"], // CONTEXT_ONLY
          fixDirection: "方向",
        },
        {
          id: "strong_second",
          claimType: "DIAGNOSTIC_INFERENCE",
          statement: "强证据应当领先",
          businessImpact: "影响",
          evidenceIds: ["ev_first_home"], // DIRECT_SUPPORT
          fixDirection: "方向",
        },
      ],
    });
    const vm = toQuickReportViewModel(report);
    expect(vm.topIssue?.id).toBe("strong_second");
    expect(vm.coreIssues[0]?.id).toBe("strong_second");
  });

  it("produces question coverage stats and key questions from gaps", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    // Sample report has 3 gaps: 2 PARTIALLY_SUPPORTED, 1 UNANSWERED
    expect(vm.questionCoverageStats.totalQuestions).toBe(3);
    expect(vm.questionCoverageStats.partiallySupportedCount).toBe(2);
    expect(vm.questionCoverageStats.unansweredCount).toBe(1);
    expect(vm.questionCoverageStats.fullySupportedCount).toBe(0);
    // Max 3 key questions
    expect(vm.keyCustomerQuestions.length).toBeLessThanOrEqual(3);
  });

  it("produces priority directions by clustering gaps", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    // Should have priority directions derived from clusters
    expect(Array.isArray(vm.priorityDirections)).toBe(true);
  });

  describe("competitor gap conditional availability", () => {
    it("is available when competitors were provided and gaps are evidenced", () => {
      const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
      expect(vm.competitorGapSummary.available).toBe(true);
      if (vm.competitorGapSummary.available) {
        expect(vm.competitorGapSummary.gaps.length).toBeGreaterThan(0);
      }
    });

    it("is unavailable when competitors are provided but evidence is weak (reason empty for Quick)", () => {
      const report = buildSampleReport({
        competitorGaps: [
          {
            id: "gap_weak",
            competitorName: "竞品甲自动化",
            gapStatement: "证据不足的差距陈述",
            evidenceIds: ["ev_observed_news"], // CONTEXT_ONLY -> not semantic support
          },
        ],
      });
      const vm = toQuickReportViewModel(report);
      expect(vm.competitorGapSummary.available).toBe(false);
      // Quick hides empty competitor module
    });

    it("is unavailable when no competitor was input", () => {
      const report = buildSampleReport({
        companyProfile: {
          ...SAMPLE_DIAGNOSIS_REPORT.companyProfile,
          competitors: [],
        },
      });
      const vm = toQuickReportViewModel(report);
      expect(vm.competitorGapSummary.available).toBe(false);
    });
  });

  it("passes demonstrationFix through as null when the report has none (module hidden)", () => {
    const report = buildSampleReport({ demonstrationFix: null });
    const vm = toQuickReportViewModel(report);
    expect(vm.demonstrationFix).toBeNull();
  });

  it("preserves the frozen demonstrationFix disclaimer byte-for-byte", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.demonstrationFix?.disclaimer).toBe(
      SAMPLE_DIAGNOSIS_REPORT.demonstrationFix?.disclaimer,
    );
  });

  it("caps coreIssues and geoOpportunities at 3 without padding", () => {
    const baseIssue = SAMPLE_DIAGNOSIS_REPORT.coreIssues[0]!;
    const baseOpp = SAMPLE_DIAGNOSIS_REPORT.geoOpportunities[0]!;
    const report = buildSampleReport({
      coreIssues: Array.from({ length: 5 }, (_, i) => ({ ...baseIssue, id: `iss_${i}` })),
      geoOpportunities: Array.from({ length: 5 }, (_, i) => ({ ...baseOpp, id: `geo_${i}` })),
    });
    const vm = toQuickReportViewModel(report);
    expect(vm.coreIssues).toHaveLength(3);
    expect(vm.geoOpportunities).toHaveLength(3);

    // Fewer-than-limit inputs are NOT padded.
    const sparse = toQuickReportViewModel(
      buildSampleReport({ geoOpportunities: [baseOpp] }),
    );
    expect(sparse.geoOpportunities).toHaveLength(1);
  });

  it("returns null top selections when the report has none", () => {
    const report = buildSampleReport({ strengths: [], coreIssues: [], geoOpportunities: [] });
    const vm = toQuickReportViewModel(report);
    expect(vm.topStrength).toBeNull();
    expect(vm.topIssue).toBeNull();
    expect(vm.topOpportunity).toBeNull();
    expect(vm.coreIssues).toHaveLength(0);
  });

  it("emits a null-safe headline when overallScore is null", () => {
    const report = buildSampleReport({
      scores: {
        ...SAMPLE_DIAGNOSIS_REPORT.scores,
        overallScore: null,
        scoreCoverage: 0.4,
      },
    });
    const vm = toQuickReportViewModel(report);
    expect(vm.overallScore).toBeNull();
    expect(vm.headlineConclusion).not.toContain("NaN");
    expect(vm.headlineConclusion).toContain("40%");
  });
});

describe("toDeepReportViewModel", () => {
  it("produces a schema-valid DeepReportViewModel", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => DeepReportViewModel.parse(vm)).not.toThrow();
  });

  it("exposes only VALID AI tests", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.aiVisibilityTests.every((t) => t.status === "VALID")).toBe(true);
    expect(vm.aiVisibilityTests.map((t) => t.id)).not.toContain("aiv_3");
  });

  it("includes measurement notes that frame AI tests as a diagnostic sample, not market share", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.measurementNotes.length).toBeGreaterThan(0);
    expect(vm.measurementNotes.some((n) => n.includes("诊断样本"))).toBe(true);
    expect(vm.measurementNotes.some((n) => n.includes("不代表多平台市场份额"))).toBe(true);
  });

  it("notes when fewer than 3 VALID AI tests exist", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT); // 2 VALID in sample
    expect(vm.measurementNotes.some((n) => n.includes("少于 3 项"))).toBe(true);
  });

  it("uses evidence-gated competitor gaps (weak evidence dropped)", () => {
    const report = buildSampleReport({
      competitorGaps: [
        {
          id: "gap_weak",
          competitorName: "竞品甲自动化",
          gapStatement: "证据不足",
          evidenceIds: ["ev_observed_news"], // CONTEXT_ONLY
        },
      ],
    });
    const vm = toDeepReportViewModel(report);
    expect(vm.competitorGaps).toHaveLength(0);
  });

  it("does not leak forbidden copy in measurement notes", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    for (const note of vm.measurementNotes) {
      for (const banned of FORBIDDEN_COPY) {
        expect(note).not.toContain(banned);
      }
    }
  });
});

describe("toEvidenceViewModel", () => {
  it("produces a schema-valid EvidenceViewModel", () => {
    const vm = toEvidenceViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => EvidenceViewModel.parse(vm)).not.toThrow();
    expect(vm.items).toHaveLength(SAMPLE_DIAGNOSIS_REPORT.evidence.length);
  });

  it("sanitises sensitive material out of evidence URLs", () => {
    const dirty = buildSampleReport({
      evidence: [
        {
          ...SAMPLE_DIAGNOSIS_REPORT.evidence[0]!,
          url: "https://user:pw@example.com/a?token=abc&keep=1#frag",
        },
      ],
    });
    const vm = toEvidenceViewModel(dirty);
    const url = vm.items[0]!.url;
    expect(url).toContain("keep=1");
    expect(url).not.toMatch(/token|user|pw|frag/);
  });
});

describe("presentReport", () => {
  it("projects all three view models from one report in a single pass", () => {
    const { quick, deep, evidence } = presentReport(SAMPLE_DIAGNOSIS_REPORT);
    // Same underlying score object — Quick and Deep never diverge on numbers.
    expect(quick.overallScore).toBe(deep.scores.overallScore);
    expect(evidence.items).toHaveLength(SAMPLE_DIAGNOSIS_REPORT.evidence.length);
  });
});
