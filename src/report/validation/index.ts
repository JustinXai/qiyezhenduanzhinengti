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
  ctaGuard,
  countQuickVisibleChars,
  BANNED_PHRASES,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
  QUICK_CHARACTER_BUDGET,
  type CtaGuardInput,
} from "./cta-guard";

export { publishGuard, type PublishGuardInput } from "./publish-guard";

// Re-export the shared guard result plumbing for convenience.
export {
  combineGuardResults,
  type GuardName,
  type GuardResult,
  type GuardRuleCode,
  type GuardViolation,
} from "../../contracts/guard-types";
