import { createHash } from "node:crypto";
import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType } from "../../contracts";
import type { ClaimEvidenceRelation } from "../../contracts/claim-evidence";
import type { EvidenceCoverage } from "../../contracts/claim-evidence";
import type { DroppedClaimRecord } from "../../contracts/claim-reason-codes";
import { ClaimsStageOutput } from "../../diagnosis/analysis/stage-schemas";
import { applyClaimPublicationPolicyToReport } from "../../runtime/claim-publication";
import { pruneReasonForPolicyDecision } from "../../runtime/prune-audit";
import type { PruneDecisionRecordInput } from "../../storage/adapter";
import { ANALYSIS_STAGES, type AnalysisStage } from "../../storage/adapter";
import {
  canonicalReportJson,
  type ReportRevisionRecord,
  type ReportRevisionRepository,
} from "../../storage/report-revisions";

export interface PersistedSuccessfulStageOutput {
  stage: AnalysisStage;
  status: "SUCCEEDED";
  outputJson: string;
  outputHash: string;
}

export interface PersistedRound53FinalizationSource {
  diagnosisId: string;
  stageOutputs: Record<AnalysisStage, PersistedSuccessfulStageOutput>;
  claimEvidenceRelations: ClaimEvidenceRelation[];
}

export interface Round53FinalizationSourceStorage {
  loadPersistedSource(diagnosisId: string): Promise<PersistedRound53FinalizationSource | null>;
}

export interface Round53OfflineFinalizerDependencies {
  sourceStorage: Round53FinalizationSourceStorage;
  revisions: ReportRevisionRepository;
  /** Deterministic assembly only; no Provider seam is accepted by this service. */
  assembleFromPersistedStages(input: {
    diagnosisId: string;
    currentReport: DiagnosisReportType;
    stageOutputs: Readonly<Record<AnalysisStage, unknown>>;
    claimEvidenceRelations: readonly ClaimEvidenceRelation[];
  }): DiagnosisReportType;
  /** Bind current frozen Publish/Frozen/Chinese guards at integration. */
  assertFrozenGuards(input: {
    report: DiagnosisReportType;
    claimEvidenceRelations: readonly ClaimEvidenceRelation[];
  }): void;
  /** Bind the current Quick/Deep/Evidence presentation contract and Quick budget check. */
  assertPresentation(report: DiagnosisReportType): void;
  now?: () => Date;
}

export interface Round53OfflineRefinalizationRequest {
  diagnosisId: string;
  expectedParentReportId: string;
  revisionReason: string;
  algorithmVersion: string;
}

export interface Round53OfflineRefinalizationResult {
  revision: ReportRevisionRecord;
  directQuickIssueIds: string[];
  removedNonDirectIssueIds: string[];
  removedOrphanOpportunityIds: string[];
  demonstrationFixRemoved: boolean;
  deepNeedsConfirmation: string[];
  prunedClaims: DroppedClaimRecord[];
  providerCalls: 0;
}

export const ROUND53_NEEDS_CONFIRMATION_PREFIX =
  "待进一步确认（仅限本次保存的公开证据范围，不作为确定性结论）：";

function persistedFrozenCoverage(report: DiagnosisReportType): EvidenceCoverage {
  const firstParty = report.evidence.filter(
    (item) => item.sourceType === "FIRST_PARTY_EVIDENCE",
  );
  const domains = [...new Set(report.evidence.map((item) => item.sourceDomain.trim().toLowerCase()))]
    .filter(Boolean);
  return {
    queryPlanId: "",
    plannedQueries: [],
    executedQueries: [],
    successfulQueries: [],
    failedQueries: [],
    searchedDomains: domains,
    crawledPages: firstParty.map((item) => item.url),
    crawledFirstPartyUrls: firstParty.map((item) => item.url),
    firstPartyDomains: [...new Set(firstParty.map((item) => item.sourceDomain.trim().toLowerCase()))]
      .filter(Boolean),
    observedEvidenceIds: report.evidence.map((item) => item.id),
    searchWindow: { from: null, to: report.generatedAt },
    coverageLimitations: [
      "仅覆盖本次保存的公开页面和搜索证据，不代表完整搜索覆盖。",
      "历史查询计划不可验证，本次未重新搜索或抓取。",
    ],
    boundaryEstablished: report.evidence.length > 0 && firstParty.length > 0,
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("STAGE_OUTPUT_NOT_JSON_SERIALIZABLE");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function parsePersistedStages(
  source: PersistedRound53FinalizationSource,
): Record<AnalysisStage, unknown> {
  const parsed = {} as Record<AnalysisStage, unknown>;
  for (const stage of ANALYSIS_STAGES) {
    const record = source.stageOutputs[stage];
    if (!record || record.stage !== stage || record.status !== "SUCCEEDED") {
      throw new Error(`PERSISTED_STAGE_NOT_SUCCESSFUL:${stage}`);
    }
    let value: unknown;
    try {
      value = JSON.parse(record.outputJson.replace(/^\uFEFF/, "").trim());
    } catch {
      throw new Error(`PERSISTED_STAGE_INVALID_JSON:${stage}`);
    }
    if (stableHash(value) !== record.outputHash) {
      throw new Error(`PERSISTED_STAGE_HASH_MISMATCH:${stage}`);
    }
    parsed[stage] = value;
  }
  return parsed;
}

function claimKey(value: Record<string, unknown>): string {
  return stableJson({
    ...value,
    evidenceIds: [...(value.evidenceIds as readonly string[])].sort(),
  });
}

function withoutClaimId(value: { id: string } & Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id"));
}

/** Every canonical claim must originate in the immutable REPORT_CLAIMS output. */
function assertClaimsComeFromPersistedStage(
  report: DiagnosisReportType,
  claimsOutput: unknown,
): void {
  const parsed = ClaimsStageOutput.safeParse(claimsOutput);
  if (!parsed.success) throw new Error("PERSISTED_CLAIMS_SCHEMA_MISMATCH");
  const claims = parsed.data;
  const strengthKeys = new Set(
    claims.strengths.map((item) => claimKey(item)),
  );
  const issueKeys = new Set(
    claims.coreIssues.map((item) => claimKey(item)),
  );
  const opportunityKeys = new Set(
    claims.geoOpportunities.map((item) => claimKey(item)),
  );
  const gapKeys = new Set(
    claims.competitorGaps.map((item) => claimKey(item)),
  );

  for (const claim of report.strengths) {
    if (!strengthKeys.has(claimKey(withoutClaimId(claim)))) {
      throw new Error(`CLAIM_NOT_IN_PERSISTED_STAGE:${claim.id}`);
    }
  }
  for (const claim of report.coreIssues) {
    if (!issueKeys.has(claimKey(withoutClaimId(claim)))) {
      throw new Error(`CLAIM_NOT_IN_PERSISTED_STAGE:${claim.id}`);
    }
  }
  for (const claim of report.geoOpportunities) {
    if (!opportunityKeys.has(claimKey(withoutClaimId(claim)))) {
      throw new Error(`CLAIM_NOT_IN_PERSISTED_STAGE:${claim.id}`);
    }
  }
  for (const claim of report.competitorGaps) {
    if (!gapKeys.has(claimKey(withoutClaimId(claim)))) {
      throw new Error(`CLAIM_NOT_IN_PERSISTED_STAGE:${claim.id}`);
    }
  }

  if (report.demonstrationFix !== null) {
    const candidate = claims.demonstrationFix;
    if (
      candidate === null ||
      report.demonstrationFix.fixType !== candidate.assetType ||
      report.demonstrationFix.before !== candidate.beforeStructure ||
      report.demonstrationFix.after !== candidate.afterStructure ||
      report.demonstrationFix.whyBetter !== candidate.whyBetter ||
      report.demonstrationFix.customerConfirmationNeeded !== candidate.confirmationNeeded ||
      report.demonstrationFix.geoTeamDeliverable !== candidate.deliverable ||
      report.demonstrationFix.evidenceIds.some((id) => !candidate.evidenceIds.includes(id)) ||
      !report.coreIssues.some(
        (issue) =>
          issue.id === candidate.sourceIssueId &&
          issue.statement === report.demonstrationFix?.currentIssue,
      )
    ) {
      throw new Error("DEMONSTRATION_FIX_NOT_IN_PERSISTED_STAGE");
    }
  }
}

function assertFrozenNonClaimFields(
  current: DiagnosisReportType,
  candidate: DiagnosisReportType,
): void {
  for (const field of [
    "reportContractVersion",
    "scoreContractVersion",
    "reportLanguage",
    "diagnosisId",
    "publicToken",
    "generatedAt",
    "companyProfile",
    "scores",
    "aiVisibilityTests",
    "evidence",
  ] as const) {
    if (stableJson(candidate[field]) !== stableJson(current[field])) {
      throw new Error(`REFINALIZATION_FROZEN_FIELD_CHANGED:${field}`);
    }
  }
}

/**
 * Zero-Provider refinalization. Its request accepts no report/claim/evidence
 * payload; every content input is loaded from persistence and hash-checked.
 */
export async function refinalizeRound53Report(
  request: Round53OfflineRefinalizationRequest,
  deps: Round53OfflineFinalizerDependencies,
): Promise<Round53OfflineRefinalizationResult> {
  const current = await deps.revisions.getCurrent(request.diagnosisId);
  if (!current) throw new Error("REFINALIZATION_ORIGINAL_REPORT_MISSING");
  if (current.reportId !== request.expectedParentReportId) {
    throw new Error("REFINALIZATION_PARENT_MISMATCH");
  }
  const source = await deps.sourceStorage.loadPersistedSource(request.diagnosisId);
  if (!source || source.diagnosisId !== request.diagnosisId) {
    throw new Error("REFINALIZATION_PERSISTED_SOURCE_MISSING");
  }
  const stages = parsePersistedStages(source);
  const immutableInputHash = stableHash({
    stages,
    claimEvidenceRelations: source.claimEvidenceRelations,
  });
  const assembled = DiagnosisReport.parse(
    deps.assembleFromPersistedStages({
      diagnosisId: request.diagnosisId,
      currentReport: current.canonical,
      stageOutputs: stages,
      claimEvidenceRelations: source.claimEvidenceRelations,
    }),
  );
  if (
    stableHash({ stages, claimEvidenceRelations: source.claimEvidenceRelations }) !==
    immutableInputHash
  ) {
    throw new Error("REFINALIZATION_PERSISTED_INPUT_MUTATED");
  }
  assertFrozenNonClaimFields(current.canonical, assembled);
  assertClaimsComeFromPersistedStage(assembled, stages.REPORT_CLAIMS);

  const publication = applyClaimPublicationPolicyToReport({
    report: assembled,
    relations: source.claimEvidenceRelations,
    coverage: persistedFrozenCoverage(assembled),
    coverageScope: "FROZEN_EVIDENCE",
    preserveNegativeIssuesAsUnresolved: true,
  });
  deps.assertFrozenGuards({
    report: publication.report,
    claimEvidenceRelations: source.claimEvidenceRelations,
  });
  deps.assertPresentation(publication.report);

  const prunedClaims: DroppedClaimRecord[] = publication.prunes.map((prune) => ({
    kind: prune.candidate.claimKind,
    ref: prune.candidate.candidateRef,
    reasonCode:
      prune.type === "POLICY"
        ? pruneReasonForPolicyDecision(prune.decision.rule)
        : prune.reasonCode,
  }));
  const stageRunId = `REPORT_CLAIMS:${source.stageOutputs.REPORT_CLAIMS.outputHash}`;
  const createdAt = deps.now?.() ?? new Date();
  const pruneDecisions: Array<
    Omit<PruneDecisionRecordInput, "id" | "reportId" | "revisionId">
  > = publication.prunes.map((prune) => ({
    diagnosisId: request.diagnosisId,
    stageRunId,
    claimKind: prune.candidate.claimKind,
    candidateRef: prune.candidate.candidateRef,
    sourceIssueId: prune.candidate.sourceIssueId,
    reasonCode:
      prune.type === "POLICY"
        ? pruneReasonForPolicyDecision(prune.decision.rule)
        : prune.reasonCode,
    guardRule: prune.type === "POLICY" ? prune.decision.rule : prune.guardRule,
    evidenceIds: prune.candidate.evidenceIds,
    independentSupportSourceCount:
      prune.type === "POLICY" ? prune.decision.independentPartialSourceCount : 0,
    directCount: prune.type === "POLICY" ? prune.decision.directCount : 0,
    partialCount: prune.type === "POLICY" ? prune.decision.partialCount : 0,
    contextCount: prune.type === "POLICY" ? prune.decision.contextCount : 0,
    coverageStatus:
      prune.type === "POLICY" ? prune.decision.coverageStatus : prune.coverageStatus,
    createdAt,
    algorithmVersion: request.algorithmVersion,
  }));

  const revision = await deps.revisions.append({
    diagnosisId: request.diagnosisId,
    expectedParentReportId: request.expectedParentReportId,
    revisionReason: request.revisionReason,
    algorithmVersion: request.algorithmVersion,
    canonicalJson: canonicalReportJson(publication.report),
    prunedClaims,
    pruneDecisions,
  });
  return {
    revision,
    directQuickIssueIds: publication.publishedIssueIds,
    removedNonDirectIssueIds: publication.removedIssueIds,
    removedOrphanOpportunityIds: publication.removedOpportunityIds,
    demonstrationFixRemoved: publication.demonstrationFixRemoved,
    deepNeedsConfirmation: publication.deepNeedsConfirmation,
    prunedClaims: revision.prunedClaims,
    providerCalls: 0,
  };
}
