import type { DiagnosisReport } from "../../contracts";
import type { ClaimEvidenceRelation } from "../../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import { resolveIndependentSupportSourceKey } from "./independent-support-source";

export const COMPETITOR_GAP_PUBLICATION_POLICY_VERSION =
  "competitor-gap-publication-policy.v1" as const;

export type CompetitorGapPublicationReason =
  | "PUBLISHED"
  | "UNVERIFIED_COMPETITOR_ASSERTION"
  | "MISSING_COMPETITOR_OFFICIAL_RELATION"
  | "MISSING_CURRENT_COMPANY_RELATION"
  | "COMPETITOR_ENTITY_NOT_RESOLVED"
  | "COMPARISON_DIMENSION_MISMATCH"
  | "COMPETITOR_COVERAGE_NOT_ESTABLISHED";

export type CompetitorGapPublicationOutcome =
  | "PUBLISH"
  | "PRUNE"
  | "DEEP_NEEDS_CONFIRMATION"
  | "BLOCK";

export type CompetitorNameSource =
  | "USER_INPUT"
  | "CONFIRMED_ENTITY"
  | "UNVERIFIED";

/**
 * Explicit verifier/resolver metadata. The policy intentionally does not infer
 * entity identity, comparison dimensions, or bounded-negative semantics from
 * marketing copy.
 */
export interface CompetitorGapPublicationMetadata {
  competitorNameSource: CompetitorNameSource;
  competitorEntityId: string | null;
  comparisonDimension: string;
  currentCompanyComparisonDimension: string;
  competitorComparisonDimension: string;
  conclusionWithinEvidence: boolean;
  negativeOrMissing: boolean;
  currentCompanyCoverageEstablished: boolean;
  competitorCoverageEstablished: boolean;
  boundedScope: boolean;
}

export interface CompetitorGapPublicationCandidate {
  id: string;
  competitorName: string;
  gapStatement: string;
  evidenceIds: readonly string[];
}

export interface CompetitorGapPublicationPolicyInput {
  gap: CompetitorGapPublicationCandidate;
  evidence: DiagnosisReport["evidence"];
  /** Persisted ClaimEvidenceRelations produced by the verifier. */
  relations: readonly ClaimEvidenceRelation[];
  sourceContext: ClaimPublicationSourceContext;
  metadata: CompetitorGapPublicationMetadata;
}

export interface CompetitorGapPublicationDecision {
  policyVersion: typeof COMPETITOR_GAP_PUBLICATION_POLICY_VERSION;
  outcome: CompetitorGapPublicationOutcome;
  reason: CompetitorGapPublicationReason;
  competitorEntityConfirmed: boolean;
  directCount: number;
  partialCount: number;
  contextCount: number;
  unsupportedCount: number;
  currentCompanyRelationEvidenceIds: string[];
  competitorOfficialRelationEvidenceIds: string[];
  comparisonDimensionMatched: boolean;
  coverageStatus: "NOT_REQUIRED" | "ESTABLISHED" | "NOT_ESTABLISHED";
}

export type CompetitorGapPublicationContextById = Readonly<
  Record<string, CompetitorGapPublicationMetadata | undefined>
>;

export const FAIL_CLOSED_COMPETITOR_GAP_METADATA: CompetitorGapPublicationMetadata =
  Object.freeze({
    competitorNameSource: "UNVERIFIED",
    competitorEntityId: null,
    comparisonDimension: "",
    currentCompanyComparisonDimension: "",
    competitorComparisonDimension: "",
    conclusionWithinEvidence: false,
    negativeOrMissing: true,
    currentCompanyCoverageEstablished: false,
    competitorCoverageEstablished: false,
    boundedScope: false,
  });

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function verifierRelationIsPersisted(relation: ClaimEvidenceRelation): boolean {
  return (
    (relation.verifierMode === "MOCK_DETERMINISTIC" ||
      relation.verifierMode === "DEEPSEEK_STRUCTURED") &&
    relation.verifierVersion.trim().length > 0
  );
}

function decide(
  base: Omit<CompetitorGapPublicationDecision, "policyVersion" | "outcome" | "reason">,
  outcome: CompetitorGapPublicationOutcome,
  reason: CompetitorGapPublicationReason,
): CompetitorGapPublicationDecision {
  return {
    policyVersion: COMPETITOR_GAP_PUBLICATION_POLICY_VERSION,
    outcome,
    reason,
    ...base,
  };
}

function evaluate(
  input: CompetitorGapPublicationPolicyInput,
): CompetitorGapPublicationDecision {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const candidateIds = new Set(input.gap.evidenceIds);
  const scopedRelations = input.relations.filter(
    (relation) => relation.claimId === input.gap.id,
  );
  const verifiedRelations = scopedRelations.filter(
    (relation) =>
      relation.claimKind === "competitorGap" &&
      candidateIds.has(relation.evidenceId) &&
      evidenceById.has(relation.evidenceId) &&
      verifierRelationIsPersisted(relation),
  );
  const directCount = verifiedRelations.filter(
    (relation) => relation.supportLevel === "DIRECT_SUPPORT",
  ).length;
  const partialCount = verifiedRelations.filter(
    (relation) => relation.supportLevel === "PARTIAL_SUPPORT",
  ).length;
  const contextCount = verifiedRelations.filter(
    (relation) => relation.supportLevel === "CONTEXT_ONLY",
  ).length;
  const unsupportedCount = verifiedRelations.filter(
    (relation) => relation.supportLevel === "UNSUPPORTED",
  ).length;

  const entityId = input.metadata.competitorEntityId?.trim() ?? "";
  const confirmedEntity = input.sourceContext.competitorEntities.find(
    (entity) => entity.competitorEntityId === entityId,
  );
  const competitorEntityConfirmed = Boolean(entityId && confirmedEntity);
  const currentCompanyKey = `ENTITY:CURRENT_COMPANY:${input.sourceContext.companyId}`;
  const competitorKey = entityId ? `ENTITY:COMPETITOR:${entityId}` : "";
  const usableRelations = verifiedRelations.filter(
    (relation) =>
      relation.supportLevel === "DIRECT_SUPPORT" ||
      relation.supportLevel === "PARTIAL_SUPPORT",
  );
  const currentCompanyRelationEvidenceIds = usableRelations
    .filter((relation) => {
      const evidence = evidenceById.get(relation.evidenceId);
      return (
        evidence?.sourceType === "FIRST_PARTY_EVIDENCE" &&
        resolveIndependentSupportSourceKey(evidence, input.sourceContext) === currentCompanyKey
      );
    })
    .map((relation) => relation.evidenceId);
  const competitorOfficialRelationEvidenceIds = usableRelations
    .filter((relation) => {
      const evidence = evidenceById.get(relation.evidenceId);
      return (
        evidence?.sourceType === "COMPETITOR_WEB_EVIDENCE" &&
        resolveIndependentSupportSourceKey(evidence, input.sourceContext) === competitorKey
      );
    })
    .map((relation) => relation.evidenceId);
  const comparisonDimensionMatched =
    normalized(input.metadata.comparisonDimension).length > 0 &&
    normalized(input.metadata.comparisonDimension) ===
      normalized(input.metadata.currentCompanyComparisonDimension) &&
    normalized(input.metadata.comparisonDimension) ===
      normalized(input.metadata.competitorComparisonDimension);
  const coverageStatus = !input.metadata.negativeOrMissing
    ? "NOT_REQUIRED" as const
    : input.metadata.currentCompanyCoverageEstablished &&
        input.metadata.competitorCoverageEstablished
      ? "ESTABLISHED" as const
      : "NOT_ESTABLISHED" as const;
  const base = {
    competitorEntityConfirmed,
    directCount,
    partialCount,
    contextCount,
    unsupportedCount,
    currentCompanyRelationEvidenceIds: [...new Set(currentCompanyRelationEvidenceIds)],
    competitorOfficialRelationEvidenceIds: [
      ...new Set(competitorOfficialRelationEvidenceIds),
    ],
    comparisonDimensionMatched,
    coverageStatus,
  };

  const allCandidateEvidenceExists =
    candidateIds.size > 0 && [...candidateIds].every((id) => evidenceById.has(id));
  const relationIntegrity = scopedRelations.every(
    (relation) =>
      relation.claimKind === "competitorGap" &&
      candidateIds.has(relation.evidenceId) &&
      evidenceById.has(relation.evidenceId) &&
      verifierRelationIsPersisted(relation),
  );
  if (!allCandidateEvidenceExists || !relationIntegrity) {
    return decide(base, "BLOCK", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  if (unsupportedCount > 0) {
    return decide(base, "BLOCK", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  if (
    input.metadata.competitorNameSource !== "USER_INPUT" &&
    input.metadata.competitorNameSource !== "CONFIRMED_ENTITY"
  ) {
    return decide(base, "PRUNE", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  if (!competitorEntityConfirmed) {
    return decide(base, "PRUNE", "COMPETITOR_ENTITY_NOT_RESOLVED");
  }
  if (competitorOfficialRelationEvidenceIds.length === 0) {
    return decide(base, "PRUNE", "MISSING_COMPETITOR_OFFICIAL_RELATION");
  }
  if (currentCompanyRelationEvidenceIds.length === 0) {
    return decide(base, "DEEP_NEEDS_CONFIRMATION", "MISSING_CURRENT_COMPANY_RELATION");
  }
  const allCandidateEvidenceVerified = [...candidateIds].every((id) =>
    verifiedRelations.some((relation) => relation.evidenceId === id),
  );
  if (!allCandidateEvidenceVerified) {
    return decide(base, "BLOCK", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  if (!comparisonDimensionMatched) {
    return decide(base, "PRUNE", "COMPARISON_DIMENSION_MISMATCH");
  }
  if (coverageStatus === "NOT_ESTABLISHED") {
    return decide(base, "DEEP_NEEDS_CONFIRMATION", "COMPETITOR_COVERAGE_NOT_ESTABLISHED");
  }
  if (input.metadata.negativeOrMissing && !input.metadata.boundedScope) {
    return decide(base, "PRUNE", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  if (!input.metadata.conclusionWithinEvidence) {
    return decide(base, "PRUNE", "UNVERIFIED_COMPETITOR_ASSERTION");
  }
  return decide(base, "PUBLISH", "PUBLISHED");
}

export const CompetitorGapPublicationPolicyV1 = Object.freeze({
  version: COMPETITOR_GAP_PUBLICATION_POLICY_VERSION,
  evaluate,
});

export function evaluateCompetitorGapPublication(
  input: CompetitorGapPublicationPolicyInput,
): CompetitorGapPublicationDecision {
  return CompetitorGapPublicationPolicyV1.evaluate(input);
}
