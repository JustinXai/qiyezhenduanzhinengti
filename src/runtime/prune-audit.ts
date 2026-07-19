import type { AnalysisPruneCandidate } from "../diagnosis/analysis/claims";
import type {
  PruneDecisionCoverageStatus,
  PruneDecisionReasonCode,
  PruneDecisionRecordInput,
} from "../storage/adapter";

export const PRUNE_AUDIT_ALGORITHM_VERSION = "round6-prune-audit.v1";

export interface PublicationDecisionForAudit {
  outcome: "PUBLISH" | "PRUNE" | "BLOCK";
  rule:
    | "PUBLISHED_DIRECT_SUPPORT"
    | "PUBLISHED_INDEPENDENT_PARTIAL_SUPPORT"
    | "EVIDENCE_REFERENCE_INVALID"
    | "UNSUPPORTED_EVIDENCE"
    | "COVERAGE_NOT_ESTABLISHED"
    | "SCOPE_LIMITATION_MISSING"
    | "INSUFFICIENT_DIRECT_SUPPORT"
    | "INSUFFICIENT_INDEPENDENT_SUPPORT"
    | "CONTEXT_ONLY_INSUFFICIENT";
  directCount: number;
  partialCount: number;
  contextCount: number;
  independentPartialSourceCount: number;
  coverageStatus: PruneDecisionCoverageStatus;
}

export interface PruneDecisionContext {
  id: string;
  diagnosisId: string;
  reportId: string | null;
  revisionId: string | null;
  stageRunId: string;
  createdAt: Date;
  algorithmVersion?: string;
}

export interface AuditedPublicationCandidate {
  claimKind: string;
  candidateRef: string;
  sourceIssueId: string | null;
  evidenceIds: string[];
}

function reasonForPolicyRule(
  rule: PublicationDecisionForAudit["rule"],
): PruneDecisionReasonCode {
  switch (rule) {
    case "EVIDENCE_REFERENCE_INVALID":
      return "INVALID_EVIDENCE_REFERENCE";
    case "COVERAGE_NOT_ESTABLISHED":
      return "NO_MEASUREMENT_COVERAGE";
    case "SCOPE_LIMITATION_MISSING":
      return "MISSING_COVERAGE_PREFIX";
    case "INSUFFICIENT_DIRECT_SUPPORT":
      return "INSUFFICIENT_DIRECT_SUPPORT";
    case "INSUFFICIENT_INDEPENDENT_SUPPORT":
    case "CONTEXT_ONLY_INSUFFICIENT":
      return "INSUFFICIENT_INDEPENDENT_SUPPORT";
    case "UNSUPPORTED_EVIDENCE":
      throw new Error("UNSUPPORTED_EVIDENCE_IS_A_HARD_BLOCK_NOT_A_PRUNE_DECISION");
    case "PUBLISHED_DIRECT_SUPPORT":
    case "PUBLISHED_INDEPENDENT_PARTIAL_SUPPORT":
      throw new Error("PUBLISHED_CANDIDATE_CANNOT_CREATE_PRUNE_DECISION");
  }
}

function baseDecision(
  ctx: PruneDecisionContext,
  candidate: AuditedPublicationCandidate,
): Omit<
  PruneDecisionRecordInput,
  | "reasonCode"
  | "guardRule"
  | "independentSupportSourceCount"
  | "directCount"
  | "partialCount"
  | "contextCount"
  | "coverageStatus"
> {
  return {
    id: ctx.id,
    diagnosisId: ctx.diagnosisId,
    reportId: ctx.reportId,
    revisionId: ctx.revisionId,
    stageRunId: ctx.stageRunId,
    claimKind: candidate.claimKind,
    candidateRef: candidate.candidateRef,
    sourceIssueId: candidate.sourceIssueId,
    evidenceIds: [...new Set(candidate.evidenceIds)],
    createdAt: new Date(ctx.createdAt),
    algorithmVersion: ctx.algorithmVersion ?? PRUNE_AUDIT_ALGORITHM_VERSION,
  };
}

export function auditPublicationPrune(input: {
  context: PruneDecisionContext;
  candidate: AuditedPublicationCandidate;
  decision: PublicationDecisionForAudit;
}): PruneDecisionRecordInput {
  if (input.decision.outcome !== "PRUNE") {
    throw new Error("PRUNE_DECISION_REQUIRES_POLICY_PRUNE_OUTCOME");
  }
  return {
    ...baseDecision(input.context, input.candidate),
    reasonCode: reasonForPolicyRule(input.decision.rule),
    guardRule: input.decision.rule,
    independentSupportSourceCount: input.decision.independentPartialSourceCount,
    directCount: input.decision.directCount,
    partialCount: input.decision.partialCount,
    contextCount: input.decision.contextCount,
    coverageStatus: input.decision.coverageStatus,
  };
}

/** Enrich a candidate rejected before semantic verification with run lineage. */
export function auditAnalysisPrune(input: {
  context: PruneDecisionContext;
  candidate: AnalysisPruneCandidate;
}): PruneDecisionRecordInput {
  return {
    ...baseDecision(input.context, {
      claimKind: input.candidate.claimKind,
      candidateRef: input.candidate.candidateRef,
      sourceIssueId: input.candidate.sourceIssueId,
      evidenceIds: input.candidate.evidenceIds,
    }),
    reasonCode: input.candidate.reasonCode as PruneDecisionReasonCode,
    guardRule: input.candidate.guardRule,
    independentSupportSourceCount: 0,
    directCount: 0,
    partialCount: 0,
    contextCount: 0,
    coverageStatus: input.candidate.coverageStatus ?? "NOT_REQUIRED",
  };
}
