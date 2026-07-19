import type { DiagnosisReport } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  ClaimKind,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type {
  ClaimPublicationSourceContext,
  IndependentSupportSourceKey,
} from "../../contracts/independent-support-source";
import { classifyPolarity } from "../../diagnosis/verification";
import { independentSupportSourceKeys } from "./independent-support-source";

export const DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION =
  "claim-publication-policy.v1" as const;

export type ClaimPublicationCoverageScope = "STANDARD" | "FROZEN_EVIDENCE";

export type ClaimPublicationCoverageStatus =
  | "NOT_REQUIRED"
  | "ESTABLISHED_AND_BOUNDED"
  | "NOT_ESTABLISHED"
  | "SCOPE_LIMITATION_MISSING";

export type ClaimPublicationRule =
  | "PUBLISHED_DIRECT_SUPPORT"
  | "PUBLISHED_INDEPENDENT_PARTIAL_SUPPORT"
  | "EVIDENCE_REFERENCE_INVALID"
  | "UNSUPPORTED_EVIDENCE"
  | "COVERAGE_NOT_ESTABLISHED"
  | "SCOPE_LIMITATION_MISSING"
  | "INSUFFICIENT_DIRECT_SUPPORT"
  | "INSUFFICIENT_INDEPENDENT_SUPPORT"
  | "CONTEXT_ONLY_INSUFFICIENT";

export type ClaimPublicationOutcome = "PUBLISH" | "PRUNE" | "BLOCK";

export interface ClaimPublicationCandidate {
  id: string;
  kind: Exclude<ClaimKind, "competitorGap">;
  text: string;
  evidenceIds: readonly string[];
}

export interface ClaimPublicationPolicyInput {
  claim: ClaimPublicationCandidate;
  relations: readonly ClaimEvidenceRelation[];
  evidence: readonly DiagnosisReport["evidence"][number][];
  coverage: EvidenceCoverage;
  sourceContext: ClaimPublicationSourceContext;
  coverageScope?: ClaimPublicationCoverageScope;
}

export interface ClaimPublicationDecision {
  policyVersion: typeof DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION;
  outcome: ClaimPublicationOutcome;
  rule: ClaimPublicationRule;
  polarity: "ENTERPRISE_CAPABILITY" | "NEGATIVE_MISSING";
  directCount: number;
  partialCount: number;
  contextCount: number;
  unsupportedCount: number;
  independentPartialSourceKeys: IndependentSupportSourceKey[];
  independentPartialSourceCount: number;
  coverageStatus: ClaimPublicationCoverageStatus;
}

export const STANDARD_NEGATIVE_SCOPE_PHRASES = [
  "本次已检查的公开页面和搜索结果中未发现",
  "本次检查的公开页面中未发现",
] as const;

export const FROZEN_EVIDENCE_NEGATIVE_SCOPE_PHRASES = [
  "在本次保存的公开证据中，暂未发现",
  "基于本次保存的公开页面和搜索证据，相关说明仍不充分",
] as const;

function coverageScopeOf(input: ClaimPublicationPolicyInput): ClaimPublicationCoverageScope {
  if (input.coverageScope) return input.coverageScope;
  const extended = input.coverage as EvidenceCoverage & { coverageMode?: unknown };
  return extended.coverageMode === "FROZEN_EVIDENCE_SCOPE_ONLY"
    ? "FROZEN_EVIDENCE"
    : "STANDARD";
}

function coverageStatusOf(
  input: ClaimPublicationPolicyInput,
  negative: boolean,
): ClaimPublicationCoverageStatus {
  if (!negative) return "NOT_REQUIRED";
  if (!input.coverage.boundaryEstablished) return "NOT_ESTABLISHED";
  const phrases =
    coverageScopeOf(input) === "FROZEN_EVIDENCE"
      ? FROZEN_EVIDENCE_NEGATIVE_SCOPE_PHRASES
      : STANDARD_NEGATIVE_SCOPE_PHRASES;
  return phrases.some((phrase) => input.claim.text.includes(phrase))
    ? "ESTABLISHED_AND_BOUNDED"
    : "SCOPE_LIMITATION_MISSING";
}

function decision(
  input: Omit<ClaimPublicationDecision, "policyVersion">,
): ClaimPublicationDecision {
  return { policyVersion: DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION, ...input };
}

/**
 * Safe compatibility context for existing diagnosis paths. A Diagnosis is
 * scoped to one current-company entity, so its id is a stable entity key until
 * the runtime supplies an explicit companyId. Competitors remain default-deny.
 */
export function publicationSourceContextFromReport(
  report: Pick<DiagnosisReport, "diagnosisId">,
  coverage: EvidenceCoverage,
  explicit?: ClaimPublicationSourceContext,
): ClaimPublicationSourceContext {
  if (explicit) return explicit;
  return {
    companyId: report.diagnosisId,
    firstPartyDomains: coverage.firstPartyDomains,
    competitorEntities: [],
  };
}

function evaluate(input: ClaimPublicationPolicyInput): ClaimPublicationDecision {
  const polarity = classifyPolarity({ kind: input.claim.kind, text: input.claim.text });
  const negative = polarity === "NEGATIVE_MISSING";
  const coverageStatus = coverageStatusOf(input, negative);
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const candidateIds = new Set(input.claim.evidenceIds);
  const relationIntegrity = input.relations.every(
    (relation) =>
      relation.claimId === input.claim.id &&
      relation.claimKind === input.claim.kind &&
      candidateIds.has(relation.evidenceId) &&
      evidenceById.has(relation.evidenceId),
  );
  const candidateIntegrity = [...candidateIds].every(
      (evidenceId) =>
        evidenceById.has(evidenceId) &&
        input.relations.some((relation) => relation.evidenceId === evidenceId),
  );

  const direct = input.relations.filter((relation) => relation.supportLevel === "DIRECT_SUPPORT");
  const partial = input.relations.filter((relation) => relation.supportLevel === "PARTIAL_SUPPORT");
  const context = input.relations.filter((relation) => relation.supportLevel === "CONTEXT_ONLY");
  const unsupported = input.relations.filter(
    (relation) => relation.supportLevel === "UNSUPPORTED",
  );
  const eligiblePartial = negative
    ? partial.filter((relation) => relation.basis === "MEASUREMENT_BOUNDARY")
    : partial;
  const independentPartialSourceKeys = independentSupportSourceKeys(
    eligiblePartial.map((relation) => relation.evidenceId),
    input.evidence,
    input.sourceContext,
  );

  const base = {
    polarity: negative ? "NEGATIVE_MISSING" as const : "ENTERPRISE_CAPABILITY" as const,
    directCount: direct.length,
    partialCount: partial.length,
    contextCount: context.length,
    unsupportedCount: unsupported.length,
    independentPartialSourceKeys,
    independentPartialSourceCount: independentPartialSourceKeys.length,
    coverageStatus,
  };

  if (!relationIntegrity || !candidateIntegrity) {
    return decision({ ...base, outcome: "BLOCK", rule: "EVIDENCE_REFERENCE_INVALID" });
  }
  if (unsupported.length > 0) {
    return decision({ ...base, outcome: "BLOCK", rule: "UNSUPPORTED_EVIDENCE" });
  }
  if (coverageStatus === "NOT_ESTABLISHED") {
    return decision({ ...base, outcome: "PRUNE", rule: "COVERAGE_NOT_ESTABLISHED" });
  }
  if (coverageStatus === "SCOPE_LIMITATION_MISSING") {
    return decision({ ...base, outcome: "PRUNE", rule: "SCOPE_LIMITATION_MISSING" });
  }

  if (input.claim.kind === "coreIssue") {
    return direct.length >= 1
      ? decision({ ...base, outcome: "PUBLISH", rule: "PUBLISHED_DIRECT_SUPPORT" })
      : decision({ ...base, outcome: "PRUNE", rule: "INSUFFICIENT_DIRECT_SUPPORT" });
  }
  if (direct.length >= 1) {
    return decision({ ...base, outcome: "PUBLISH", rule: "PUBLISHED_DIRECT_SUPPORT" });
  }
  if (independentPartialSourceKeys.length >= 2) {
    return decision({
      ...base,
      outcome: "PUBLISH",
      rule: "PUBLISHED_INDEPENDENT_PARTIAL_SUPPORT",
    });
  }
  if (partial.length === 0 && context.length > 0) {
    return decision({ ...base, outcome: "PRUNE", rule: "CONTEXT_ONLY_INSUFFICIENT" });
  }
  return decision({ ...base, outcome: "PRUNE", rule: "INSUFFICIENT_INDEPENDENT_SUPPORT" });
}

/** The only frozen support-threshold implementation used by every report path. */
export const ClaimPublicationPolicy = Object.freeze({
  version: DEFAULT_CLAIM_PUBLICATION_POLICY_VERSION,
  evaluate,
});

export function evaluateClaimPublication(
  input: ClaimPublicationPolicyInput,
): ClaimPublicationDecision {
  return ClaimPublicationPolicy.evaluate(input);
}
