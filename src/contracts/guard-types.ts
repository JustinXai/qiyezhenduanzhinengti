// ============================================================================
// Shared guard result/violation types used by every publish-time guard
// (evidence-guard, cross-field-guard, cta-guard, publish-guard).
// Agent B owned (src/contracts/** except index.ts).
//
// These are intentionally NOT added to src/contracts/index.ts (Supervisor
// owned) — they are guard-internal plumbing, not canonical report shapes.
// Import them directly from "@/src/contracts/guard-types".
// ============================================================================

/** Which guard raised the violation. */
export type GuardName = "evidence" | "cross-field" | "cta" | "score" | "ai-visibility";

/**
 * Which frozen rule (docs/PRODUCT_TRUTH_RULES.md / docs/SCORE_CONTRACT.md /
 * docs/REPORT_CONTRACT.md) was violated. Kept as a string union of stable
 * machine-readable codes so callers/tests can assert on the rule without
 * parsing the human-readable message.
 */
export type GuardRuleCode =
  // Evidence Semantic Guard — docs/PRODUCT_TRUTH_RULES.md §4
  | "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT"
  | "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT"
  | "TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT"
  | "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT"
  | "TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED"
  | "TRUTH_4_6_EVIDENCE_ID_NOT_FOUND"
  | "TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET"
  // Competitor Gap Publication Policy V1
  | "COMPETITOR_GAP_UNVERIFIED_COMPETITOR_ASSERTION"
  | "COMPETITOR_GAP_MISSING_COMPETITOR_OFFICIAL_RELATION"
  | "COMPETITOR_GAP_MISSING_CURRENT_COMPANY_RELATION"
  | "COMPETITOR_GAP_COMPETITOR_ENTITY_NOT_RESOLVED"
  | "COMPETITOR_GAP_COMPARISON_DIMENSION_MISMATCH"
  | "COMPETITOR_GAP_COMPETITOR_COVERAGE_NOT_ESTABLISHED"
  // Cross-field guard
  | "CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND"
  | "CROSS_FIELD_SCORE_COVERAGE_MISMATCH"
  | "CROSS_FIELD_OVERALL_SCORE_MISMATCH"
  | "CROSS_FIELD_OVERALL_SCORE_NOT_NULL_BELOW_COVERAGE_THRESHOLD"
  | "CROSS_FIELD_DEMONSTRATION_FIX_WITHOUT_EVIDENCE"
  // CTA guard — docs/PRODUCT_TRUTH_RULES.md §9 / docs/REPORT_CONTRACT.md §8
  | "CTA_BANNED_PHRASE"
  | "CTA_PRIMARY_LABEL_MISMATCH"
  | "CTA_SECONDARY_LABEL_MISMATCH"
  | "CTA_QUICK_CHARACTER_BUDGET_EXCEEDED";

export interface GuardViolation {
  guard: GuardName;
  rule: GuardRuleCode;
  message: string;
  /** Which report entity the violation concerns, when applicable. */
  claimType?: "coreIssue" | "strength" | "geoOpportunity" | "competitorGap" | "demonstrationFix" | "aiVisibilityTest";
  claimId?: string;
  evidenceIds?: string[];
}

export type GuardResult = { ok: true } | { ok: false; violations: GuardViolation[] };

/** Merge any number of guard results into one aggregate result. */
export function combineGuardResults(...results: GuardResult[]): GuardResult {
  const violations = results.flatMap((r) => (r.ok ? [] : r.violations));
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
