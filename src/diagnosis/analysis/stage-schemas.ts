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
});
export const CompetitorGapStageItem = z.object({
  competitorName: z.string(),
  gapStatement: z.string(),
  evidenceIds: z.array(z.string()),
});
export const DemonstrationFixStageItem = z.object({
  fixType: DemonstrationFixType,
  currentIssue: z.string(),
  suggestedAssetType: z.string(),
  before: z.string(),
  after: z.string(),
  whyBetter: z.string(),
  customerConfirmationNeeded: z.string(),
  geoTeamDeliverable: z.string(),
  evidenceIds: z.array(z.string()),
  // NOTE: any `disclaimer` DeepSeek emits is ignored; we stamp the frozen literal.
});

export const ClaimsStageOutput = z.object({
  strengths: z.array(StrengthStageItem),
  coreIssues: z.array(CoreIssueStageItem),
  geoOpportunities: z.array(GeoOpportunityStageItem),
  competitorGaps: z.array(CompetitorGapStageItem),
  demonstrationFix: DemonstrationFixStageItem.nullable(),
});
export type ClaimsStageOutput = z.infer<typeof ClaimsStageOutput>;
