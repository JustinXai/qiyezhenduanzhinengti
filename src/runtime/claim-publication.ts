import type { DiagnosisReport } from "../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../contracts/independent-support-source";
import { extractVerifiableClaims } from "../diagnosis/verification";
import {
  evaluateClaimPublication,
  negativeScopeTextFromReport,
  publicationSourceContextFromReport,
  type ClaimPublicationCoverageScope,
  type ClaimPublicationDecision,
} from "../report/validation/claim-publication-policy";
import {
  evaluateCompetitorGapPublication,
  FAIL_CLOSED_COMPETITOR_GAP_METADATA,
  type CompetitorGapPublicationContextById,
  type CompetitorGapPublicationDecision,
  type CompetitorGapPublicationReason,
} from "../report/validation/competitor-gap-publication-policy";
import type { AuditedPublicationCandidate } from "./prune-audit";
import type { PruneDecisionReasonCode } from "../storage/adapter";

export const FROZEN_NEEDS_CONFIRMATION_PREFIX =
  "待进一步确认（仅限本次保存的公开证据范围，不作为确定性结论）：";

export interface PolicyPrune {
  type: "POLICY";
  candidate: AuditedPublicationCandidate;
  decision: ClaimPublicationDecision;
}

export interface StructuralPrune {
  type: "STRUCTURAL";
  candidate: AuditedPublicationCandidate;
  reasonCode: PruneDecisionReasonCode;
  guardRule: string;
  coverageStatus: ClaimPublicationDecision["coverageStatus"];
  competitorGapDecision?: CompetitorGapPublicationDecision;
}

export type UnifiedCandidatePrune = PolicyPrune | StructuralPrune;

export interface ApplyClaimPublicationResult {
  report: DiagnosisReport;
  prunes: UnifiedCandidatePrune[];
  publishedIssueIds: string[];
  removedIssueIds: string[];
  removedOpportunityIds: string[];
  demonstrationFixRemoved: boolean;
  deepNeedsConfirmation: string[];
}

function sourceIssueIdFor(
  report: DiagnosisReport,
  kind: string,
  candidateRef: string,
): string | null {
  if (kind === "geoOpportunity") {
    return report.geoOpportunities.find((item) => item.id === candidateRef)?.sourceIssueId ?? null;
  }
  return null;
}

/**
 * Applies the single ClaimPublicationPolicy to every gated report claim.
 * Thresholds are never copied here; this function only projects decisions into
 * an immutable report and records derivative lineage removals.
 */
export function applyClaimPublicationPolicyToReport(input: {
  report: DiagnosisReport;
  relations: readonly ClaimEvidenceRelation[];
  coverage: EvidenceCoverage;
  sourceContext?: ClaimPublicationSourceContext;
  coverageScope?: ClaimPublicationCoverageScope;
  preserveNegativeIssuesAsUnresolved?: boolean;
  competitorGapContexts?: CompetitorGapPublicationContextById;
}): ApplyClaimPublicationResult {
  const sourceContext = publicationSourceContextFromReport(
    input.report,
    input.coverage,
    input.sourceContext,
  );
  const prunes: UnifiedCandidatePrune[] = [];
  const retainedIds = new Set<string>();
  const prunedPolicyIds = new Set<string>();
  const deepNeedsConfirmation: string[] = [];
  const claims = extractVerifiableClaims(input.report).filter(
    (
      claim,
    ): claim is typeof claim & { kind: "coreIssue" | "strength" | "geoOpportunity" } =>
      claim.kind !== "competitorGap",
  );

  for (const claim of claims) {
    const candidate: AuditedPublicationCandidate = {
      claimKind: claim.kind,
      candidateRef: claim.id,
      sourceIssueId: sourceIssueIdFor(input.report, claim.kind, claim.id),
      evidenceIds: [...claim.candidateEvidenceIds],
    };
    const decision = evaluateClaimPublication({
      claim: {
        id: claim.id,
        kind: claim.kind,
        text: claim.text,
        negativeScopeText: negativeScopeTextFromReport(input.report, claim.kind, claim.id),
        evidenceIds: claim.candidateEvidenceIds,
      },
      relations: input.relations.filter((relation) => relation.claimId === claim.id),
      evidence: input.report.evidence,
      coverage: input.coverage,
      sourceContext,
      coverageScope: input.coverageScope,
    });
    if (decision.outcome === "PUBLISH" || decision.outcome === "BLOCK") {
      // BLOCK stays in the candidate report so publishGuard fails closed. It is
      // never mislabeled as a business/content prune.
      retainedIds.add(claim.id);
      continue;
    }
    prunedPolicyIds.add(claim.id);
    prunes.push({ type: "POLICY", candidate, decision });
    if (
      input.preserveNegativeIssuesAsUnresolved === true &&
      claim.kind === "coreIssue" &&
      decision.polarity === "NEGATIVE_MISSING"
    ) {
      const issue = input.report.coreIssues.find((item) => item.id === claim.id);
      if (issue) deepNeedsConfirmation.push(`${FROZEN_NEEDS_CONFIRMATION_PREFIX}${issue.statement}`);
    }
  }

  const strengths = input.report.strengths.filter((item) => retainedIds.has(item.id));
  const coreIssues = input.report.coreIssues.filter((item) => retainedIds.has(item.id));
  const publishedIssueIds = new Set(coreIssues.map((item) => item.id));
  const geoOpportunities = input.report.geoOpportunities.filter((item) => {
    if (!retainedIds.has(item.id)) return false;
    if (item.sourceIssueId !== undefined && publishedIssueIds.has(item.sourceIssueId)) return true;
    prunes.push({
      type: "STRUCTURAL",
      candidate: {
        claimKind: "geoOpportunity",
        candidateRef: item.id,
        sourceIssueId: item.sourceIssueId ?? null,
        evidenceIds: [...item.evidenceIds],
      },
      reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
      guardRule: "PUBLICATION_SOURCE_ISSUE_REFERENCE_INTEGRITY",
      coverageStatus: "NOT_REQUIRED",
    });
    return false;
  });
  const competitorGaps = input.report.competitorGaps.filter((gap) => {
    const decision = evaluateCompetitorGapPublication({
      gap,
      evidence: input.report.evidence,
      relations: input.relations.filter((relation) => relation.claimId === gap.id),
      sourceContext,
      metadata:
        input.competitorGapContexts?.[gap.id] ??
        FAIL_CLOSED_COMPETITOR_GAP_METADATA,
    });
    if (decision.outcome === "PUBLISH" || decision.outcome === "BLOCK") {
      // BLOCK remains visible to publishGuard so invalid references/UNSUPPORTED
      // fail closed instead of being mislabeled as a content prune.
      return true;
    }
    prunes.push({
      type: "STRUCTURAL",
      candidate: {
        claimKind: "competitorGap",
        candidateRef: gap.id,
        sourceIssueId: null,
        evidenceIds: [...gap.evidenceIds],
      },
      reasonCode: competitorGapPruneReason(decision.reason),
      guardRule: competitorGapGuardRule(decision.reason),
      coverageStatus:
        decision.coverageStatus === "ESTABLISHED"
          ? "ESTABLISHED_AND_BOUNDED"
          : decision.coverageStatus,
      competitorGapDecision: decision,
    });
    if (decision.outcome === "DEEP_NEEDS_CONFIRMATION") {
      deepNeedsConfirmation.push(
        `竞品公开信息观察（未形成确定性差距）：${gap.gapStatement}`,
      );
    }
    return false;
  });
  const removedOpportunityIds = input.report.geoOpportunities
    .filter((item) => !geoOpportunities.some((retained) => retained.id === item.id))
    .map((item) => item.id);

  const demonstrationFix = input.report.demonstrationFix;
  const demoIssue = demonstrationFix
    ? input.report.coreIssues.find((issue) => issue.statement === demonstrationFix.currentIssue)
    : undefined;
  const keepDemonstrationFix =
    demonstrationFix !== null && demoIssue !== undefined && publishedIssueIds.has(demoIssue.id);
  if (demonstrationFix && !keepDemonstrationFix) {
    prunes.push({
      type: "STRUCTURAL",
      candidate: {
        claimKind: "demonstrationFix",
        candidateRef: demonstrationFix.id,
        sourceIssueId: demoIssue?.id ?? null,
        evidenceIds: [...demonstrationFix.evidenceIds],
      },
      reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
      guardRule: "PUBLICATION_DEMONSTRATION_FIX_SOURCE_ISSUE_INTEGRITY",
      coverageStatus: "NOT_REQUIRED",
    });
  }

  return {
    report: {
      ...input.report,
      companyProfile:
        deepNeedsConfirmation.length === 0
          ? input.report.companyProfile
          : {
              ...input.report.companyProfile,
              unresolvedQuestions: [
                ...input.report.companyProfile.unresolvedQuestions,
                ...deepNeedsConfirmation.filter(
                  (item) => !input.report.companyProfile.unresolvedQuestions.includes(item),
                ),
              ],
            },
      strengths,
      coreIssues,
      geoOpportunities,
      competitorGaps,
      demonstrationFix: keepDemonstrationFix ? demonstrationFix : null,
    },
    prunes,
    publishedIssueIds: [...publishedIssueIds],
    removedIssueIds: input.report.coreIssues
      .filter((item) => prunedPolicyIds.has(item.id))
      .map((item) => item.id),
    removedOpportunityIds,
    demonstrationFixRemoved: demonstrationFix !== null && !keepDemonstrationFix,
    deepNeedsConfirmation,
  };
}

function competitorGapGuardRule(reason: CompetitorGapPublicationReason): string {
  return `COMPETITOR_GAP_${reason}`;
}

function competitorGapPruneReason(
  reason: CompetitorGapPublicationReason,
): PruneDecisionReasonCode {
  return reason === "PUBLISHED" ? "UNVERIFIED_COMPETITOR_ASSERTION" : reason;
}
