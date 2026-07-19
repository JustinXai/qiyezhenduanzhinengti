// Diagnosis orchestration state machine.
//
//   CREATED → VALIDATING → SEARCHING → CRAWLING → NORMALIZING_EVIDENCE
//     → ANALYZING → VALIDATING_REPORT → READY | FAILED
//
// The request row is created as CREATED by the caller (API); this module drives
// every subsequent transition and persists at each step:
//   - status              → diagnosis_requests
//   - evidence            → evidence
//   - provider usage      → provider_usage
//   - stage outputs       → analysis_checkpoints (with reuse lookup on ANALYZING)
//   - canonical report    → reports.canonical_json
//
// The two heavy stages are pulled behind INTEGRATION SEAMs so this file stays
// owned by Agent E while the real search/evidence engine (Agent C) and report
// generator (Agent D) are developed independently. Round-1 wires the mocks in
// ./mocks.ts — no real provider or network call ever happens here.

import { createHash, randomUUID } from "node:crypto";
import {
  DiagnosisReport,
  REPORT_CONTRACT_VERSION,
  SCORE_CONTRACT_VERSION,
  type DiagnosisReport as DiagnosisReportType,
  type EvidenceItem,
} from "../../contracts";
import {
  deriveCoverage,
  type ClaimEvidenceRelation,
  type EvidenceCoverage,
} from "../../contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../contracts/independent-support-source";
import type {
  ClaimPublicationDecisionRecordInput,
  DiagnosisStatus,
  AnalysisStage,
  AnalysisStageRunRecord,
  EvidenceRecordInput,
  PruneDecisionRecordInput,
  StorageAdapter,
} from "../../storage/adapter";
import type { AnalysisPruneCandidate } from "../analysis/claims";
import {
  parseDiagnosisInput,
  type DiagnosisInput,
} from "../../runtime/diagnosis-input";
import { publishGuard } from "../../report/validation";
import {
  evaluateClaimPublication,
  negativeScopeTextFromReport,
  publicationSourceContextFromReport,
} from "../../report/validation/claim-publication-policy";
import { independentSupportSourceKeys } from "../../report/validation/independent-support-source";
import { applyClaimPublicationPolicyToReport } from "../../runtime/claim-publication";
import {
  auditAnalysisPrune,
  auditPublicationPrune,
  auditStructuralPrune,
} from "../../runtime/prune-audit";
import {
  createDeterministicVerifier,
  verifyReport,
  type VerifierStrategy,
} from "../verification";

// ---------------------------------------------------------------------------
// Checkpoint identity — fixed for the mock analysis so a repeated run with the
// same input reuses the stored report instead of re-invoking the producer.
// Agent D owns the real provider/prompt/trust-guard versions at integration.
// ---------------------------------------------------------------------------

export const ANALYSIS_PROVIDER_MODEL = "deepseek-v4-flash";
export const ANALYSIS_PROMPT_VERSION = "analysis.v2-prune-audit";
export const ANALYSIS_TRUST_GUARD_VERSION = "trust-guard.v1";
export const CLAIM_PUBLICATION_DECISION_ALGORITHM_VERSION =
  "claim-publication-decision.v1";

// Version of the deterministic Claim–Evidence publish-gate logic. Bumping it
// (or the verifier version) invalidates a stored verification checkpoint.
export const CLAIM_EVIDENCE_GATE_VERSION = "claim-evidence-gate.v1";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PipelineError {
  code: string;
  message: string;
}

export interface ProviderUsageSample {
  provider: string;
  stage: string;
  callCount?: number;
  retryCount?: number;
  errorCode?: string | null;
  costEstimate?: number | null;
}

// ---------------------------------------------------------------------------
// INTEGRATION SEAM (Agent C — search + crawl + evidence normalization).
// Real implementation: src/diagnosis/search, src/diagnosis/evidence,
// src/security/crawler (Agent C's worktree). Round-1 uses ./mocks.ts.
// ---------------------------------------------------------------------------

export interface EvidenceStageContext {
  diagnosisId: string;
  input: DiagnosisInput;
}

export interface StageResult {
  data: unknown;
  usage?: ProviderUsageSample[];
}

export interface NormalizedEvidenceResult {
  evidence: EvidenceItem[];
  usage?: ProviderUsageSample[];
  /**
   * Optional measurement boundary for this run (executed query plan + controlled
   * crawl scope). When omitted, the state machine derives a default from the
   * evidence + the request website. Required to publish negative/missing claims.
   */
  coverage?: EvidenceCoverage;
  /** Current-run provenance hashes; required by REAL analysis stage persistence. */
  analysisProvenance?: {
    evidenceRegistryHash: string;
    competitorResolutionHash: string;
    queryPlanHash: string;
  };
}

export interface EvidencePipeline {
  search(ctx: EvidenceStageContext): Promise<StageResult>;
  crawl(ctx: EvidenceStageContext, searchResult: StageResult): Promise<StageResult>;
  normalize(
    ctx: EvidenceStageContext,
    crawlResult: StageResult,
  ): Promise<NormalizedEvidenceResult>;
}

// ---------------------------------------------------------------------------
// INTEGRATION SEAM (Agent D — report generator).
// Real implementation: src/report/generation assembling the canonical report
// from staged DeepSeek analysis (Agent D's worktree). Round-1 uses ./mocks.ts.
// ---------------------------------------------------------------------------

export interface ReportProducerContext {
  diagnosisId: string;
  publicToken: string;
  input: DiagnosisInput;
  evidence: EvidenceItem[];
  coverage?: EvidenceCoverage;
  persistValidatedAnalysisStage?: (
    stage: ValidatedNormalAnalysisStage,
  ) => Promise<void>;
}

export interface ValidatedNormalAnalysisStage {
  stage: AnalysisStage;
  output: unknown;
  schemaVersion: string;
  promptVersion: string;
  providerModel: string;
}

export type ReportProducerResult =
  | {
      ok: true;
      report: DiagnosisReportType;
      usage?: ProviderUsageSample[];
      prunedCandidates?: AnalysisPruneCandidate[];
    }
  | { ok: false; error: PipelineError };

export interface ReportProducer {
  analysisStageRunPersistence?: "REQUIRED" | "NOT_REQUIRED";
  produce(ctx: ReportProducerContext): Promise<ReportProducerResult>;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface OrchestratorDeps {
  storage: StorageAdapter;
  evidence: EvidencePipeline;
  producer: ReportProducer;
  /**
   * Claim–Evidence semantic verifier. Defaults to the deterministic (zero
   * provider call) verifier; a DeepSeek-backed strategy can be injected here.
   */
  verifier?: VerifierStrategy;
  publicationSourceContext?: ClaimPublicationSourceContext;
  clock?: () => Date;
  idFactory?: () => string;
}

export interface RunPipelineArgs {
  diagnosisId: string;
  publicToken: string;
  /** Raw input; validated inside the VALIDATING stage, not before. */
  input: unknown;
}

export type PipelineResult =
  | { ok: true; status: "READY"; report: DiagnosisReportType }
  | {
      ok: false;
      status: "FAILED";
      failedStage: DiagnosisStatus;
      error: PipelineError;
    };

/** Ordered non-terminal stages the machine walks through on the happy path. */
export const PIPELINE_STAGES: readonly DiagnosisStatus[] = [
  "VALIDATING",
  "SEARCHING",
  "CRAWLING",
  "NORMALIZING_EVIDENCE",
  "ANALYZING",
  "CLAIM_EVIDENCE_VERIFICATION",
  "VALIDATING_REPORT",
  "READY",
] as const;

/** Host(s) the request website belongs to (for coverage first-party scope). */
function firstPartyDomainsOf(website: string): string[] {
  try {
    const h = new URL(website).hostname.toLowerCase();
    return [h.startsWith("www.") ? h.slice(4) : h];
  } catch {
    return [];
  }
}

type PublicationDecisionForStorage = Omit<
  ClaimPublicationDecisionRecordInput,
  "id" | "diagnosisId" | "reportId" | "revisionId"
>;

function reportCandidateItems(
  report: DiagnosisReportType,
  prunedCandidates: readonly AnalysisPruneCandidate[],
): Array<{
  candidateRef: string;
  claimKind: string;
  sourceIssueId: string | null;
  evidenceIds: string[];
}> {
  return [
    ...report.strengths.map((item) => ({
      candidateRef: item.id,
      claimKind: "strength",
      sourceIssueId: null,
      evidenceIds: [...item.evidenceIds],
    })),
    ...report.coreIssues.map((item) => ({
      candidateRef: item.id,
      claimKind: "coreIssue",
      sourceIssueId: null,
      evidenceIds: [...item.evidenceIds],
    })),
    ...report.competitorGaps.map((item) => ({
      candidateRef: item.id,
      claimKind: "competitorGap",
      sourceIssueId: null,
      evidenceIds: [...item.evidenceIds],
    })),
    ...report.geoOpportunities.map((item) => ({
      candidateRef: item.id,
      claimKind: "geoOpportunity",
      sourceIssueId: item.sourceIssueId ?? null,
      evidenceIds: [...item.evidenceIds],
    })),
    ...(report.demonstrationFix
      ? [
          {
            candidateRef: report.demonstrationFix.id,
            claimKind: "demonstrationFix",
            sourceIssueId:
              report.coreIssues.find(
                (issue) => issue.statement === report.demonstrationFix?.currentIssue,
              )?.id ?? null,
            evidenceIds: [...report.demonstrationFix.evidenceIds],
          },
        ]
      : []),
    ...prunedCandidates.map((item) => ({
      candidateRef: item.candidateRef,
      claimKind: item.claimKind,
      sourceIssueId: item.sourceIssueId,
      evidenceIds: [...item.evidenceIds],
    })),
  ];
}

function publishedCandidateRefs(report: DiagnosisReportType): Set<string> {
  return new Set([
    ...report.strengths.map((item) => item.id),
    ...report.coreIssues.map((item) => item.id),
    ...report.competitorGaps.map((item) => item.id),
    ...report.geoOpportunities.map((item) => item.id),
    ...(report.demonstrationFix ? [report.demonstrationFix.id] : []),
  ]);
}

function latestReportClaimsStageRun(
  runs: readonly AnalysisStageRunRecord[],
): AnalysisStageRunRecord | null {
  return (
    runs
      .filter(
        (run) =>
          run.stage === "REPORT_CLAIMS" &&
          run.status === "SUCCEEDED" &&
          run.outputHash !== null,
      )
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0) ||
          b.attempt - a.attempt,
      )[0] ?? null
  );
}

function coverageStatusForStorage(
  value: string,
): PublicationDecisionForStorage["coverageStatus"] {
  return value === "ESTABLISHED"
    ? "ESTABLISHED_AND_BOUNDED"
    : value as PublicationDecisionForStorage["coverageStatus"];
}

function publishedDecisionForCandidate(input: {
  report: DiagnosisReportType;
  candidate: ReturnType<typeof reportCandidateItems>[number];
  relations: readonly ClaimEvidenceRelation[];
  coverage: EvidenceCoverage;
  sourceContext: ClaimPublicationSourceContext;
}): Omit<
  PublicationDecisionForStorage,
  | "stageRunId"
  | "legacyCheckpointId"
  | "candidateSourceProvenance"
  | "candidateSourcePayloadHash"
  | "candidateRef"
  | "claimKind"
  | "evidenceIds"
  | "algorithmVersion"
  | "createdAt"
> {
  if (input.candidate.claimKind === "demonstrationFix") {
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
  const claim = [
    ...input.report.strengths.map((item) => ({
      id: item.id,
      kind: "strength" as const,
      text: `${item.statement} ${item.businessImpact}`,
      evidenceIds: item.evidenceIds,
    })),
    ...input.report.coreIssues.map((item) => ({
      id: item.id,
      kind: "coreIssue" as const,
      text: `${item.statement} ${item.businessImpact} ${item.fixDirection}`,
      evidenceIds: item.evidenceIds,
    })),
    ...input.report.geoOpportunities.map((item) => ({
      id: item.id,
      kind: "geoOpportunity" as const,
      text: `${item.statement} ${item.businessImpact} ${item.customerQuestion} ${item.contentGap}`,
      evidenceIds: item.evidenceIds,
    })),
  ].find(
    (item) =>
      item.id === input.candidate.candidateRef &&
      item.kind === input.candidate.claimKind,
  );
  if (!claim) {
    return {
      publicationStatus: "PUBLISHED",
      reasonCode: "PUBLISHED",
      guardRule: "COMPETITOR_GAP_PUBLISHED",
      directCount: 0,
      partialCount: 0,
      contextCount: 0,
      independentSupportSourceCount: 0,
      coverageStatus: "NOT_REQUIRED",
    };
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
      evidenceIds: claim.evidenceIds,
    },
    relations: input.relations.filter((relation) => relation.claimId === claim.id),
    evidence: input.report.evidence,
    coverage: input.coverage,
    sourceContext: input.sourceContext,
  });
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(",")}}`;
}

function hashInput(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function toPipelineError(code: string, e: unknown): PipelineError {
  return { code, message: e instanceof Error ? e.message : String(e) };
}

function toEvidenceRows(
  diagnosisId: string,
  items: EvidenceItem[],
): EvidenceRecordInput[] {
  return items.map((e) => ({
    id: e.id,
    diagnosisId,
    sourceType: e.sourceType,
    sourceDomain: e.sourceDomain,
    url: e.url,
    title: e.title,
    snippet: e.snippet,
    authorityLevel: e.authorityLevel,
    supportLevel: e.supportLevel,
    fetchedAt: new Date(e.fetchedAt),
  }));
}

/**
 * Drive one diagnosis from just-CREATED to READY (or FAILED). Idempotent stages
 * persist as they go so a caller can inspect progress via the StorageAdapter.
 */
export async function runDiagnosisPipeline(
  deps: OrchestratorDeps,
  args: RunPipelineArgs,
): Promise<PipelineResult> {
  const { storage } = deps;
  const idFactory = deps.idFactory ?? (() => randomUUID());
  const { diagnosisId, publicToken } = args;

  const setStatus = (status: DiagnosisStatus) =>
    storage.updateDiagnosisStatus(diagnosisId, status);

  const recordUsage = async (samples?: ProviderUsageSample[]) => {
    if (!samples) return;
    for (const s of samples) {
      await storage.recordProviderUsage({
        id: idFactory(),
        diagnosisId,
        provider: s.provider,
        stage: s.stage,
        callCount: s.callCount,
        retryCount: s.retryCount,
        errorCode: s.errorCode ?? null,
        costEstimate: s.costEstimate ?? null,
      });
    }
  };

  const fail = async (
    failedStage: DiagnosisStatus,
    error: PipelineError,
  ): Promise<PipelineResult> => {
    await setStatus("FAILED");
    return { ok: false, status: "FAILED", failedStage, error };
  };

  // -- VALIDATING -------------------------------------------------------------
  await setStatus("VALIDATING");
  const parsed = parseDiagnosisInput(args.input);
  if (!parsed.ok) {
    return fail("VALIDATING", {
      code: "INVALID_INPUT",
      message: parsed.issues
        .map((i) => `${i.path || "(root)"}: ${i.message}`)
        .join("; "),
    });
  }
  const input = parsed.input;
  const ctx: EvidenceStageContext = { diagnosisId, input };

  // -- SEARCHING --------------------------------------------------------------
  await setStatus("SEARCHING");
  let searchResult: StageResult;
  try {
    searchResult = await deps.evidence.search(ctx);
  } catch (e) {
    return fail("SEARCHING", toPipelineError("SEARCH_FAILED", e));
  }
  await recordUsage(searchResult.usage);

  // -- CRAWLING ---------------------------------------------------------------
  await setStatus("CRAWLING");
  let crawlResult: StageResult;
  try {
    crawlResult = await deps.evidence.crawl(ctx, searchResult);
  } catch (e) {
    return fail("CRAWLING", toPipelineError("CRAWL_FAILED", e));
  }
  await recordUsage(crawlResult.usage);

  // -- NORMALIZING_EVIDENCE ---------------------------------------------------
  await setStatus("NORMALIZING_EVIDENCE");
  let normalized: NormalizedEvidenceResult;
  try {
    normalized = await deps.evidence.normalize(ctx, crawlResult);
  } catch (e) {
    return fail("NORMALIZING_EVIDENCE", toPipelineError("NORMALIZE_FAILED", e));
  }
  await recordUsage(normalized.usage);
  await storage.saveEvidence(toEvidenceRows(diagnosisId, normalized.evidence));

  const evidenceIds = normalized.evidence.map((e) => e.id);
  await storage.saveCheckpoint({
    diagnosisId,
    stage: "NORMALIZING_EVIDENCE",
    inputHash: hashInput({ input, evidenceIds }),
    outputJson: JSON.stringify(normalized.evidence),
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    providerModel: "n/a",
    promptVersion: "n/a",
    trustGuardVersion: "n/a",
  });

  const coverage: EvidenceCoverage =
    normalized.coverage ??
    deriveCoverage({
      evidence: normalized.evidence,
      firstPartyDomains: firstPartyDomainsOf(input.website),
    });

  // -- ANALYZING --------------------------------------------------------------
  await setStatus("ANALYZING");
  const analysisKey = {
    diagnosisId,
    stage: "ANALYZING",
    inputHash: hashInput({ input, evidenceIds }),
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    providerModel: ANALYSIS_PROVIDER_MODEL,
    promptVersion: ANALYSIS_PROMPT_VERSION,
    trustGuardVersion: ANALYSIS_TRUST_GUARD_VERSION,
  };

  let report: DiagnosisReportType;
  let analysisPrunedCandidates: AnalysisPruneCandidate[] = [];
  const reusable = await storage.findReusableCheckpoint(analysisKey);
  if (reusable) {
    try {
      const checkpoint = JSON.parse(reusable.outputJson) as {
        report: DiagnosisReportType;
        prunedCandidates?: AnalysisPruneCandidate[];
      };
      report = checkpoint.report;
      analysisPrunedCandidates = checkpoint.prunedCandidates ?? [];
    } catch (e) {
      return fail("ANALYZING", toPipelineError("CHECKPOINT_CORRUPT", e));
    }
  } else {
    let persistValidatedAnalysisStage:
      | ReportProducerContext["persistValidatedAnalysisStage"]
      | undefined;
    if (deps.producer.analysisStageRunPersistence === "REQUIRED") {
      if (
        !normalized.analysisProvenance ||
        !storage.startAnalysisStageRun ||
        !storage.completeAnalysisStageRun ||
        !storage.getAnalysisStageRuns
      ) {
        return fail("ANALYZING", {
          code: "NORMAL_ANALYSIS_STAGE_PERSISTENCE_UNAVAILABLE",
          message:
            "REAL analysis requires current provenance and append-only analysis_stage_runs storage",
        });
      }
      const existingRuns = await storage.getAnalysisStageRuns(diagnosisId);
      const attempts = new Map<AnalysisStage, number>();
      for (const run of existingRuns) {
        attempts.set(run.stage, Math.max(attempts.get(run.stage) ?? 0, run.attempt));
      }
      persistValidatedAnalysisStage = async (stage) => {
        const runId = idFactory();
        const usageId = idFactory();
        const attempt = (attempts.get(stage.stage) ?? 0) + 1;
        attempts.set(stage.stage, attempt);
        const outputJson = JSON.stringify(stage.output);
        const outputHash = createHash("sha256").update(outputJson).digest("hex");
        await storage.recordProviderUsage({
          id: usageId,
          diagnosisId,
          provider: "deepseek",
          stage: stage.stage,
          callCount: 1,
          retryCount: 0,
          errorCode: null,
          costEstimate: null,
        });
        await storage.startAnalysisStageRun!({
          id: runId,
          diagnosisId,
          stage: stage.stage,
          attempt,
          inputHash: hashInput({
            input,
            evidenceIds,
            stage: stage.stage,
            schemaVersion: stage.schemaVersion,
            promptVersion: stage.promptVersion,
            providerModel: stage.providerModel,
          }),
          evidenceRegistryHash: normalized.analysisProvenance!.evidenceRegistryHash,
          competitorResolutionHash:
            normalized.analysisProvenance!.competitorResolutionHash,
          queryPlanHash: normalized.analysisProvenance!.queryPlanHash,
          frozenEvidenceSnapshotHash: null,
          schemaVersion: stage.schemaVersion,
          promptVersion: stage.promptVersion,
          providerModel: stage.providerModel,
        });
        await storage.completeAnalysisStageRun!({
          id: runId,
          outputJson,
          outputHash,
          providerUsageId: usageId,
        });
      };
    }
    let produced: ReportProducerResult;
    try {
      produced = await deps.producer.produce({
        diagnosisId,
        publicToken,
        input,
        evidence: normalized.evidence,
        coverage,
        persistValidatedAnalysisStage,
      });
    } catch (e) {
      return fail("ANALYZING", toPipelineError("ANALYSIS_FAILED", e));
    }
    if (!produced.ok) return fail("ANALYZING", produced.error);
    if (deps.producer.analysisStageRunPersistence !== "REQUIRED") {
      await recordUsage(produced.usage);
    }
    report = produced.report;
    analysisPrunedCandidates = produced.prunedCandidates ?? [];
    await storage.saveCheckpoint({
      ...analysisKey,
      outputJson: JSON.stringify({ report, prunedCandidates: analysisPrunedCandidates }),
    });
  }

  // -- CLAIM_EVIDENCE_VERIFICATION -------------------------------------------
  // Structured semantic verification of every candidate (Claim, Evidence) pair.
  // The verifier (deterministic mock by default; DeepSeek-backed when injected)
  // NEVER decides READY — it only produces ClaimEvidenceRelations, which the
  // deterministic publish guard uses as the sole basis for the §4 decision.
  await setStatus("CLAIM_EVIDENCE_VERIFICATION");
  const verifier = deps.verifier ?? createDeterministicVerifier();
  let relations: ClaimEvidenceRelation[];
  // Checkpoint keyed on the verifier mode+version + gate version; a version bump
  // invalidates the stored relations so they are re-verified (职责 8, test 11).
  const verificationKey = {
    diagnosisId,
    stage: "CLAIM_EVIDENCE_VERIFICATION",
    inputHash: hashInput({ report, coverage }),
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    providerModel: verifier.mode,
    promptVersion: verifier.version,
    trustGuardVersion: CLAIM_EVIDENCE_GATE_VERSION,
  };
  const reusableVerification = await storage.findReusableCheckpoint(verificationKey);
  if (reusableVerification) {
    try {
      relations = JSON.parse(reusableVerification.outputJson) as ClaimEvidenceRelation[];
    } catch (e) {
      return fail(
        "CLAIM_EVIDENCE_VERIFICATION",
        toPipelineError("VERIFICATION_CHECKPOINT_CORRUPT", e),
      );
    }
  } else {
    let verification: Awaited<ReturnType<typeof verifyReport>>;
    try {
      verification = await verifyReport({ report, coverage, strategy: verifier });
    } catch (e) {
      return fail("CLAIM_EVIDENCE_VERIFICATION", toPipelineError("VERIFICATION_FAILED", e));
    }
    // Verifier provider calls count against the budget (职责 8, test 12).
    await recordUsage(verification.usage);
    if (!verification.ok) {
      return fail("CLAIM_EVIDENCE_VERIFICATION", {
        code: "VERIFICATION_ILLEGAL_EVIDENCE",
        message: `verifier referenced evidence ids outside the candidate set: ${verification.illegalEvidenceIds.join(", ")}`,
      });
    }
    relations = verification.relations;
    await storage.saveCheckpoint({
      ...verificationKey,
      outputJson: JSON.stringify(relations),
    });
  }

  // Persist the relations for traceability (additive/optional storage method).
  if (storage.saveClaimEvidenceRelations && relations.length > 0) {
    await storage.saveClaimEvidenceRelations(
      relations.map((r) => ({
        id: idFactory(),
        diagnosisId,
        claimId: r.claimId,
        claimKind: r.claimKind,
        evidenceId: r.evidenceId,
        supportLevel: r.supportLevel,
        confidence: r.confidence,
        justification: r.justification,
        basis: r.basis,
        verifierMode: r.verifierMode,
        verifierVersion: r.verifierVersion,
      })),
    );
  }

  // -- VALIDATING_REPORT ------------------------------------------------------
  await setStatus("VALIDATING_REPORT");
  const validation = DiagnosisReport.safeParse(report);
  if (!validation.success) {
    return fail("VALIDATING_REPORT", {
      code: "REPORT_VALIDATION_FAILED",
      message: validation.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    });
  }
  const canonical = validation.data;
  if (
    canonical.diagnosisId !== diagnosisId ||
    canonical.publicToken !== publicToken
  ) {
    return fail("VALIDATING_REPORT", {
      code: "REPORT_IDENTITY_MISMATCH",
      message:
        "report diagnosisId/publicToken does not match the diagnosis request",
    });
  }

  const sourceContext = publicationSourceContextFromReport(
    canonical,
    coverage,
    deps.publicationSourceContext,
  );
  const publication = applyClaimPublicationPolicyToReport({
    report: canonical,
    relations,
    coverage,
    sourceContext,
  });
  const published = publication.report;
  const reportId = idFactory();
  const stageRunId = `ANALYZING:${analysisKey.inputHash}`;
  const auditCreatedAt = deps.clock?.() ?? new Date();
  const pruneDecisions: PruneDecisionRecordInput[] = [
    ...analysisPrunedCandidates.map((candidate) =>
      auditAnalysisPrune({
        context: {
          id: idFactory(),
          diagnosisId,
          reportId,
          revisionId: null,
          stageRunId,
          createdAt: auditCreatedAt,
        },
        candidate,
      }),
    ),
    ...publication.prunes.map((prune) => {
      const context = {
        id: idFactory(),
        diagnosisId,
        reportId,
        revisionId: null,
        stageRunId,
        createdAt: auditCreatedAt,
      };
      return prune.type === "POLICY"
        ? auditPublicationPrune({ context, candidate: prune.candidate, decision: prune.decision })
        : auditStructuralPrune({
            context,
            candidate: prune.candidate,
            reasonCode: prune.reasonCode,
            guardRule: prune.guardRule,
            coverageStatus: prune.coverageStatus,
          });
    }),
  ];

  if (pruneDecisions.length > 0) {
    if (!storage.appendPruneDecisions) {
      return fail("VALIDATING_REPORT", {
        code: "PRUNE_AUDIT_STORAGE_UNAVAILABLE",
        message: "candidate pruning requires the append-only prune decision ledger",
      });
    }
    try {
      await storage.appendPruneDecisions(pruneDecisions);
    } catch (error) {
      return fail(
        "VALIDATING_REPORT",
        toPipelineError("PRUNE_AUDIT_PERSISTENCE_FAILED", error),
      );
    }
  }

  if (!storage.appendClaimPublicationDecisionBatch) {
    return fail("VALIDATING_REPORT", {
      code: "CLAIM_PUBLICATION_DECISION_STORAGE_UNAVAILABLE",
      message: "normal publication requires the complete candidate decision ledger",
    });
  }
  const reportClaimsStageRun = storage.getAnalysisStageRuns
    ? latestReportClaimsStageRun(await storage.getAnalysisStageRuns(diagnosisId))
    : null;
  const legacyAnalysisCheckpoint =
    reportClaimsStageRun || !storage.getLatestCheckpoint
      ? null
      : await storage.getLatestCheckpoint(diagnosisId, "ANALYZING");
  const candidateSource = reportClaimsStageRun
    ? {
        stageRunId: reportClaimsStageRun.id,
        legacyCheckpointId: null,
        provenance: "ANALYSIS_STAGE_RUN" as const,
        payloadHash: reportClaimsStageRun.outputHash!,
      }
    : legacyAnalysisCheckpoint
      ? {
          stageRunId: null,
          legacyCheckpointId: legacyAnalysisCheckpoint.id,
          provenance: "LEGACY_ANALYSIS_CHECKPOINT" as const,
          payloadHash: createHash("sha256")
            .update(legacyAnalysisCheckpoint.outputJson)
            .digest("hex"),
        }
      : null;
  if (!candidateSource) {
    return fail("VALIDATING_REPORT", {
      code: "CLAIM_PUBLICATION_DECISION_SOURCE_UNAVAILABLE",
      message: "normal publication requires a persisted candidate source",
    });
  }
  const candidateItems = reportCandidateItems(canonical, analysisPrunedCandidates);
  const publishedRefs = publishedCandidateRefs(published);
  const publicationPrunes = new Map(
    publication.prunes.map((item) => [item.candidate.candidateRef, item]),
  );
  const analysisPrunes = new Map(
    analysisPrunedCandidates.map((item) => [item.candidateRef, item]),
  );
  const claimPublicationDecisions: ClaimPublicationDecisionRecordInput[] =
    candidateItems.map((candidate) => {
      const common = {
        id: idFactory(),
        diagnosisId,
        reportId,
        revisionId: null,
        stageRunId: candidateSource.stageRunId,
        legacyCheckpointId: candidateSource.legacyCheckpointId,
        candidateSourceProvenance: candidateSource.provenance,
        candidateSourcePayloadHash: candidateSource.payloadHash,
        candidateRef: candidate.candidateRef,
        claimKind: candidate.claimKind,
        evidenceIds: [...candidate.evidenceIds],
        algorithmVersion: CLAIM_PUBLICATION_DECISION_ALGORITHM_VERSION,
        createdAt: auditCreatedAt,
      };
      if (publishedRefs.has(candidate.candidateRef)) {
        return {
          ...common,
          ...publishedDecisionForCandidate({
            report: published,
            candidate,
            relations,
            coverage,
            sourceContext,
          }),
        };
      }
      const publicationPrune = publicationPrunes.get(candidate.candidateRef);
      if (publicationPrune) {
        if (publicationPrune.type === "POLICY") {
          return {
            ...common,
            publicationStatus: "PRUNED" as const,
            reasonCode: publicationPrune.decision.rule,
            guardRule: publicationPrune.decision.rule,
            directCount: publicationPrune.decision.directCount,
            partialCount: publicationPrune.decision.partialCount,
            contextCount: publicationPrune.decision.contextCount,
            independentSupportSourceCount:
              publicationPrune.decision.independentPartialSourceCount,
            coverageStatus: publicationPrune.decision.coverageStatus,
          };
        }
        const competitorEvidenceIds = publicationPrune.competitorGapDecision
          ? [
              ...publicationPrune.competitorGapDecision.currentCompanyRelationEvidenceIds,
              ...publicationPrune.competitorGapDecision.competitorOfficialRelationEvidenceIds,
            ]
          : [];
        return {
          ...common,
          publicationStatus:
            publicationPrune.competitorGapDecision?.outcome === "DEEP_NEEDS_CONFIRMATION"
              ? "DEEP_NEEDS_CONFIRMATION" as const
              : "PRUNED" as const,
          reasonCode: publicationPrune.reasonCode,
          guardRule: publicationPrune.guardRule,
          directCount: publicationPrune.competitorGapDecision?.directCount ?? 0,
          partialCount: publicationPrune.competitorGapDecision?.partialCount ?? 0,
          contextCount: publicationPrune.competitorGapDecision?.contextCount ?? 0,
          independentSupportSourceCount: independentSupportSourceKeys(
            competitorEvidenceIds,
            published.evidence,
            sourceContext,
          ).length,
          coverageStatus: coverageStatusForStorage(publicationPrune.coverageStatus),
        };
      }
      const analysisPrune = analysisPrunes.get(candidate.candidateRef);
      if (!analysisPrune) {
        return {
          ...common,
          publicationStatus: "PRUNED" as const,
          reasonCode: "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE",
          guardRule: "CLAIM_PUBLICATION_DECISION_UNRESOLVED",
          directCount: 0,
          partialCount: 0,
          contextCount: 0,
          independentSupportSourceCount: 0,
          coverageStatus: "NOT_REQUIRED" as const,
        };
      }
      return {
        ...common,
        publicationStatus: "PRUNED" as const,
        reasonCode: analysisPrune.reasonCode,
        guardRule: analysisPrune.guardRule,
        directCount: 0,
        partialCount: 0,
        contextCount: 0,
        independentSupportSourceCount: 0,
        coverageStatus: analysisPrune.coverageStatus ?? "NOT_REQUIRED",
      };
    });
  try {
    await storage.appendClaimPublicationDecisionBatch({
      expectedCandidates: candidateItems.map((candidate) => ({
        claimKind: candidate.claimKind,
        candidateRef: candidate.candidateRef,
      })),
      decisions: claimPublicationDecisions,
    });
  } catch (error) {
    return fail(
      "VALIDATING_REPORT",
      toPipelineError("CLAIM_PUBLICATION_DECISION_PERSISTENCE_FAILED", error),
    );
  }

  // Agent B publish guard (PRODUCT_TRUTH_RULES §4 evidence support, score
  // cross-field consistency, banned CTA copy). §4 is decided from the verified
  // ClaimEvidenceRelations + coverage, NOT from EvidenceItem.supportLevel. A
  // non-ok result blocks READY — the model output never decides publish.
  const guard = publishGuard({
    report: published,
    relations,
    coverage,
    sourceContext,
  });
  if (!guard.ok) {
    return fail("VALIDATING_REPORT", {
      code: "PUBLISH_GUARD_BLOCKED",
      message: guard.violations
        .map((v) => `${v.rule}${v.claimId ? `(${v.claimId})` : ""}: ${v.message}`)
        .join("; "),
    });
  }

  await storage.saveReport({
    id: reportId,
    diagnosisId,
    reportContractVersion: published.reportContractVersion,
    scoreContractVersion: published.scoreContractVersion,
    canonicalJson: JSON.stringify(published),
  });

  // -- READY ------------------------------------------------------------------
  await setStatus("READY");
  return { ok: true, status: "READY", report: published };
}
