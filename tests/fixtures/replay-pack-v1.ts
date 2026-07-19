export const REPLAY_PACK_V1_CLASSIFICATIONS = [
  "P0_TRUTH_OR_SECURITY",
  "IMPLEMENTATION_BUG",
  "PROVIDER_FAILURE",
  "DATA_SPARSE",
  "PRODUCT_ENHANCEMENT",
] as const;

export type ReplayPackV1Classification =
  (typeof REPLAY_PACK_V1_CLASSIFICATIONS)[number];

export interface ReplayPackV1Case {
  id: string;
  round: "Round-5.2" | "Round-5.2B" | "Round-5.2C" | "Round-6" | "Round-6A";
  classification: ReplayPackV1Classification;
  component:
    | "CANDIDATE_SOURCE_RESOLVER_V1"
    | "CLAIM_PUBLICATION_POLICY_V1"
    | "COMPETITOR_GAP_PUBLICATION_POLICY_V1"
    | "REPORT_REVISION_LEDGER";
  blocking: boolean;
  expected:
    | {
        kind: "RESOLVER_REJECTION";
        code:
          | "CANDIDATE_SOURCE_NOT_FOUND"
          | "CANDIDATE_SOURCE_INVALID"
          | "CANDIDATE_SOURCE_STORAGE_UNAVAILABLE";
      }
    | {
        kind: "POLICY_DECISION";
        outcome: "PRUNE" | "DEEP_NEEDS_CONFIRMATION" | "BLOCK";
        reason: string;
      }
    | {
        kind: "LEDGER_COMPLETENESS";
        requiresOneFinalDecisionPerCandidate: true;
      };
}

export const ROUND6A_UNIFIED_REPLAY_PACK_V1: ReplayPackV1Case[] = [
  {
    id: "round5_2_claims_schema_recovery_invalid_legacy_candidate_source",
    round: "Round-5.2",
    classification: "IMPLEMENTATION_BUG",
    component: "CANDIDATE_SOURCE_RESOLVER_V1",
    blocking: true,
    expected: {
      kind: "RESOLVER_REJECTION",
      code: "CANDIDATE_SOURCE_INVALID",
    },
  },
  {
    id: "round5_2c_frozen_evidence_missing_negative_scope_prefix",
    round: "Round-5.2C",
    classification: "P0_TRUTH_OR_SECURITY",
    component: "CLAIM_PUBLICATION_POLICY_V1",
    blocking: true,
    expected: {
      kind: "POLICY_DECISION",
      outcome: "PRUNE",
      reason: "SCOPE_LIMITATION_MISSING",
    },
  },
  {
    id: "round6_qiaqia_competitor_gap_without_official_relation",
    round: "Round-6",
    classification: "P0_TRUTH_OR_SECURITY",
    component: "COMPETITOR_GAP_PUBLICATION_POLICY_V1",
    blocking: true,
    expected: {
      kind: "POLICY_DECISION",
      outcome: "PRUNE",
      reason: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    },
  },
  {
    id: "round6a_final_candidate_ledger_must_be_complete",
    round: "Round-6A",
    classification: "IMPLEMENTATION_BUG",
    component: "REPORT_REVISION_LEDGER",
    blocking: true,
    expected: {
      kind: "LEDGER_COMPLETENESS",
      requiresOneFinalDecisionPerCandidate: true,
    },
  },
];
