import { describe, expect, it } from "vitest";
import {
  CustomerEvidenceRequestPackV1,
  DiagnosisEnrichmentSession,
  EVIDENCE_CLOSURE_BUDGET_V1,
  ROUND_6B_EVIDENCE_FEATURE_FLAGS,
} from "../../src/contracts/evidence-closure";

describe("Round-6B evidence closure contracts", () => {
  it("freezes both features off and keeps the bounded future budget", () => {
    expect(ROUND_6B_EVIDENCE_FEATURE_FLAGS).toEqual({
      EVIDENCE_CLOSURE_ENABLED: false,
      CUSTOMER_EVIDENCE_ENRICHMENT_ENABLED: false,
    });
    expect(EVIDENCE_CLOSURE_BUDGET_V1).toEqual({
      maxCandidates: 3,
      maxSlotsPerCandidate: 2,
      maxTargetedQueries: 4,
      maxTargetedCrawls: 4,
      maxClosureRounds: 1,
      retries: 0,
    });
  });

  it("rejects treating a customer confirmation as DIRECT without verification and approval", () => {
    const result = DiagnosisEnrichmentSession.safeParse({
      version: "diagnosis-enrichment-session.v1",
      id: "enrich_1",
      diagnosisId: "diag_1",
      baseReportId: "report_1",
      baseCanonicalHash: "a".repeat(64),
      sequence: 1,
      createdAt: "2026-07-20T00:00:00.000Z",
      status: "MATERIAL_RECEIVED",
      appendOnly: true,
      canonicalMutationAllowed: false,
      contributions: [
        {
          id: "contribution_1",
          requestItemId: "request_1",
          sourceKind: "CUSTOMER_CONFIRMATION",
          sourceLabel: "客户口头确认",
          receivedAt: "2026-07-20T00:00:00.000Z",
          confirmationStatus: "CONFIRMED",
          evidenceEvaluationStatus: "NOT_EVALUATED",
          supportLevel: "DIRECT_SUPPORT",
          verifierApprovalId: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows append-only pending enrichment with unassigned support", () => {
    expect(
      DiagnosisEnrichmentSession.parse({
        version: "diagnosis-enrichment-session.v1",
        id: "enrich_1",
        diagnosisId: "diag_1",
        baseReportId: "report_1",
        baseCanonicalHash: "b".repeat(64),
        sequence: 1,
        createdAt: "2026-07-20T00:00:00.000Z",
        status: "REQUESTED",
        appendOnly: true,
        canonicalMutationAllowed: false,
        contributions: [
          {
            id: "contribution_1",
            requestItemId: "request_1",
            sourceKind: "CUSTOMER_DOCUMENT",
            sourceLabel: "待提供产品参数表",
            receivedAt: null,
            confirmationStatus: "PENDING",
            evidenceEvaluationStatus: "NOT_EVALUATED",
            supportLevel: "UNASSIGNED",
            verifierApprovalId: null,
          },
        ],
      }).canonicalMutationAllowed,
    ).toBe(false);
  });

  it("caps customer requests at five and keeps them out of free Quick", () => {
    const result = CustomerEvidenceRequestPackV1.safeParse({
      version: "customer-evidence-request-pack.v1",
      diagnosisId: "diag_1",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      phase: "POST_REPORT_ENRICHMENT",
      visibleInFreeQuickReport: false,
      featureEnabled: false,
      requests: Array.from({ length: 6 }, (_, index) => ({
        id: `request_${index}`,
        candidateRef: "geo_1",
        slotId: `slot_${index}`,
        factToConfirm: "fact",
        suggestedMaterial: "FAQ",
        validates: "validates",
        customerQuestion: "question",
        potentialGeoOpportunity: "opportunity",
        containsSensitiveMaterial: false,
        verbalConfirmationAllowed: false,
        requiresApprovalBeforePublication: true,
        prohibitedContentReminder: "禁止敏感材料",
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a request for secrets or prohibited customer material", () => {
    const result = CustomerEvidenceRequestPackV1.safeParse({
      version: "customer-evidence-request-pack.v1",
      diagnosisId: "diag_1",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      phase: "POST_REPORT_ENRICHMENT",
      visibleInFreeQuickReport: false,
      featureEnabled: false,
      requests: [
        {
          id: "request_1",
          candidateRef: "geo_1",
          slotId: "slot_1",
          factToConfirm: "请提供 API Key",
          suggestedMaterial: "INTERNAL_BRAND_POSITIONING",
          validates: "测试",
          customerQuestion: "测试",
          potentialGeoOpportunity: "测试",
          containsSensitiveMaterial: true,
          verbalConfirmationAllowed: false,
          requiresApprovalBeforePublication: true,
          prohibitedContentReminder: "不得提供秘密",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
