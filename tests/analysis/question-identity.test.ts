// ============================================================================
// Round-7.1A: Question Identity Tests
// 验证 QuestionCoverageAssessment 和 QuestionCoverageGap 的身份保留
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  generateQuestionId,
} from "../../src/runtime/diagnosis-input";
import {
  buildAssessmentsFromCustomerQuestions,
  buildQuestionCoverageGapsFromAssessments,
} from "../../src/diagnosis/analysis/dimension-scoring";
import type { EvidenceItem } from "../../src/contracts";

// Mock evidence for testing
const mockEvidence: EvidenceItem[] = [
  {
    id: "ev_1",
    title: "官网首页",
    sourceDomain: "example.com",
    sourceType: "FIRST_PARTY_EVIDENCE",
    authorityLevel: "OWNED",
    supportLevel: "CONTEXT_ONLY",
    fetchedAt: "2026-07-20T00:00:00.000Z",
    snippet: "官网首页介绍",
    url: "https://example.com",
    language: "zh",
    sourceTier: "A",
    normalizedDomain: "example.com",
    dedupeKey: "example.com::官网首页",
  },
];

// Mock dimension signals with PARTIAL/ABSENT ratings
const mockDimensionSignalsPartial = {
  companyClarity: { criteria: [{ key: "brandIdentityClear", rating: "PRESENT" }], evidenceIds: ["ev_1"] },
  websiteCompleteness: { criteria: [{ key: "productInfo", rating: "PRESENT" }], evidenceIds: ["ev_1"] },
  customerQuestionCoverage: {
    criteria: [
      { key: "purchaseDecisionQuestions", rating: "PARTIAL" },
      { key: "comparisonQuestions", rating: "ABSENT" },
      { key: "deliveryAndAfterSales", rating: "PARTIAL" },
      { key: "structuredFaq", rating: "ABSENT" },
    ],
    evidenceIds: ["ev_1"],
  },
  trustEvidence: { criteria: [{ key: "thirdPartyCredentials", rating: "ABSENT" }], evidenceIds: ["ev_1"] },
};

const mockDimensionSignalsAllPresent = {
  ...mockDimensionSignalsPartial,
  customerQuestionCoverage: {
    criteria: [
      { key: "purchaseDecisionQuestions", rating: "PRESENT" },
      { key: "comparisonQuestions", rating: "PRESENT" },
      { key: "deliveryAndAfterSales", rating: "PRESENT" },
      { key: "structuredFaq", rating: "PRESENT" },
    ],
    evidenceIds: ["ev_1"],
  },
};

describe("Question Identity Tests", () => {
  describe("generateQuestionId", () => {
    it("generates stable IDs for the same inputs", () => {
      const id1 = generateQuestionId("diag_123", "如何采购合适的供应商产品", 0);
      const id2 = generateQuestionId("diag_123", "如何采购合适的供应商产品", 0);
      expect(id1).toBe(id2);
    });

    it("generates different IDs for different questions", () => {
      const id1 = generateQuestionId("diag_123", "如何采购合适的供应商产品", 0);
      const id2 = generateQuestionId("diag_123", "产品交付周期是多久", 1);
      expect(id1).not.toBe(id2);
    });

    it("generates different IDs for same question in different diagnoses", () => {
      const id1 = generateQuestionId("diag_123", "如何采购合适的供应商产品", 0);
      const id2 = generateQuestionId("diag_456", "如何采购合适的供应商产品", 0);
      expect(id1).not.toBe(id2);
    });

    it("normalizes whitespace when generating IDs", () => {
      // Input with leading/trailing whitespace and multiple internal spaces
      const id1 = generateQuestionId("diag_123", "  如何采购合适的供应商产品  ", 0);
      const id2 = generateQuestionId("diag_123", "  如何   采购合适的  供应商产品  ", 0);
      // After normalization, both should produce the same hash
      expect(id1).toBe(id2);
    });
  });

  describe("buildAssessmentsFromCustomerQuestions", () => {
    it("preserves original questionId from input", () => {
      const customerQuestions = [
        { questionId: "q_custom_1", questionText: "如何采购合适的供应商产品" },
        { questionId: "q_custom_2", questionText: "产品交付周期是多久" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.questionId).toBe("q_custom_1");
      expect(result.value[1]?.questionId).toBe("q_custom_2");
    });

    it("preserves original questionText from input", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "如何采购合适的供应商产品" },
        { questionId: "q_2", questionText: "产品交付周期是多久" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.questionText).toBe("如何采购合适的供应商产品");
      expect(result.value[1]?.questionText).toBe("产品交付周期是多久");
    });

    it("maps purchase-related questions to purchaseDecisionQuestions criterion", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "如何采购合适的供应商产品" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.matchedCriterionKey).toBe("purchaseDecisionQuestions");
    });

    it("maps comparison questions to comparisonQuestions criterion", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "贵司与主要竞争对手相比有什么优势" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.matchedCriterionKey).toBe("comparisonQuestions");
    });

    it("sets UNANSWERED status when no matching criterion", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "贵公司成立于哪一年" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.matchedCriterionKey).toBeNull();
      expect(result.value[0]?.status).toBe("UNANSWERED");
    });

    it("returns empty evidenceIds when no matching criterion", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "贵公司成立于哪一年" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.evidenceIds).toEqual([]);
    });

    it("preserves FULLY_SUPPORTED status for PRESENT rating", () => {
      const customerQuestions = [
        { questionId: "q_1", questionText: "如何采购合适的供应商产品" },
      ];

      const result = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsAllPresent,
        customerQuestions,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value[0]?.status).toBe("FULLY_SUPPORTED");
    });
  });

  describe("buildQuestionCoverageGapsFromAssessments", () => {
    it("generates one gap per PARTIALLY_SUPPORTED assessment", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "如何采购合适的供应商产品",
          matchedCriterionKey: "purchaseDecisionQuestions",
          status: "PARTIALLY_SUPPORTED" as const,
          evidenceIds: ["ev_1"],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.questionId).toBe("q_1");
      expect(gaps[0]?.questionText).toBe("如何采购合适的供应商产品");
    });

    it("generates one gap per UNANSWERED assessment", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "贵公司成立于哪一年",
          matchedCriterionKey: null,
          status: "UNANSWERED" as const,
          evidenceIds: [],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.questionId).toBe("q_1");
      expect(gaps[0]?.coverageStatus).toBe("UNANSWERED");
    });

    it("skips FULLY_SUPPORTED assessments", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "如何采购合适的供应商产品",
          matchedCriterionKey: "purchaseDecisionQuestions",
          status: "FULLY_SUPPORTED" as const,
          evidenceIds: ["ev_1"],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps).toHaveLength(0);
    });

    it("uses template for matched criterion", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "如何采购合适的供应商产品",
          matchedCriterionKey: "purchaseDecisionQuestions",
          status: "PARTIALLY_SUPPORTED" as const,
          evidenceIds: ["ev_1"],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps[0]?.observedScope).toContain("采购决策问题");
      expect(gaps[0]?.suggestedAction).toContain("FAQ");
    });

    it("uses default template for unmatched criterion", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "贵公司成立于哪一年",
          matchedCriterionKey: null,
          status: "UNANSWERED" as const,
          evidenceIds: [],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps[0]?.observedScope).toContain("本次已检查的公开页面");
      expect(gaps[0]?.suggestedAction).toContain("补充相关公开信息");
    });

    it("each gap preserves evidenceIds from assessment", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "如何采购合适的供应商产品",
          matchedCriterionKey: "purchaseDecisionQuestions",
          status: "PARTIALLY_SUPPORTED" as const,
          evidenceIds: ["ev_1", "ev_2"],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps[0]?.evidenceIds).toEqual(["ev_1", "ev_2"]);
    });

    it("one assessment generates at most one gap", () => {
      const assessments = [
        {
          questionId: "q_1",
          questionText: "如何采购合适的供应商产品",
          matchedCriterionKey: "purchaseDecisionQuestions",
          status: "PARTIALLY_SUPPORTED" as const,
          evidenceIds: ["ev_1"],
        },
      ];

      const gaps = buildQuestionCoverageGapsFromAssessments(assessments);

      expect(gaps.filter((g) => g.questionId === "q_1")).toHaveLength(1);
    });
  });

  describe("End-to-end: question identity preservation", () => {
    it("full flow: customer questions -> assessments -> gaps", () => {
      const customerQuestions = [
        { questionId: "q_custom_1", questionText: "如何采购合适的供应商产品" },
        { questionId: "q_custom_2", questionText: "产品交付周期是多久" },
        { questionId: "q_custom_3", questionText: "贵公司有哪些成功案例" },
        { questionId: "q_custom_4", questionText: "贵公司成立于哪一年" },
      ];

      // Step 1: Build assessments
      const assessmentsResult = buildAssessmentsFromCustomerQuestions(
        mockEvidence,
        mockDimensionSignalsPartial,
        customerQuestions,
      );
      expect(assessmentsResult.ok).toBe(true);
      if (!assessmentsResult.ok) return;

      // Verify assessment count matches question count
      expect(assessmentsResult.value).toHaveLength(4);

      // Verify original IDs preserved
      expect(assessmentsResult.value.map((a) => a.questionId)).toEqual([
        "q_custom_1",
        "q_custom_2",
        "q_custom_3",
        "q_custom_4",
      ]);

      // Verify original texts preserved
      expect(assessmentsResult.value.map((a) => a.questionText)).toEqual([
        "如何采购合适的供应商产品",
        "产品交付周期是多久",
        "贵公司有哪些成功案例",
        "贵公司成立于哪一年",
      ]);

      // Step 2: Build gaps
      const gaps = buildQuestionCoverageGapsFromAssessments(assessmentsResult.value);

      // Only PARTIALLY_SUPPORTED and UNANSWERED generate gaps
      // purchaseDecisionQuestions: PARTIAL -> gap
      // comparisonQuestions: ABSENT -> gap (no matching question)
      // deliveryAndAfterSales: PARTIAL -> gap (no matching question)
      // structuredFaq: ABSENT -> gap (case question matches)
      expect(gaps.length).toBeGreaterThanOrEqual(1);

      // Verify gap preserves original questionId
      expect(gaps.every((g) => customerQuestions.some((q) => q.questionId === g.questionId))).toBe(true);
    });
  });
});
