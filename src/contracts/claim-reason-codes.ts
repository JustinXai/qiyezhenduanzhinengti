// Round-5.1 §七 — why a candidate claim/opportunity/fix did NOT publish.
//
// The goal is diagnosis of content yield ("为什么机会没有产出"), never forcing
// output. Codes are recorded alongside the run (desensitized) — they are not
// customer-visible copy.

export type ClaimPruneReasonCode =
  | "NO_VALID_EVIDENCE"
  | "INVALID_EVIDENCE_REFERENCE"
  | "INVALID_SOURCE_ISSUE_REFERENCE"
  | "INSUFFICIENT_DIRECT_SUPPORT"
  | "INSUFFICIENT_INDEPENDENT_SUPPORT"
  | "FROZEN_SCOPE_PREFIX_MISSING"
  | "COVERAGE_NOT_ESTABLISHED"
  | "NO_MEASUREMENT_COVERAGE"
  | "MISSING_COVERAGE_PREFIX"
  | "DUPLICATED_EVIDENCE_SET"
  | "COMPETITOR_NOT_RESOLVED"
  | "GENERIC_OR_UNACTIONABLE"
  | "UNVERIFIED_COMPETITOR_ASSERTION"
  | "MISSING_COMPETITOR_OFFICIAL_RELATION"
  | "MISSING_CURRENT_COMPANY_RELATION"
  | "COMPETITOR_ENTITY_NOT_RESOLVED"
  | "COMPARISON_DIMENSION_MISMATCH"
  | "COMPETITOR_COVERAGE_NOT_ESTABLISHED"
  | "BANNED_OR_OVERPROMISING_COPY"
  | "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE";

export interface DroppedClaimRecord {
  /** Claim kind ("strength" | "coreIssue" | "geoOpportunity" | "competitorGap" | "demonstrationFix"). */
  kind: string;
  /** Stable identifier when one exists (claim id or statement head). */
  ref: string;
  reasonCode: ClaimPruneReasonCode;
}
