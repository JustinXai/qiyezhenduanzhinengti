// Round-5.1 §七 — why a candidate claim/opportunity/fix did NOT publish.
//
// The goal is diagnosis of content yield ("为什么机会没有产出"), never forcing
// output. Codes are recorded alongside the run (desensitized) — they are not
// customer-visible copy.

export type ClaimPruneReasonCode =
  | "NO_VALID_EVIDENCE"
  | "INSUFFICIENT_INDEPENDENT_SUPPORT"
  | "INVALID_EVIDENCE_REFERENCE"
  | "DUPLICATED_EVIDENCE_SET"
  | "COMPETITOR_NOT_RESOLVED"
  | "COVERAGE_NOT_ESTABLISHED"
  | "GENERIC_OR_UNACTIONABLE"
  | "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE";

export interface DroppedClaimRecord {
  /** Claim kind ("strength" | "coreIssue" | "geoOpportunity" | "competitorGap" | "demonstrationFix"). */
  kind: string;
  /** Stable identifier when one exists (claim id or statement head). */
  ref: string;
  reasonCode: ClaimPruneReasonCode;
}
