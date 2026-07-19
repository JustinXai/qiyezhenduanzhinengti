import { randomUUID } from "node:crypto";
import type {
  AnalysisRecoveryStorage,
  AnalysisStage,
  EvidenceRecord,
  ProviderUsageRecord,
} from "../../../storage/adapter";
import { ANALYSIS_STAGES } from "../../../storage/adapter";
import { AnalysisRepairAuthorization } from "../../../runtime/analysis-repair-authorization";
import type { AnalysisStageDefinition } from "./resume-analysis";
import { stableHash, stableJson } from "./stable-hash";
import {
  hashEvidenceUrls,
  hashSortedEvidenceIds,
  parseFrozenEvidenceSnapshotV1,
  RECOVERY_CONTRACT_VERSION,
} from "./frozen-evidence-contract";
import type {
  CompetitorResolutionStatus,
  CoverageMode,
  FrozenEvidenceSnapshotV1,
} from "./frozen-evidence-contract";

export const FROZEN_EVIDENCE_REANALYSIS_STAGES = [...ANALYSIS_STAGES] as const;
export const FROZEN_EVIDENCE_DEEPSEEK_CAP = 4 as const;
export const FROZEN_EVIDENCE_COVERAGE_MODE: CoverageMode = "FROZEN_EVIDENCE_SCOPE_ONLY";
export const FROZEN_EVIDENCE_COMPETITOR_STATUS: CompetitorResolutionStatus =
  "UNVERIFIED_LEGACY_STATE";
export const FROZEN_EVIDENCE_MISSING_PROVENANCE = [
  "QUERY_PLAN_HASH",
  "COMPETITOR_RESOLUTION_HASH",
] as const;

export type RuntimeFrozenEvidenceSnapshotV1 = FrozenEvidenceSnapshotV1;

export interface FrozenEvidenceReanalysisExpectation {
  diagnosisId: string;
  diagnosisInputHash: string;
  evidenceRegistryHash: string;
  normalizedEvidenceHash: string;
  evidenceCount: number;
  databaseFileHash: string;
  runLockHash: string;
  recoveryContractVersion: typeof RECOVERY_CONTRACT_VERSION;
  originalFailureStage: "REPORT_CLAIMS_FAILED";
}

export interface FrozenEvidenceArtifactIdentity {
  /** Hash verified before the recovery database is migrated or opened writable. */
  databaseFileHash: string;
  runLockHash: string;
}

export interface FrozenEvidenceStageInvocation {
  rawJson: string;
}

export interface FrozenEvidenceFinalizationInput {
  diagnosisId: string;
  publicToken: string;
  diagnosisInput: unknown;
  evidenceRegistry: EvidenceRecord[];
  normalizedEvidence: unknown[];
  snapshot: RuntimeFrozenEvidenceSnapshotV1;
  snapshotHash: string;
  coverageMode: typeof FROZEN_EVIDENCE_COVERAGE_MODE;
  competitorResolutionStatus: typeof FROZEN_EVIDENCE_COMPETITOR_STATUS;
  competitorGaps: [];
  outputs: Record<AnalysisStage, unknown>;
}

export interface FrozenEvidenceFinalizationResult {
  resultState: "READY";
}

export interface FrozenEvidenceReanalysisDependencies {
  storage: AnalysisRecoveryStorage;
  authorization: AnalysisRepairAuthorization;
  expected: FrozenEvidenceReanalysisExpectation;
  loadFrozenArtifactIdentity(): Promise<FrozenEvidenceArtifactIdentity>;
  stages: Record<AnalysisStage, AnalysisStageDefinition>;
  invokeDeepSeekStage(input: {
    diagnosisId: string;
    stage: AnalysisStage;
    stageInput: Readonly<{
      diagnosisInput: unknown;
      evidenceRegistry: EvidenceRecord[];
      normalizedEvidence: unknown[];
      frozenEvidenceSnapshot: RuntimeFrozenEvidenceSnapshotV1;
      frozenEvidenceSnapshotHash: string;
      coverageMode: typeof FROZEN_EVIDENCE_COVERAGE_MODE;
      competitorResolutionStatus: typeof FROZEN_EVIDENCE_COMPETITOR_STATUS;
      competitorGaps: [];
      priorStageOutputs: Partial<Record<AnalysisStage, unknown>>;
    }>;
  }): Promise<FrozenEvidenceStageInvocation>;
  /**
   * Required seam: assemble Canonical, run Claim-Evidence verification plus
   * all existing and Frozen-Evidence guards, save the report, and transition
   * this same Diagnosis to READY. It must not invoke a Provider.
   */
  finalizeRecoveredAnalysis(
    input: FrozenEvidenceFinalizationInput,
  ): Promise<FrozenEvidenceFinalizationResult>;
  /** Supervisor injects Q's fixed Insta360 identity assertion at the runner seam. */
  assertSnapshotIdentity?: (snapshot: FrozenEvidenceSnapshotV1) => void;
  now?: () => Date;
  idFactory?: () => string;
}

export interface FrozenEvidenceReanalysisPlan {
  diagnosisId: string;
  recoveryMode: "FROZEN_EVIDENCE_REANALYSIS";
  reusedStages: ["EVIDENCE_REGISTRY"];
  rerunStages: AnalysisStage[];
  deepSeekCallCap: 4;
  retries: 0;
  snapshot: RuntimeFrozenEvidenceSnapshotV1;
  snapshotHash: string;
}

export interface FrozenEvidenceReanalysisResult extends FrozenEvidenceReanalysisPlan {
  repairAttempt: 1;
  outputs: Record<AnalysisStage, unknown>;
  providerUsage: {
    bochaDelta: 0;
    crawlerDelta: 0;
    deepSeekDelta: number;
    retries: 0;
  };
  resultState: "READY";
}

export class FrozenEvidenceReanalysisError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(category);
    this.name = "FrozenEvidenceReanalysisError";
    this.category = category;
  }
}

interface PreparedFrozenEvidenceReanalysis {
  plan: FrozenEvidenceReanalysisPlan;
  diagnosisInput: unknown;
  evidenceRegistry: EvidenceRecord[];
  normalizedEvidence: unknown[];
}

function assertSha256(value: string, category: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new FrozenEvidenceReanalysisError(category);
}

function parseJsonStrict(raw: string): unknown {
  const normalized = raw.replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new FrozenEvidenceReanalysisError("PROVIDER_EMPTY_FINAL_CONTENT");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new FrozenEvidenceReanalysisError("PROVIDER_INVALID_JSON");
  }
}

function validateStageOutput(definition: AnalysisStageDefinition, value: unknown): unknown {
  const parsed = definition.validator.safeParse(value);
  if (!parsed.success) throw new FrozenEvidenceReanalysisError("PROVIDER_SCHEMA_MISMATCH");
  return parsed.data;
}

/** Matches the frozen SQL-row hash definition used by Round-5.2B forensics. */
export function hashFrozenEvidenceRegistry(evidence: readonly EvidenceRecord[]): string {
  return stableHash(
    [...evidence]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id,
        diagnosis_id: item.diagnosisId,
        source_type: item.sourceType,
        source_domain: item.sourceDomain,
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        authority_level: item.authorityLevel,
        support_level: item.supportLevel,
        fetched_at: Math.floor(item.fetchedAt.getTime() / 1000),
      })),
  );
}

function distribution(
  values: readonly unknown[],
  field: "language" | "sourceTier",
  keys: readonly string[],
): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) {
    if (value === null || typeof value !== "object") {
      throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_INVALID");
    }
    const key = (value as Record<string, unknown>)[field];
    if (typeof key !== "string" || key.length === 0) {
      throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_METADATA_MISSING");
    }
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizedEvidenceIds(values: readonly unknown[]): string[] {
  return values
    .map((value) => {
      if (value === null || typeof value !== "object") {
        throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_INVALID");
      }
      const id = (value as Record<string, unknown>).id;
      if (typeof id !== "string" || id.length === 0) {
        throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_ID_MISSING");
      }
      return id;
    })
    .sort();
}

function sourceCount(evidence: readonly EvidenceRecord[], sourceType: string): number {
  return evidence.filter((item) => item.sourceType === sourceType).length;
}

function buildSnapshot(input: {
  expected: FrozenEvidenceReanalysisExpectation;
  evidenceRegistry: EvidenceRecord[];
  normalizedEvidence: unknown[];
  capturedAt: Date;
}): RuntimeFrozenEvidenceSnapshotV1 {
  const { expected, evidenceRegistry, normalizedEvidence } = input;
  const ids = [...evidenceRegistry].map((item) => item.id).sort();
  const normalizedIds = normalizedEvidenceIds(normalizedEvidence);
  if (stableJson(ids) !== stableJson(normalizedIds)) {
    throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_IDS_MISMATCH");
  }
  return {
    diagnosisId: expected.diagnosisId,
    diagnosisInputHash: expected.diagnosisInputHash,
    evidenceRegistryHash: expected.evidenceRegistryHash,
    normalizedEvidenceHash: expected.normalizedEvidenceHash,
    evidenceCount: expected.evidenceCount,
    sortedEvidenceIdsHash: hashSortedEvidenceIds(ids),
    evidenceUrlsHash: hashEvidenceUrls(evidenceRegistry.map((item) => item.url)),
    firstPartyEvidenceCount: sourceCount(evidenceRegistry, "FIRST_PARTY_EVIDENCE"),
    observedEvidenceCount: sourceCount(evidenceRegistry, "OBSERVED_WEB_EVIDENCE"),
    competitorEvidenceCount: sourceCount(evidenceRegistry, "COMPETITOR_WEB_EVIDENCE"),
    languageDistribution: distribution(normalizedEvidence, "language", ["zh", "other"]) as {
      zh: number;
      other: number;
    },
    sourceTierDistribution: distribution(normalizedEvidence, "sourceTier", [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]) as { A: number; B: number; C: number; D: number; E: number },
    databaseFileHash: expected.databaseFileHash,
    runLockHash: expected.runLockHash,
    capturedAt: input.capturedAt.toISOString(),
    recoveryContractVersion: expected.recoveryContractVersion,
    queryPlanProvenance: "UNAVAILABLE",
    competitorResolutionProvenance: "UNAVAILABLE",
  };
}

function usageTotals(rows: ProviderUsageRecord[]): Record<string, { calls: number; retries: number }> {
  const totals: Record<string, { calls: number; retries: number }> = {};
  for (const row of rows) {
    const provider = row.provider.toLowerCase();
    const current = totals[provider] ?? { calls: 0, retries: 0 };
    current.calls += row.callCount;
    current.retries += row.retryCount;
    totals[provider] = current;
  }
  return totals;
}

function usageDelta(
  before: Record<string, { calls: number; retries: number }>,
  after: Record<string, { calls: number; retries: number }>,
  provider: string,
): { calls: number; retries: number } {
  return {
    calls: (after[provider]?.calls ?? 0) - (before[provider]?.calls ?? 0),
    retries: (after[provider]?.retries ?? 0) - (before[provider]?.retries ?? 0),
  };
}

function stageInputHash(input: {
  snapshotHash: string;
  stage: AnalysisStage;
  priorStageOutputs: Partial<Record<AnalysisStage, unknown>>;
}): string {
  return stableHash(input);
}

function categoryOf(error: unknown): string {
  if (error instanceof FrozenEvidenceReanalysisError) return error.category;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : "ANALYSIS_STAGE_FAILED";
}

function sanitizedErrorMetadata(error: unknown): string {
  return JSON.stringify({
    errorName: error instanceof Error ? error.name : "UnknownError",
    providerErrorCode: categoryOf(error),
  });
}

async function prepare(
  deps: FrozenEvidenceReanalysisDependencies,
): Promise<PreparedFrozenEvidenceReanalysis> {
  const { expected, storage } = deps;
  deps.authorization.assertFor(expected.diagnosisId);
  if (expected.originalFailureStage !== "REPORT_CLAIMS_FAILED") {
    throw new FrozenEvidenceReanalysisError("ORIGINAL_FAILURE_STAGE_NOT_AUTHORIZED");
  }
  for (const [value, category] of [
    [expected.diagnosisInputHash, "DIAGNOSIS_INPUT_HASH_NOT_AVAILABLE"],
    [expected.evidenceRegistryHash, "EVIDENCE_REGISTRY_HASH_NOT_AVAILABLE"],
    [expected.normalizedEvidenceHash, "NORMALIZED_EVIDENCE_HASH_NOT_AVAILABLE"],
    [expected.databaseFileHash, "DATABASE_FILE_HASH_NOT_AVAILABLE"],
    [expected.runLockHash, "RUN_LOCK_HASH_NOT_AVAILABLE"],
  ] as const) {
    assertSha256(value, category);
  }
  if (expected.evidenceCount <= 0) {
    throw new FrozenEvidenceReanalysisError("EVIDENCE_COUNT_INVALID");
  }

  const artifacts = await deps.loadFrozenArtifactIdentity();
  if (artifacts.databaseFileHash !== expected.databaseFileHash) {
    throw new FrozenEvidenceReanalysisError("DATABASE_FILE_HASH_MISMATCH");
  }
  if (artifacts.runLockHash !== expected.runLockHash) {
    throw new FrozenEvidenceReanalysisError("RUN_LOCK_HASH_MISMATCH");
  }
  const diagnosis = await storage.getDiagnosisRequest(expected.diagnosisId);
  if (!diagnosis || diagnosis.status !== "FAILED") {
    throw new FrozenEvidenceReanalysisError("DIAGNOSIS_NOT_FAILED");
  }
  if ((await storage.getAnalysisRepairAttempts(expected.diagnosisId)).length !== 0) {
    throw new FrozenEvidenceReanalysisError("REPAIR_ATTEMPT_ALREADY_EXISTS");
  }
  let diagnosisInput: unknown;
  try {
    diagnosisInput = JSON.parse(diagnosis.inputJson);
  } catch {
    throw new FrozenEvidenceReanalysisError("DIAGNOSIS_INPUT_INVALID");
  }
  if (stableHash(diagnosisInput) !== expected.diagnosisInputHash) {
    throw new FrozenEvidenceReanalysisError("DIAGNOSIS_INPUT_HASH_MISMATCH");
  }

  const evidenceRegistry = await storage.getEvidence(expected.diagnosisId);
  if (evidenceRegistry.length !== expected.evidenceCount) {
    throw new FrozenEvidenceReanalysisError("EVIDENCE_COUNT_MISMATCH");
  }
  if (hashFrozenEvidenceRegistry(evidenceRegistry) !== expected.evidenceRegistryHash) {
    throw new FrozenEvidenceReanalysisError("EVIDENCE_REGISTRY_HASH_MISMATCH");
  }
  const checkpoint = await storage.getLatestCheckpoint(
    expected.diagnosisId,
    "NORMALIZING_EVIDENCE",
  );
  if (!checkpoint) throw new FrozenEvidenceReanalysisError("NORMALIZED_CHECKPOINT_MISSING");
  const parsedCheckpoint = parseJsonStrict(checkpoint.outputJson);
  if (!Array.isArray(parsedCheckpoint)) {
    throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_INVALID");
  }
  if (parsedCheckpoint.length !== expected.evidenceCount) {
    throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_COUNT_MISMATCH");
  }
  if (stableHash(parsedCheckpoint) !== expected.normalizedEvidenceHash) {
    throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_HASH_MISMATCH");
  }

  const snapshot = parseFrozenEvidenceSnapshotV1(buildSnapshot({
    expected,
    evidenceRegistry,
    normalizedEvidence: parsedCheckpoint,
    capturedAt: (deps.now ?? (() => new Date()))(),
  }));
  deps.assertSnapshotIdentity?.(snapshot);
  const snapshotHash = stableHash(snapshot);
  return {
    diagnosisInput,
    evidenceRegistry,
    normalizedEvidence: parsedCheckpoint,
    plan: {
      diagnosisId: expected.diagnosisId,
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      reusedStages: ["EVIDENCE_REGISTRY"],
      rerunStages: [...FROZEN_EVIDENCE_REANALYSIS_STAGES],
      deepSeekCallCap: FROZEN_EVIDENCE_DEEPSEEK_CAP,
      retries: 0,
      snapshot,
      snapshotHash,
    },
  };
}

/** Read-only preflight. It never creates a repair row or invokes an executor. */
export async function prepareFrozenEvidenceReanalysis(
  deps: FrozenEvidenceReanalysisDependencies,
): Promise<FrozenEvidenceReanalysisPlan> {
  return (await prepare(deps)).plan;
}

/**
 * Runs exactly the four missing analysis stages in order, once each. A stage's
 * validated output is committed before the next executor call is permitted.
 */
export async function reanalyzeFromFrozenEvidence(
  deps: FrozenEvidenceReanalysisDependencies,
): Promise<FrozenEvidenceReanalysisResult> {
  const prepared = await prepare(deps);
  const { storage, expected } = deps;
  const idFactory = deps.idFactory ?? (() => randomUUID());
  const outputs: Partial<Record<AnalysisStage, unknown>> = {};
  const usageBefore = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
  const diagnosisCountBefore = await storage.countDiagnosisRequests();
  let invoked = 0;

  await storage.beginAnalysisRepairAttempt({
    diagnosisId: expected.diagnosisId,
    repairAttempt: 1,
    originalFailureStage: expected.originalFailureStage,
    authorizedAt: deps.authorization.authorizedAt,
    reusedStages: ["EVIDENCE_REGISTRY"],
    rerunStages: [...FROZEN_EVIDENCE_REANALYSIS_STAGES],
    recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
    missingHistoricalProvenance: [...FROZEN_EVIDENCE_MISSING_PROVENANCE],
    frozenEvidenceSnapshotJson: stableJson(prepared.plan.snapshot),
    frozenEvidenceSnapshotHash: prepared.plan.snapshotHash,
  });

  try {
    for (const stage of FROZEN_EVIDENCE_REANALYSIS_STAGES) {
      if (invoked >= FROZEN_EVIDENCE_DEEPSEEK_CAP) {
        throw new FrozenEvidenceReanalysisError("DEEPSEEK_BUDGET_EXCEEDED");
      }
      const definition = deps.stages[stage];
      const runId = idFactory();
      const usageId = idFactory();
      await storage.startAnalysisStageRun({
        id: runId,
        diagnosisId: expected.diagnosisId,
        stage,
        attempt: 1,
        inputHash: stageInputHash({
          snapshotHash: prepared.plan.snapshotHash,
          stage,
          priorStageOutputs: outputs,
        }),
        evidenceRegistryHash: expected.evidenceRegistryHash,
        competitorResolutionHash: null,
        queryPlanHash: null,
        frozenEvidenceSnapshotHash: prepared.plan.snapshotHash,
        schemaVersion: definition.schemaVersion,
        promptVersion: definition.promptVersion,
        providerModel: definition.providerModel,
      });

      invoked += 1;
      let output: unknown;
      try {
        const invocation = await deps.invokeDeepSeekStage({
          diagnosisId: expected.diagnosisId,
          stage,
          stageInput: {
            diagnosisInput: prepared.diagnosisInput,
            evidenceRegistry: prepared.evidenceRegistry,
            normalizedEvidence: prepared.normalizedEvidence,
            frozenEvidenceSnapshot: prepared.plan.snapshot,
            frozenEvidenceSnapshotHash: prepared.plan.snapshotHash,
            coverageMode: FROZEN_EVIDENCE_COVERAGE_MODE,
            competitorResolutionStatus: FROZEN_EVIDENCE_COMPETITOR_STATUS,
            competitorGaps: [],
            priorStageOutputs: { ...outputs },
          },
        });
        output = validateStageOutput(definition, parseJsonStrict(invocation.rawJson));
      } catch (error) {
        await storage.recordProviderUsage({
          id: usageId,
          diagnosisId: expected.diagnosisId,
          provider: "deepseek",
          stage,
          callCount: 1,
          retryCount: 0,
          errorCode: categoryOf(error),
        });
        await storage.failAnalysisStageRun({
          id: runId,
          errorCategory: categoryOf(error),
          errorMetadataJson: sanitizedErrorMetadata(error),
          providerUsageId: usageId,
        });
        throw error;
      }
      await storage.recordProviderUsage({
        id: usageId,
        diagnosisId: expected.diagnosisId,
        provider: "deepseek",
        stage,
        callCount: 1,
        retryCount: 0,
      });
      await storage.completeAnalysisStageRun({
        id: runId,
        outputJson: stableJson(output),
        outputHash: stableHash(output),
        providerUsageId: usageId,
      });
      outputs[stage] = output;
    }

    const finalization = await deps.finalizeRecoveredAnalysis({
      diagnosisId: expected.diagnosisId,
      publicToken: (await storage.getDiagnosisRequest(expected.diagnosisId))!.publicToken,
      diagnosisInput: prepared.diagnosisInput,
      evidenceRegistry: prepared.evidenceRegistry,
      normalizedEvidence: prepared.normalizedEvidence,
      snapshot: prepared.plan.snapshot,
      snapshotHash: prepared.plan.snapshotHash,
      coverageMode: FROZEN_EVIDENCE_COVERAGE_MODE,
      competitorResolutionStatus: FROZEN_EVIDENCE_COMPETITOR_STATUS,
      competitorGaps: [],
      outputs: outputs as Record<AnalysisStage, unknown>,
    });
    if (finalization.resultState !== "READY") {
      throw new FrozenEvidenceReanalysisError("RECOVERY_FINALIZATION_NOT_READY");
    }
    const diagnosis = await storage.getDiagnosisRequest(expected.diagnosisId);
    if (!diagnosis || diagnosis.status !== "READY") {
      throw new FrozenEvidenceReanalysisError("RECOVERY_FINALIZATION_STATUS_INVALID");
    }
    if (!(await storage.getReport(expected.diagnosisId))) {
      throw new FrozenEvidenceReanalysisError("RECOVERY_FINALIZATION_REPORT_MISSING");
    }
    if ((await storage.countDiagnosisRequests()) !== diagnosisCountBefore) {
      throw new FrozenEvidenceReanalysisError("NEW_DIAGNOSIS_CREATED");
    }
    const evidenceAfter = await storage.getEvidence(expected.diagnosisId);
    if (
      evidenceAfter.length !== expected.evidenceCount ||
      hashFrozenEvidenceRegistry(evidenceAfter) !== expected.evidenceRegistryHash
    ) {
      throw new FrozenEvidenceReanalysisError("FROZEN_EVIDENCE_CHANGED");
    }
    const normalizedAfter = await storage.getLatestCheckpoint(
      expected.diagnosisId,
      "NORMALIZING_EVIDENCE",
    );
    if (
      !normalizedAfter ||
      stableHash(parseJsonStrict(normalizedAfter.outputJson)) !== expected.normalizedEvidenceHash
    ) {
      throw new FrozenEvidenceReanalysisError("NORMALIZED_EVIDENCE_CHANGED");
    }

    const usageAfter = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
    const providers = new Set([...Object.keys(usageBefore), ...Object.keys(usageAfter)]);
    for (const provider of providers) {
      if (provider === "deepseek") continue;
      if (usageDelta(usageBefore, usageAfter, provider).calls !== 0) {
        throw new FrozenEvidenceReanalysisError("UNAUTHORIZED_PROVIDER_CALL_DELTA");
      }
    }
    const bocha = usageDelta(usageBefore, usageAfter, "bocha");
    const crawler = usageDelta(usageBefore, usageAfter, "crawler");
    const deepseek = usageDelta(usageBefore, usageAfter, "deepseek");
    if (bocha.calls !== 0) throw new FrozenEvidenceReanalysisError("BOCHA_CALL_DELTA_NONZERO");
    if (crawler.calls !== 0) throw new FrozenEvidenceReanalysisError("CRAWLER_CALL_DELTA_NONZERO");
    if (deepseek.calls !== invoked || deepseek.calls > FROZEN_EVIDENCE_DEEPSEEK_CAP) {
      throw new FrozenEvidenceReanalysisError("DEEPSEEK_BUDGET_MISMATCH");
    }
    if (bocha.retries + crawler.retries + deepseek.retries !== 0) {
      throw new FrozenEvidenceReanalysisError("RETRY_DELTA_NONZERO");
    }

    await storage.completeAnalysisRepairAttempt({
      diagnosisId: expected.diagnosisId,
      repairAttempt: 1,
      status: "SUCCEEDED",
      providerCallDelta: deepseek.calls,
      resultState: "READY",
      failureCategory: null,
    });
    return {
      ...prepared.plan,
      repairAttempt: 1,
      outputs: outputs as Record<AnalysisStage, unknown>,
      providerUsage: {
        bochaDelta: 0,
        crawlerDelta: 0,
        deepSeekDelta: deepseek.calls,
        retries: 0,
      },
      resultState: "READY",
    };
  } catch (error) {
    const current = await storage.getDiagnosisRequest(expected.diagnosisId);
    if (current?.status === "READY") {
      await storage.updateDiagnosisStatus(expected.diagnosisId, "FAILED");
    }
    const usageAfterFailure = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
    const deepseek = usageDelta(usageBefore, usageAfterFailure, "deepseek");
    await storage.completeAnalysisRepairAttempt({
      diagnosisId: expected.diagnosisId,
      repairAttempt: 1,
      status: "FAILED",
      providerCallDelta: deepseek.calls,
      resultState: "ANALYSIS_RECOVERY_FAILED",
      failureCategory: categoryOf(error),
    });
    throw error;
  }
}
