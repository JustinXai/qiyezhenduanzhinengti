// Zod schemas for each DeepSeek analysis-stage payload.
//
// DeepSeek is used to interpret evidence into DISCRETE, structured signals
// (present/partial/absent ratings, claim statements, self-classified answer
// quality). It never emits numeric dimension scores or AI-visibility percentages —
// those are computed programmatically downstream (docs/PRODUCT_TRUTH_RULES.md §8,
// docs/SCORE_CONTRACT.md). Enum reuse from src/contracts keeps the LLM output wire
// aligned with the canonical report shapes.

import { z } from "zod";
import {
  AIVisibilityAccuracy,
  AIVisibilityQuestionCategory,
  AIVisibilityRecommendationStrength,
  ClaimType,
  DemonstrationFixType,
} from "../../contracts";
import {
  APPROVED_NEGATIVE_OPPORTUNITY_PREFIX,
  OPPORTUNITY_BANNED_PHRASES,
} from "./opportunity-copy-policy";

// ---------------------------------------------------------------------------
// Stage: company_profile
// ---------------------------------------------------------------------------

export const CompanyProfileStageOutput = z.object({
  brandName: z.string(),
  industry: z.string(),
  productOrService: z.string(),
  targetRegion: z.string(),
  competitors: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
});
export type CompanyProfileStageOutput = z.infer<typeof CompanyProfileStageOutput>;

// ---------------------------------------------------------------------------
// Stage: dimension_signals (four non-AI dimensions)
// ---------------------------------------------------------------------------

export const CriterionRating = z.enum(["PRESENT", "PARTIAL", "ABSENT"]);
export type CriterionRating = z.infer<typeof CriterionRating>;

export const DimensionSignal = z.object({
  criteria: z.array(z.object({ key: z.string(), rating: CriterionRating })),
  evidenceIds: z.array(z.string()),
});
export type DimensionSignal = z.infer<typeof DimensionSignal>;

export const DimensionSignalsStageOutput = z.object({
  companyClarity: DimensionSignal,
  websiteCompleteness: DimensionSignal,
  customerQuestionCoverage: DimensionSignal,
  trustEvidence: DimensionSignal,
});
export type DimensionSignalsStageOutput = z.infer<typeof DimensionSignalsStageOutput>;

// ---------------------------------------------------------------------------
// Stage: ai_visibility (raw per-question probe results)
// ---------------------------------------------------------------------------

export const AiVisibilityProbe = z.object({
  id: z.string(),
  questionCategory: AIVisibilityQuestionCategory,
  question: z.string(),
  answerText: z.string(),
  providerFailed: z.boolean().optional(),
  // Model self-classification; only consumed when the brand is actually mentioned.
  accuracy: AIVisibilityAccuracy.optional(),
  recommendationStrength: AIVisibilityRecommendationStrength.optional(),
  evidenceIds: z.array(z.string()),
});
export type AiVisibilityProbe = z.infer<typeof AiVisibilityProbe>;

export const AiVisibilityStageOutput = z.object({
  tests: z.array(AiVisibilityProbe),
});
export type AiVisibilityStageOutput = z.infer<typeof AiVisibilityStageOutput>;

// ---------------------------------------------------------------------------
// Stage: claims (strengths / core issues / opportunities / competitor gaps / demo fix)
// ---------------------------------------------------------------------------

const ClaimStageBase = z.object({
  statement: z.string(),
  businessImpact: z.string(),
  claimType: ClaimType,
  evidenceIds: z.array(z.string()),
});

export const StrengthStageItem = ClaimStageBase;
export const CoreIssueStageItem = ClaimStageBase.extend({ fixDirection: z.string() });
export const GeoOpportunityStageItem = ClaimStageBase.extend({
  customerQuestion: z.string(),
  contentGap: z.string(),
  /**
   * Round-5.1 §七: the published issue this opportunity answers. Optional in the
   * wire schema (older mocks/checkpoints), but when present it MUST resolve to a
   * built core issue or the opportunity is dropped (INVALID_EVIDENCE_REFERENCE).
   */
  sourceIssueId: z.string().optional(),
  /** §八 lineage: concrete GEO-implementable action (not "多发内容"). */
  recommendedAction: z.string().optional(),
  /** §八 lineage: why this is the FIRST thing to do. */
  priorityReason: z.string().optional(),
});

/**
 * Candidate-level publication schema. The outer stage remains parseable so a
 * rejected candidate can be audited instead of erasing generation-quality data.
 */
export const PublishableGeoOpportunityStageItem = GeoOpportunityStageItem.superRefine(
  (item, ctx) => {
    const text = [
      item.statement,
      item.businessImpact,
      item.customerQuestion,
      item.contentGap,
      item.recommendedAction,
      item.priorityReason,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .replace(/\s+/g, "");
    if (OPPORTUNITY_BANNED_PHRASES.some((phrase) => text.includes(phrase))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "opportunity contains banned copy" });
    }
    if (/缺少|缺乏|缺失|未提供|未覆盖|未明确|未说明|未展示|未发现|不足|无系统|无结构/u.test(item.contentGap) &&
      !item.contentGap.trim().startsWith(APPROVED_NEGATIVE_OPPORTUNITY_PREFIX)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentGap"],
        message: `negative opportunity contentGap must start with ${APPROVED_NEGATIVE_OPPORTUNITY_PREFIX}`,
      });
    }
  },
);
export const CompetitorGapStageItem = z.object({
  competitorName: z.string(),
  gapStatement: z.string(),
  evidenceIds: z.array(z.string()),
});

const NonEmptyCandidateText = z.string().trim().min(1);

/**
 * Internal-only model proposal for a demonstration fix.
 *
 * The public DemonstrationFix contract remains Supervisor-owned and unchanged.
 * In particular, the model is not trusted to write `currentIssue` or the frozen
 * `disclaimer`; both are added deterministically after sourceIssueId resolution.
 */
export const CandidateDemonstrationFix = z
  .object({
    sourceIssueId: NonEmptyCandidateText,
    assetType: DemonstrationFixType,
    beforeStructure: NonEmptyCandidateText,
    afterStructure: NonEmptyCandidateText,
    whyBetter: NonEmptyCandidateText,
    confirmationNeeded: NonEmptyCandidateText,
    deliverable: NonEmptyCandidateText,
    evidenceIds: z
      .array(NonEmptyCandidateText)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "evidenceIds must be unique"),
  })
  .strict();
export type CandidateDemonstrationFix = z.infer<typeof CandidateDemonstrationFix>;

export const ClaimsStageOutput = z.object({
  strengths: z.array(StrengthStageItem),
  coreIssues: z.array(CoreIssueStageItem),
  geoOpportunities: z.array(GeoOpportunityStageItem),
  competitorGaps: z.array(CompetitorGapStageItem),
  // Required and exact: null or one complete strict Candidate. No partial object.
  demonstrationFix: CandidateDemonstrationFix.nullable(),
});
export type ClaimsStageOutput = z.infer<typeof ClaimsStageOutput>;
