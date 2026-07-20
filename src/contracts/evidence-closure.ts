import { z } from "zod";

export const EvidenceRequirementSlotType = z.enum([
  "CURRENT_COMPANY_DIRECT_FACT",
  "CURRENT_COMPANY_COVERAGE",
  "INDEPENDENT_THIRD_PARTY_SUPPORT",
  "COMPETITOR_OFFICIAL_FACT",
  "COMPARABLE_DIMENSION_EVIDENCE",
  "CUSTOMER_INTERNAL_CONFIRMATION",
  "CUSTOMER_DOCUMENT_REQUIRED",
]);
export type EvidenceRequirementSlotType = z.infer<typeof EvidenceRequirementSlotType>;

export const NextBestEvidenceActionType = z.enum([
  "TARGETED_WEB_SEARCH",
  "TARGETED_OFFICIAL_CRAWL",
  "REQUEST_CUSTOMER_CONFIRMATION",
  "REQUEST_CUSTOMER_DOCUMENT",
  "KEEP_AS_NEEDS_CONFIRMATION",
  "PRUNE_PERMANENTLY",
]);
export type NextBestEvidenceActionType = z.infer<typeof NextBestEvidenceActionType>;

export const ClosureRequiredSourceType = z.enum([
  "CURRENT_COMPANY_OFFICIAL",
  "INDEPENDENT_THIRD_PARTY",
  "COMPETITOR_OFFICIAL",
  "CUSTOMER_ATTESTATION",
  "CUSTOMER_DOCUMENT",
]);
export type ClosureRequiredSourceType = z.infer<typeof ClosureRequiredSourceType>;

export const EvidenceRequirementSlot = z.object({
  id: z.string().min(1),
  candidateRef: z.string().min(1),
  claimKind: z.string().min(1),
  slotType: EvidenceRequirementSlotType,
  missingRequirement: z.string().min(1),
  currentlyAvailableEvidenceIds: z.array(z.string().min(1)),
  requiredSourceType: ClosureRequiredSourceType,
  requiredIndependentSourceCount: z.number().int().min(0).max(2),
  suggestedQueryIntent: z.string().nullable(),
  suggestedOfficialPageType: z.string().nullable(),
  customerQuestion: z.string().min(1),
  completionCondition: z.string().min(1),
  cannotBeClosedReason: z.string().nullable(),
});
export type EvidenceRequirementSlot = z.infer<typeof EvidenceRequirementSlot>;

export const NextBestEvidenceAction = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  candidateRef: z.string().min(1),
  action: NextBestEvidenceActionType,
  rationale: z.string().min(1),
  priority: z.number().int().min(1).max(6),
  executesAutomatically: z.literal(false),
  mayPublishClaim: z.literal(false),
  mayUpgradeSupport: z.literal(false),
});
export type NextBestEvidenceAction = z.infer<typeof NextBestEvidenceAction>;

export const EvidenceClosureBudgetV1 = z.object({
  maxCandidates: z.literal(3),
  maxSlotsPerCandidate: z.literal(2),
  maxTargetedQueries: z.literal(4),
  maxTargetedCrawls: z.literal(4),
  maxClosureRounds: z.literal(1),
  retries: z.literal(0),
});
export type EvidenceClosureBudgetV1 = z.infer<typeof EvidenceClosureBudgetV1>;

export const EVIDENCE_CLOSURE_BUDGET_V1: EvidenceClosureBudgetV1 = Object.freeze({
  maxCandidates: 3,
  maxSlotsPerCandidate: 2,
  maxTargetedQueries: 4,
  maxTargetedCrawls: 4,
  maxClosureRounds: 1,
  retries: 0,
});

export const EvidenceClosurePlanV1 = z.object({
  version: z.literal("evidence-closure-plan.v1"),
  diagnosisId: z.string().min(1),
  companyKey: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("PLANNED_NOT_EXECUTED"),
  featureEnabled: z.literal(false),
  sourceCandidateCount: z.number().int().min(0),
  selectedCandidateRefs: z.array(z.string().min(1)).max(3),
  slots: z.array(EvidenceRequirementSlot).max(6),
  nextActions: z.array(NextBestEvidenceAction).max(6),
  budget: EvidenceClosureBudgetV1,
  noPlanReason: z.enum(["NO_PRUNED_CANDIDATES", "NO_ELIGIBLE_CANDIDATES"]).nullable(),
});
export type EvidenceClosurePlanV1 = z.infer<typeof EvidenceClosurePlanV1>;

export const CustomerEvidenceMaterialType = z.enum([
  "PRODUCT_SPECIFICATION",
  "SERVICE_PROCESS",
  "CUSTOMER_CASE",
  "QUALIFICATION_CERTIFICATE",
  "AFTER_SALES_NETWORK",
  "FAQ",
  "PROCUREMENT_OR_PARTNERSHIP_GUIDE",
  "INTERNAL_BRAND_POSITIONING",
  "VERBAL_CONFIRMATION",
]);
export type CustomerEvidenceMaterialType = z.infer<typeof CustomerEvidenceMaterialType>;

const PROHIBITED_REQUEST_PATTERN =
  /(?:api\s*key|密码|口令|客户个人数据|个人身份信息|未脱敏合同|财务机密|无关内部文件)/iu;

export const CustomerEvidenceRequestItemV1 = z
  .object({
    id: z.string().min(1),
    candidateRef: z.string().min(1),
    slotId: z.string().min(1),
    factToConfirm: z.string().min(1),
    suggestedMaterial: CustomerEvidenceMaterialType,
    validates: z.string().min(1),
    customerQuestion: z.string().min(1),
    potentialGeoOpportunity: z.string().min(1),
    containsSensitiveMaterial: z.boolean(),
    verbalConfirmationAllowed: z.boolean(),
    requiresApprovalBeforePublication: z.literal(true),
    prohibitedContentReminder: z.string().min(1),
  })
  .superRefine((request, context) => {
    const requestedContent = [
      request.factToConfirm,
      request.validates,
      request.customerQuestion,
      request.potentialGeoOpportunity,
    ].join("\n");
    if (PROHIBITED_REQUEST_PATTERN.test(requestedContent)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CUSTOMER_EVIDENCE_REQUEST_CONTAINS_PROHIBITED_CONTENT",
        path: ["factToConfirm"],
      });
    }
  });
export type CustomerEvidenceRequestItemV1 = z.infer<typeof CustomerEvidenceRequestItemV1>;

export const CustomerEvidenceRequestPackV1 = z.object({
  version: z.literal("customer-evidence-request-pack.v1"),
  diagnosisId: z.string().min(1),
  companyKey: z.string().min(1),
  generatedAt: z.string().datetime(),
  phase: z.literal("POST_REPORT_ENRICHMENT"),
  visibleInFreeQuickReport: z.literal(false),
  featureEnabled: z.literal(false),
  requests: z.array(CustomerEvidenceRequestItemV1).max(5),
});
export type CustomerEvidenceRequestPackV1 = z.infer<typeof CustomerEvidenceRequestPackV1>;

export const EnrichmentContributionV1 = z.object({
  id: z.string().min(1),
  requestItemId: z.string().min(1),
  sourceKind: z.enum(["CUSTOMER_CONFIRMATION", "CUSTOMER_DOCUMENT"]),
  sourceLabel: z.string().min(1),
  receivedAt: z.string().datetime().nullable(),
  confirmationStatus: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  evidenceEvaluationStatus: z.enum(["NOT_EVALUATED", "VERIFIED", "REJECTED"]),
  supportLevel: z.enum(["UNASSIGNED", "DIRECT_SUPPORT", "PARTIAL_SUPPORT", "CONTEXT_ONLY"]),
  verifierApprovalId: z.string().nullable(),
});
export type EnrichmentContributionV1 = z.infer<typeof EnrichmentContributionV1>;

export const DiagnosisEnrichmentSession = z
  .object({
    version: z.literal("diagnosis-enrichment-session.v1"),
    id: z.string().min(1),
    diagnosisId: z.string().min(1),
    baseReportId: z.string().min(1),
    baseCanonicalHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sequence: z.number().int().positive(),
    createdAt: z.string().datetime(),
    status: z.enum(["REQUESTED", "MATERIAL_RECEIVED", "UNDER_REVIEW", "CLOSED"]),
    appendOnly: z.literal(true),
    canonicalMutationAllowed: z.literal(false),
    contributions: z.array(EnrichmentContributionV1),
  })
  .superRefine((session, context) => {
    for (const contribution of session.contributions) {
      if (
        contribution.confirmationStatus === "CONFIRMED" &&
        contribution.supportLevel === "DIRECT_SUPPORT" &&
        (contribution.evidenceEvaluationStatus !== "VERIFIED" ||
          contribution.verifierApprovalId === null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CUSTOMER_CONFIRMATION_CANNOT_AUTO_BECOME_DIRECT_SUPPORT",
          path: ["contributions", contribution.id, "supportLevel"],
        });
      }
      if (
        contribution.evidenceEvaluationStatus === "NOT_EVALUATED" &&
        contribution.supportLevel !== "UNASSIGNED"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNEVALUATED_CONTRIBUTION_MUST_HAVE_UNASSIGNED_SUPPORT",
          path: ["contributions", contribution.id, "supportLevel"],
        });
      }
    }
  });
export type DiagnosisEnrichmentSession = z.infer<typeof DiagnosisEnrichmentSession>;

/** Frozen off in Round-6B. There is intentionally no URL/form parser or runtime seam. */
export const ROUND_6B_EVIDENCE_FEATURE_FLAGS = Object.freeze({
  EVIDENCE_CLOSURE_ENABLED: false,
  CUSTOMER_EVIDENCE_ENRICHMENT_ENABLED: false,
} as const);
