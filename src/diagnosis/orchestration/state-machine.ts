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
  DiagnosisStatus,
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
    let produced: ReportProducerResult;
    try {
      produced = await deps.producer.produce({
        diagnosisId,
        publicToken,
        input,
        evidence: normalized.evidence,
        coverage,
      });
    } catch (e) {
      return fail("ANALYZING", toPipelineError("ANALYSIS_FAILED", e));
    }
    if (!produced.ok) return fail("ANALYZING", produced.error);
    await recordUsage(produced.usage);
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

  const publication = applyClaimPublicationPolicyToReport({
    report: canonical,
    relations,
    coverage,
    sourceContext: deps.publicationSourceContext,
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

  // Agent B publish guard (PRODUCT_TRUTH_RULES §4 evidence support, score
  // cross-field consistency, banned CTA copy). §4 is decided from the verified
  // ClaimEvidenceRelations + coverage, NOT from EvidenceItem.supportLevel. A
  // non-ok result blocks READY — the model output never decides publish.
  const guard = publishGuard({
    report: published,
    relations,
    coverage,
    sourceContext: deps.publicationSourceContext,
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
