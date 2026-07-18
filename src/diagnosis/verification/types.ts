// ============================================================================
// ClaimEvidenceVerifier seam types.
//
// A VerifierStrategy produces RAW per-pair verdicts (support level it *proposes*
// for a (Claim, Evidence) pair). Those raw verdicts ALWAYS pass through the
// shared deterministic clamp (clamp.ts) before becoming persisted relations, so:
//   - a MOCK deterministic strategy and a real DeepSeek strategy are gated by the
//     exact same source/polarity/coverage rules, and
//   - a model claiming DIRECT for something the deterministic preconditions
//     forbid is downgraded or rejected (职责 5, test 7), never trusted verbatim.
//
// The verifier NEVER: creates evidence, edits claims, returns URLs, decides CTA,
// decides scores, or bypasses the publish guard. It only judges support levels
// for pairs whose evidence ids already exist in the candidate set.
// ============================================================================

import type { EvidenceItem } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  ClaimKind,
  ClaimPolarity,
  EvidenceCoverage,
  VerifierMode,
} from "../../contracts/claim-evidence";
import type { ProviderUsageSample } from "../orchestration/state-machine";

/** A claim reduced to what the verifier needs (never mutated by the verifier). */
export interface VerifiableClaim {
  id: string;
  kind: ClaimKind;
  /** Concatenated descriptive text (statement + impact + gap/fix/question). */
  text: string;
  /** Candidate evidence ids cited by the claim (candidate ClaimEvidenceLinks). */
  candidateEvidenceIds: string[];
}

/** A raw, pre-clamp verdict a strategy proposes for one (claim, evidence) pair. */
export interface RawVerdict {
  evidenceId: string;
  supportLevel: ClaimEvidenceRelation["supportLevel"];
  confidence: number;
  justification: string;
}

export interface AssessPairsInput {
  claim: VerifiableClaim;
  polarity: ClaimPolarity;
  /** Candidate evidence items, already resolved from the id set. */
  candidates: EvidenceItem[];
  coverage: EvidenceCoverage;
}

export interface AssessPairsResult {
  verdicts: RawVerdict[];
  usage?: ProviderUsageSample[];
}

/** A pluggable verification strategy (deterministic mock or DeepSeek-backed). */
export interface VerifierStrategy {
  readonly mode: VerifierMode;
  readonly version: string;
  assess(input: AssessPairsInput): Promise<AssessPairsResult>;
}

export interface VerifyReportResult {
  ok: boolean;
  relations: ClaimEvidenceRelation[];
  usage: ProviderUsageSample[];
  /** Ids the strategy tried to reference that were not in the candidate set. */
  illegalEvidenceIds: string[];
}
