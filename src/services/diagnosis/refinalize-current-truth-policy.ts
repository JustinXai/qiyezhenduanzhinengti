import type { DiagnosisReport } from "../../contracts";
import type {
  ClaimEvidenceRelation,
  EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import { extractVerifiableClaims } from "../../diagnosis/verification";
import {
  evaluateClaimPublication,
  negativeScopeTextFromReport,
} from "../../report/validation/claim-publication-policy";
import {
  evaluateCompetitorGapPublication,
  type CompetitorGapPublicationContextById,
} from "../../report/validation/competitor-gap-publication-policy";
import { independentSupportSourceKeys } from "../../report/validation/independent-support-source";
import type { CandidateSourceResolutionV1 } from "../../runtime/candidate-source-resolver";
import {
  applyClaimPublicationPolicyToReport,
  type UnifiedCandidatePrune,
} from "../../runtime/claim-publication";
import { pruneReasonForPolicyDecision } from "../../runtime/prune-audit";
import type {
  ClaimPublicationDecisionRecordInput,
  PruneDecisionReasonCode,
  PruneDecisionRecord,
  PruneDecisionRecordInput,
  PruneDecisionCoverageStatus,
} from "../../storage/adapter";
import {
  canonicalReportJson,
  type ReportRevisionRecord,
  type ReportRevisionRepository,
} from "../../storage/report-revisions";

export const CURRENT_TRUTH_REFINALIZER_VERSION =
  "refinalize-current-truth-policy.v1" as const;

export interface CurrentTruthRefinalizationRequest {
  diagnosisId: string;
  expectedParentReportId: string;
  revisionReason: string;
  algorithmVersion: string;
}

export interface CurrentTruthRefinalizationDependencies {
  revisions: ReportRevisionRepository;
  candidateSource: CandidateSourceResolutionV1;
  relations: readonly ClaimEvidenceRelation[];
  coverage: EvidenceCoverage;
  sourceContext: ClaimPublicationSourceContext;
  competitorGapContexts: CompetitorGapPublicationContextById;
  historicalPruneDecisions: readonly PruneDecisionRecord[];
  assertTruthGuards(report: DiagnosisReport): void;
  assertPresentation(report: DiagnosisReport): void;
  now?: () => Date;
}

export interface CurrentTruthRefinalizationResult {
  revision: ReportRevisionRecord;
  candidateDecisionCount: number;
  newPruneDecisionCount: number;
  providerCalls: 0;
}

type RevisionDecision = Omit<
  ClaimPublicationDecisionRecordInput,
  "id" | "reportId" | "revisionId" | "diagnosisId"
>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function publishedCandidateRefs(report: DiagnosisReport): Set<string> {
  return new Set([
    ...report.strengths.map((item) => item.id),
    ...report.coreIssues.map((item) => item.id),
    ...report.geoOpportunities.map((item) => item.id),
    ...report.competitorGaps.map((item) => item.id),
    ...(report.demonstrationFix ? [report.demonstrationFix.id] : []),
  ]);
}

function coverageStatus(
  value: string,
): PruneDecisionCoverageStatus {
  if (value === "ESTABLISHED") return "ESTABLISHED_AND_BOUNDED";
  if (
    value === "NOT_REQUIRED" ||
    value === "NOT_ESTABLISHED" ||
    value === "SCOPE_LIMITATION_MISSING" ||
    value === "ESTABLISHED_AND_BOUNDED"
  ) {
    return value;
  }
  return "NOT_REQUIRED";
}

function structuralCounts(prune: UnifiedCandidatePrune): {
  directCount: number;
  partialCount: number;
  contextCount: number;
  independentSupportSourceCount: number;
} & { independentEvidenceIds?: readonly string[] } {
  if (prune.type === "POLICY") {
    return {
      directCount: prune.decision.directCount,
      partialCount: prune.decision.partialCount,
      contextCount: prune.decision.contextCount,
      independentSupportSourceCount: prune.decision.independentPartialSourceCount,
    };
  }
  const gap = prune.competitorGapDecision;
  return {
    directCount: gap?.directCount ?? 0,
    partialCount: gap?.partialCount ?? 0,
    contextCount: gap?.contextCount ?? 0,
    independentSupportSourceCount: 0,
    independentEvidenceIds: gap
      ? [
          ...gap.currentCompanyRelationEvidenceIds,
          ...gap.competitorOfficialRelationEvidenceIds,
        ]
      : [],
  };
}

function pruneReasonFor(prune: UnifiedCandidatePrune): PruneDecisionReasonCode {
  return prune.type === "POLICY"
    ? pruneReasonForPolicyDecision(prune.decision.rule)
    : prune.reasonCode;
}

function publishedDecision(input: {
  report: DiagnosisReport;
  candidateRef: string;
  claimKind: string;
  relations: readonly ClaimEvidenceRelation[];
  coverage: EvidenceCoverage;
  sourceContext: ClaimPublicationSourceContext;
  competitorGapContexts: CompetitorGapPublicationContextById;
}): Omit<
  RevisionDecision,
  | "candidateRef"
  | "claimKind"
  | "evidenceIds"
  | "stageRunId"
  | "legacyCheckpointId"
  | "candidateSourceProvenance"
  | "candidateSourcePayloadHash"
  | "algorithmVersion"
  | "createdAt"
> {
  if (input.claimKind === "competitorGap") {
    const gap = input.report.competitorGaps.find((item) => item.id === input.candidateRef);
    if (!gap) throw new Error("REFINALIZATION_PUBLISHED_GAP_MISSING");
    const metadata = input.competitorGapContexts[gap.id];
    if (!metadata) throw new Error("REFINALIZATION_COMPETITOR_CONTEXT_MISSING");
    const decision = evaluateCompetitorGapPublication({
      gap,
      evidence: input.report.evidence,
      relations: input.relations.filter((item) => item.claimId === gap.id),
      sourceContext: input.sourceContext,
      metadata,
    });
    if (decision.outcome !== "PUBLISH") {
      throw new Error("REFINALIZATION_PUBLISHED_GAP_POLICY_MISMATCH");
    }
    return {
      publicationStatus: "PUBLISHED",
      reasonCode: "PUBLISHED",
      guardRule: decision.policyVersion,
      directCount: decision.directCount,
      partialCount: decision.partialCount,
      contextCount: decision.contextCount,
      independentSupportSourceCount: independentSupportSourceKeys(
        [
          ...decision.currentCompanyRelationEvidenceIds,
          ...decision.competitorOfficialRelationEvidenceIds,
        ],
        input.report.evidence,
        input.sourceContext,
      ).length,
      coverageStatus: coverageStatus(decision.coverageStatus),
    };
  }
  if (input.claimKind === "demonstrationFix") {
    return {
      publicationStatus: "PUBLISHED",
      reasonCode: "PUBLISHED",
      guardRule: "PUBLICATION_DEMONSTRATION_FIX_SOURCE_ISSUE_INTEGRITY",
      directCount: 0,
      partialCount: 0,
      contextCount: 0,
      independentSupportSourceCount: 0,
      coverageStatus: "NOT_REQUIRED",
    };
  }
  const claim = extractVerifiableClaims(input.report).find(
    (item) => item.id === input.candidateRef,
  );
  if (!claim || claim.kind === "competitorGap") {
    throw new Error("REFINALIZATION_PUBLISHED_CLAIM_MISSING");
  }
  const decision = evaluateClaimPublication({
    claim: {
      id: claim.id,
      kind: claim.kind,
      text: claim.text,
      negativeScopeText: negativeScopeTextFromReport(
        input.report,
        claim.kind,
        claim.id,
      ),
      evidenceIds: claim.candidateEvidenceIds,
    },
    relations: input.relations.filter((item) => item.claimId === claim.id),
    evidence: input.report.evidence,
    coverage: input.coverage,
    sourceContext: input.sourceContext,
  });
  if (decision.outcome !== "PUBLISH") {
    throw new Error("REFINALIZATION_PUBLISHED_CLAIM_POLICY_MISMATCH");
  }
  return {
    publicationStatus: "PUBLISHED",
    reasonCode: "PUBLISHED",
    guardRule: decision.policyVersion,
    directCount: decision.directCount,
    partialCount: decision.partialCount,
    contextCount: decision.contextCount,
    independentSupportSourceCount: decision.independentPartialSourceCount,
    coverageStatus: decision.coverageStatus,
  };
}

/**
 * Append-only, zero-Provider projection through the same publication policies
 * used by normal runtime. Candidate content must already be validated by the
 * single CandidateSourceResolverV1.
 */
export async function refinalizeReportWithCurrentTruthPolicy(
  request: CurrentTruthRefinalizationRequest,
  deps: CurrentTruthRefinalizationDependencies,
): Promise<CurrentTruthRefinalizationResult> {
  const current = await deps.revisions.getCurrent(request.diagnosisId);
  if (!current) throw new Error("REFINALIZATION_ORIGINAL_REPORT_MISSING");
  if (current.reportId !== request.expectedParentReportId) {
    throw new Error("REFINALIZATION_PARENT_MISMATCH");
  }
  const snapshot = deps.candidateSource.snapshot;
  if (snapshot.diagnosisId !== request.diagnosisId) {
    throw new Error("REFINALIZATION_CANDIDATE_SOURCE_DIAGNOSIS_MISMATCH");
  }
  if (snapshot.candidateCount !== snapshot.candidates.length) {
    throw new Error("REFINALIZATION_CANDIDATE_SOURCE_COUNT_MISMATCH");
  }

  const publication = applyClaimPublicationPolicyToReport({
    report: current.canonical,
    relations: deps.relations,
    coverage: deps.coverage,
    sourceContext: deps.sourceContext,
    competitorGapContexts: deps.competitorGapContexts,
  });
  const revised = publication.report;
  for (const field of ["scores", "aiVisibilityTests", "evidence"] as const) {
    if (stableJson(revised[field]) !== stableJson(current.canonical[field])) {
      throw new Error(`REFINALIZATION_FROZEN_FIELD_CHANGED:${field}`);
    }
  }
  deps.assertTruthGuards(revised);
  deps.assertPresentation(revised);

  const published = publishedCandidateRefs(revised);
  const newPrunes = new Map(
    publication.prunes.map((item) => [item.candidate.candidateRef, item]),
  );
  const historicalPrunes = new Map(
    deps.historicalPruneDecisions.map((item) => [item.candidateRef, item]),
  );
  const now = deps.now?.() ?? new Date();
  const decisions: RevisionDecision[] = snapshot.candidates.map((candidate) => {
    const common = {
      stageRunId: snapshot.stageRunId,
      legacyCheckpointId: snapshot.legacyCheckpointId,
      candidateSourceProvenance: snapshot.provenance,
      candidateSourcePayloadHash: snapshot.payloadHash,
      candidateRef: candidate.candidateRef,
      claimKind: candidate.claimKind,
      evidenceIds: [...candidate.evidenceIds],
      algorithmVersion: request.algorithmVersion,
      createdAt: now,
    };
    if (published.has(candidate.candidateRef)) {
      return {
        ...common,
        ...publishedDecision({
          report: revised,
          candidateRef: candidate.candidateRef,
          claimKind: candidate.claimKind,
          relations: deps.relations,
          coverage: deps.coverage,
          sourceContext: deps.sourceContext,
          competitorGapContexts: deps.competitorGapContexts,
        }),
      };
    }
    const prune = newPrunes.get(candidate.candidateRef);
    if (prune) {
      const counts = structuralCounts(prune);
      const independentSupportSourceCount =
        prune.type === "STRUCTURAL" && counts.independentEvidenceIds
          ? independentSupportSourceKeys(
              counts.independentEvidenceIds,
              revised.evidence,
              deps.sourceContext,
            ).length
          : counts.independentSupportSourceCount;
      return {
        ...common,
        publicationStatus:
          prune.type === "STRUCTURAL" &&
          prune.competitorGapDecision?.outcome === "DEEP_NEEDS_CONFIRMATION"
            ? "DEEP_NEEDS_CONFIRMATION" as const
            : "PRUNED" as const,
        reasonCode:
          prune.type === "POLICY" ? prune.decision.rule : prune.reasonCode,
        guardRule: prune.type === "POLICY" ? prune.decision.rule : prune.guardRule,
        directCount: counts.directCount,
        partialCount: counts.partialCount,
        contextCount: counts.contextCount,
        independentSupportSourceCount,
        coverageStatus:
          prune.type === "POLICY"
            ? prune.decision.coverageStatus
            : prune.coverageStatus,
      };
    }
    const historical = historicalPrunes.get(candidate.candidateRef);
    if (!historical) {
      throw new Error(
        `REFINALIZATION_CANDIDATE_WITHOUT_FINAL_DECISION:${candidate.candidateRef}`,
      );
    }
    return {
      ...common,
      publicationStatus: "PRUNED" as const,
      reasonCode: historical.reasonCode,
      guardRule: historical.guardRule,
      directCount: historical.directCount,
      partialCount: historical.partialCount,
      contextCount: historical.contextCount,
      independentSupportSourceCount: historical.independentSupportSourceCount,
      coverageStatus: historical.coverageStatus,
    };
  });

  const historicalKeys = new Set(deps.historicalPruneDecisions.map((item) => item.candidateRef));
  const newlyAuditedPrunes = publication.prunes.filter(
    (item) => !historicalKeys.has(item.candidate.candidateRef),
  );
  const legacySourceId = snapshot.stageRunId ?? snapshot.legacyCheckpointId;
  if (!legacySourceId) throw new Error("REFINALIZATION_CANDIDATE_SOURCE_ID_MISSING");
  const pruneDecisions: Array<
    Omit<PruneDecisionRecordInput, "id" | "reportId" | "revisionId">
  > = newlyAuditedPrunes.map((prune) => {
    const counts = structuralCounts(prune);
    const independentSupportSourceCount =
      prune.type === "STRUCTURAL" && counts.independentEvidenceIds
        ? independentSupportSourceKeys(
            counts.independentEvidenceIds,
            revised.evidence,
            deps.sourceContext,
          ).length
        : counts.independentSupportSourceCount;
    return {
      diagnosisId: request.diagnosisId,
      stageRunId: legacySourceId,
      claimKind: prune.candidate.claimKind,
      candidateRef: prune.candidate.candidateRef,
      sourceIssueId: prune.candidate.sourceIssueId,
      reasonCode:
        pruneReasonFor(prune),
      guardRule: prune.type === "POLICY" ? prune.decision.rule : prune.guardRule,
      evidenceIds: [...prune.candidate.evidenceIds],
      directCount: counts.directCount,
      partialCount: counts.partialCount,
      contextCount: counts.contextCount,
      independentSupportSourceCount,
      coverageStatus:
        prune.type === "POLICY"
          ? prune.decision.coverageStatus
          : prune.coverageStatus,
      createdAt: now,
      algorithmVersion: request.algorithmVersion,
    };
  });

  const revision = await deps.revisions.append({
    diagnosisId: request.diagnosisId,
    expectedParentReportId: request.expectedParentReportId,
    revisionReason: request.revisionReason,
    algorithmVersion: request.algorithmVersion,
    canonicalJson: canonicalReportJson(revised),
    prunedClaims: newlyAuditedPrunes.map((prune) => ({
      kind: prune.candidate.claimKind,
      ref: prune.candidate.candidateRef,
      reasonCode:
        pruneReasonFor(prune),
    })),
    pruneDecisions,
    claimPublicationDecisionBatch: {
      expectedCandidates: snapshot.candidates.map((item) => ({
        claimKind: item.claimKind,
        candidateRef: item.candidateRef,
      })),
      decisions,
    },
  });
  return {
    revision,
    candidateDecisionCount: decisions.length,
    newPruneDecisionCount: pruneDecisions.length,
    providerCalls: 0,
  };
}
