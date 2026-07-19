// ============================================================================
// Public surface of the report-validation module (Agent B).
// Other agents import calculators + guards from here.
// ============================================================================

export {
  computeScoreBlock,
  SCORE_COVERAGE_THRESHOLD,
  type ScoreComputation,
  type ScoreDimensionMap,
} from "./score-calculator";

export {
  computeAIVisibility,
  MIN_VALID_AI_TESTS,
  INSUFFICIENT_CONFIDENCE_CAP,
  type AIVisibilityComputation,
} from "./ai-visibility-calculator";

export {
  evidenceGuard,
  DUPLICATE_OPPORTUNITY_THRESHOLD,
  type EvidenceGuardInput,
} from "./evidence-guard";

export {
  crossFieldGuard,
  viewModelEvidenceGuard,
  type ReportViewModels,
} from "./cross-field-guard";

export {
  chinesePublicReportGuard,
  type ChineseGuardResult,
  type ChineseGuardViolation,
} from "./chinese-public-report-guard";

export {
  chineseConversionReview,
  type ReviewCheck,
} from "./chinese-conversion-review";

export {
  ctaGuard,
  countQuickVisibleChars,
  BANNED_PHRASES,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
  QUICK_CHARACTER_BUDGET,
  type CtaGuardInput,
} from "./cta-guard";

export { publishGuard, type PublishGuardInput } from "./publish-guard";

export {
  pruneUnsupportedClaims,
  type PruneResult,
  type PruneUnsupportedClaimsOptions,
} from "./prune-claims";

export {
  CompetitorGapPublicationPolicyV1,
  COMPETITOR_GAP_PUBLICATION_POLICY_VERSION,
  FAIL_CLOSED_COMPETITOR_GAP_METADATA,
  evaluateCompetitorGapPublication,
  type CompetitorGapPublicationCandidate,
  type CompetitorGapPublicationContextById,
  type CompetitorGapPublicationDecision,
  type CompetitorGapPublicationMetadata,
  type CompetitorGapPublicationOutcome,
  type CompetitorGapPublicationPolicyInput,
  type CompetitorGapPublicationReason,
  type CompetitorNameSource,
} from "./competitor-gap-publication-policy";

export {
  ClaimPublicationPolicy,
  DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION,
  evaluateClaimPublication,
  publicationSourceContextFromReport,
  STANDARD_NEGATIVE_SCOPE_PHRASES,
  FROZEN_EVIDENCE_NEGATIVE_SCOPE_PHRASES,
  type ClaimPublicationCandidate,
  type ClaimPublicationCoverageScope,
  type ClaimPublicationCoverageStatus,
  type ClaimPublicationDecision,
  type ClaimPublicationOutcome,
  type ClaimPublicationPolicyInput,
  type ClaimPublicationRule,
} from "./claim-publication-policy";

export {
  countIndependentSupportSources,
  independentSupportSourceKeys,
  registrableDomain,
  resolveIndependentSupportSourceKey,
} from "./independent-support-source";

export type {
  ClaimPublicationSourceContext,
  IndependentSupportSourceKey,
  ResolvedCompetitorSupportEntity,
} from "../../contracts/independent-support-source";

// Re-export the shared guard result plumbing for convenience.
export {
  combineGuardResults,
  type GuardName,
  type GuardResult,
  type GuardRuleCode,
  type GuardViolation,
} from "../../contracts/guard-types";
