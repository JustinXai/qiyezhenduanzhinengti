import { randomUUID } from "node:crypto";
import type {
  AnalysisRecoveryStorage,
  AnalysisStage,
  AnalysisStageRunRecord,
  EvidenceRecord,
  ProviderUsageRecord,
} from "../../../storage/adapter";
import { ANALYSIS_STAGES } from "../../../storage/adapter";
import { AnalysisRepairAuthorization } from "../../../runtime/analysis-repair-authorization";
import { stableHash, stableJson } from "./stable-hash";

const RECOVERABLE_STAGES = ANALYSIS_STAGES.slice(0, 3);
const CLAIMS_STAGE: AnalysisStage = "REPORT_CLAIMS";
const REQUIRED_EVIDENCE_COUNT = 22;

export interface StrictStageValidator<T = unknown> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues?: Array<{ path?: PropertyKey[] }> };
      };
}

export interface AnalysisStageDefinition {
  schemaVersion: string;
  promptVersion: string;
  providerModel: string;
  validator: StrictStageValidator;
  legacyCheckpoint?: {
    reportContractVersion: string;
    scoreContractVersion: string;
    trustGuardVersion: string;
  };
}

export interface FrozenAnalysisArtifacts {
  /** Must be the current trusted frozen value, not a hash copied from expected. */
  competitorResolution: unknown;
  /** Must be the current trusted frozen value, not reconstructed from a summary. */
  queryPlan: unknown;
  runLockExists: boolean;
}

export interface FrozenAnalysisExpectation {
  diagnosisId: string;
  inputHash: string;
  evidenceRegistryHash: string;
  competitorResolutionHash: string;
  queryPlanHash: string;
  evidenceCount?: number;
  originalFailureStage: "REPORT_CLAIMS_FAILED";
}

export interface AnalysisProviderInvocation {
  rawJson: string;
}

export interface RecoveredAnalysisFinalizationInput {
  diagnosisId: string;
  publicToken: string;
  diagnosisInput: unknown;
  evidence: EvidenceRecord[];
  competitorResolution: unknown;
  queryPlan: unknown;
  outputs: Record<AnalysisStage, unknown>;
}

export interface RecoveredAnalysisFinalizationResult {
  resultState: "READY";
}

export interface ResumeFrozenAnalysisDependencies {
  storage: AnalysisRecoveryStorage;
  authorization: AnalysisRepairAuthorization;
  expected: FrozenAnalysisExpectation;
  loadFrozenArtifacts(): Promise<FrozenAnalysisArtifacts>;
  stages: Record<AnalysisStage, AnalysisStageDefinition>;
  invokeDeepSeekStage(input: {
    diagnosisId: string;
    stage: AnalysisStage;
    stageInput: Readonly<{
      diagnosisInput: unknown;
      evidence: EvidenceRecord[];
      competitorResolution: unknown;
      queryPlan: unknown;
      priorStageOutputs: Partial<Record<AnalysisStage, unknown>>;
    }>;
  }): Promise<AnalysisProviderInvocation>;
  /**
   * Required deterministic continuation seam. It must assemble Canonical,
   * verify Claim–Evidence, run all publication/language guards, save the report,
   * and transition this same diagnosis to READY. It must not create a Diagnosis
   * or invoke any Provider; persisted usage deltas are checked after it returns.
   */
  finalizeRecoveredAnalysis(
    input: RecoveredAnalysisFinalizationInput,
  ): Promise<RecoveredAnalysisFinalizationResult>;
  idFactory?: () => string;
}

export interface FrozenAnalysisRecoveryPlan {
  diagnosisId: string;
  reusedStages: AnalysisStage[];
  rerunStages: AnalysisStage[];
  deepSeekCallCap: number;
  hashes: {
    inputHash: string;
    evidenceRegistryHash: string;
    competitorResolutionHash: string;
    queryPlanHash: string;
  };
}

export interface FrozenAnalysisRecoveryResult extends FrozenAnalysisRecoveryPlan {
  repairAttempt: 1;
  providerUsage: {
    bochaDelta: 0;
    crawlerDelta: 0;
    deepSeekDelta: number;
    retries: 0;
  };
  outputs: Record<AnalysisStage, unknown>;
  resultState: "READY";
}

export class AnalysisRecoveryError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(category);
    this.name = "AnalysisRecoveryError";
    this.category = category;
  }
}

interface PreparedRecovery {
  plan: FrozenAnalysisRecoveryPlan;
  diagnosisInput: unknown;
  evidence: EvidenceRecord[];
  artifacts: FrozenAnalysisArtifacts;
  outputs: Partial<Record<AnalysisStage, unknown>>;
}

function parseJsonStrict(raw: string): unknown {
  const normalized = raw.replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new AnalysisRecoveryError("PROVIDER_EMPTY_FINAL_CONTENT");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new AnalysisRecoveryError("PROVIDER_INVALID_JSON");
  }
}

function validateOutput(
  definition: AnalysisStageDefinition,
  value: unknown,
): unknown {
  const parsed = definition.validator.safeParse(value);
  if (!parsed.success) throw new AnalysisRecoveryError("PROVIDER_SCHEMA_MISMATCH");
  return parsed.data;
}

function safeParseStoredOutput(
  definition: AnalysisStageDefinition,
  run: AnalysisStageRunRecord,
): unknown | undefined {
  if (run.outputJson === null || run.outputHash === null) return undefined;
  try {
    const parsed = parseJsonStrict(run.outputJson);
    if (stableHash(parsed) !== run.outputHash) return undefined;
    return validateOutput(definition, parsed);
  } catch {
    return undefined;
  }
}

export function computeAnalysisStageInputHash(input: {
  diagnosisInput: unknown;
  evidenceRegistryHash: string;
  competitorResolutionHash: string;
  queryPlanHash: string;
  priorStageOutputs: Partial<Record<AnalysisStage, unknown>>;
}): string {
  return stableHash(input);
}

function evidenceForHash(evidence: EvidenceRecord[]): unknown[] {
  return [...evidence]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => ({
      ...item,
      fetchedAt: item.fetchedAt.toISOString(),
    }));
}

export function hashEvidenceRegistry(evidence: EvidenceRecord[]): string {
  return stableHash(evidenceForHash(evidence));
}

function usageTotals(rows: ProviderUsageRecord[]): Record<string, { calls: number; retries: number }> {
  const totals: Record<string, { calls: number; retries: number }> = {};
  for (const row of rows) {
    const key = row.provider.toLowerCase();
    const current = totals[key] ?? { calls: 0, retries: 0 };
    current.calls += row.callCount;
    current.retries += row.retryCount;
    totals[key] = current;
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

async function prepareRecovery(
  deps: ResumeFrozenAnalysisDependencies,
): Promise<PreparedRecovery> {
  const { storage, expected } = deps;
  deps.authorization.assertFor(expected.diagnosisId);
  if (expected.originalFailureStage !== "REPORT_CLAIMS_FAILED") {
    throw new AnalysisRecoveryError("ORIGINAL_FAILURE_STAGE_NOT_AUTHORIZED");
  }
  for (const digest of [
    expected.inputHash,
    expected.evidenceRegistryHash,
    expected.competitorResolutionHash,
    expected.queryPlanHash,
  ]) {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new AnalysisRecoveryError("FROZEN_HASH_NOT_AVAILABLE");
    }
  }

  const diagnosis = await storage.getDiagnosisRequest(expected.diagnosisId);
  if (!diagnosis || diagnosis.id !== expected.diagnosisId) {
    throw new AnalysisRecoveryError("DIAGNOSIS_ID_MISMATCH");
  }
  if ((await storage.getAnalysisRepairAttempts(expected.diagnosisId)).length !== 0) {
    throw new AnalysisRecoveryError("REPAIR_ATTEMPT_ALREADY_EXISTS");
  }
  if (diagnosis.status !== "FAILED") {
    throw new AnalysisRecoveryError("DIAGNOSIS_NOT_FAILED");
  }

  let diagnosisInput: unknown;
  try {
    diagnosisInput = JSON.parse(diagnosis.inputJson);
  } catch {
    throw new AnalysisRecoveryError("DIAGNOSIS_INPUT_INVALID");
  }
  const evidence = await storage.getEvidence(expected.diagnosisId);
  const artifacts = await deps.loadFrozenArtifacts();
  if (!artifacts.runLockExists) throw new AnalysisRecoveryError("RUN_LOCK_MISSING");
  if (
    artifacts.competitorResolution === null ||
    typeof artifacts.competitorResolution !== "object"
  ) {
    throw new AnalysisRecoveryError("COMPETITOR_RESOLUTION_MISSING");
  }
  if (artifacts.queryPlan === null || typeof artifacts.queryPlan !== "object") {
    throw new AnalysisRecoveryError("QUERY_PLAN_MISSING");
  }

  const hashes = {
    inputHash: stableHash(diagnosisInput),
    evidenceRegistryHash: hashEvidenceRegistry(evidence),
    competitorResolutionHash: stableHash(artifacts.competitorResolution),
    queryPlanHash: stableHash(artifacts.queryPlan),
  };
  if (hashes.inputHash !== expected.inputHash) {
    throw new AnalysisRecoveryError("INPUT_HASH_MISMATCH");
  }
  if (evidence.length !== (expected.evidenceCount ?? REQUIRED_EVIDENCE_COUNT)) {
    throw new AnalysisRecoveryError("EVIDENCE_COUNT_MISMATCH");
  }
  if (hashes.evidenceRegistryHash !== expected.evidenceRegistryHash) {
    throw new AnalysisRecoveryError("EVIDENCE_HASH_MISMATCH");
  }
  if (hashes.competitorResolutionHash !== expected.competitorResolutionHash) {
    throw new AnalysisRecoveryError("COMPETITOR_RESOLUTION_HASH_MISMATCH");
  }
  if (hashes.queryPlanHash !== expected.queryPlanHash) {
    throw new AnalysisRecoveryError("QUERY_PLAN_HASH_MISMATCH");
  }

  const outputs: Partial<Record<AnalysisStage, unknown>> = {};
  const reusedStages: AnalysisStage[] = [];
  const rerunStages: AnalysisStage[] = [];

  for (const stage of RECOVERABLE_STAGES) {
    const definition = deps.stages[stage];
    const inputHash = computeAnalysisStageInputHash({
      diagnosisInput,
      evidenceRegistryHash: hashes.evidenceRegistryHash,
      competitorResolutionHash: hashes.competitorResolutionHash,
      queryPlanHash: hashes.queryPlanHash,
      priorStageOutputs: outputs,
    });
    const run = await storage.findReusableAnalysisStageRun({
      diagnosisId: expected.diagnosisId,
      stage,
      inputHash,
      evidenceRegistryHash: hashes.evidenceRegistryHash,
      competitorResolutionHash: hashes.competitorResolutionHash,
      queryPlanHash: hashes.queryPlanHash,
      schemaVersion: definition.schemaVersion,
      promptVersion: definition.promptVersion,
      providerModel: definition.providerModel,
    });
    let output = run ? safeParseStoredOutput(definition, run) : undefined;

    if (output === undefined && definition.legacyCheckpoint) {
      const legacy = await storage.findReusableCheckpoint({
        diagnosisId: expected.diagnosisId,
        stage,
        inputHash,
        reportContractVersion: definition.legacyCheckpoint.reportContractVersion,
        scoreContractVersion: definition.legacyCheckpoint.scoreContractVersion,
        providerModel: definition.providerModel,
        promptVersion: definition.promptVersion,
        trustGuardVersion: definition.legacyCheckpoint.trustGuardVersion,
      });
      if (legacy) {
        try {
          output = validateOutput(definition, parseJsonStrict(legacy.outputJson));
        } catch {
          output = undefined;
        }
      }
    }

    if (output === undefined) {
      rerunStages.push(stage);
    } else {
      outputs[stage] = output;
      reusedStages.push(stage);
    }
  }

  // Claims always uses the repaired strict schema and is never reused.
  rerunStages.push(CLAIMS_STAGE);
  return {
    diagnosisInput,
    evidence,
    artifacts,
    outputs,
    plan: {
      diagnosisId: expected.diagnosisId,
      reusedStages,
      rerunStages,
      deepSeekCallCap: rerunStages.length,
      hashes,
    },
  };
}

export async function planFrozenEvidenceAnalysisRecovery(
  deps: ResumeFrozenAnalysisDependencies,
): Promise<FrozenAnalysisRecoveryPlan> {
  return (await prepareRecovery(deps)).plan;
}

function sanitizedErrorMetadata(error: unknown): string {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return JSON.stringify({
    errorName: error instanceof Error ? error.name : "UnknownError",
    providerErrorCode: typeof record.code === "string" ? record.code : undefined,
  });
}

function categoryOf(error: unknown): string {
  if (error instanceof AnalysisRecoveryError) return error.category;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : "ANALYSIS_STAGE_FAILED";
}

export async function resumeAnalysisFromFrozenEvidence(
  deps: ResumeFrozenAnalysisDependencies,
): Promise<FrozenAnalysisRecoveryResult> {
  const prepared = await prepareRecovery(deps);
  const { storage, expected } = deps;
  const idFactory = deps.idFactory ?? (() => randomUUID());
  const diagnosisCountBefore = await storage.countDiagnosisRequests();
  const usageBefore = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
  let invoked = 0;

  await storage.beginAnalysisRepairAttempt({
    diagnosisId: expected.diagnosisId,
    repairAttempt: 1,
    originalFailureStage: expected.originalFailureStage,
    authorizedAt: deps.authorization.authorizedAt,
    reusedStages: prepared.plan.reusedStages,
    rerunStages: prepared.plan.rerunStages,
  });

  try {
    for (const stage of prepared.plan.rerunStages) {
      if (invoked >= prepared.plan.deepSeekCallCap) {
        throw new AnalysisRecoveryError("DEEPSEEK_BUDGET_EXCEEDED");
      }
      const definition = deps.stages[stage];
      const inputHash = computeAnalysisStageInputHash({
        diagnosisInput: prepared.diagnosisInput,
        evidenceRegistryHash: prepared.plan.hashes.evidenceRegistryHash,
        competitorResolutionHash: prepared.plan.hashes.competitorResolutionHash,
        queryPlanHash: prepared.plan.hashes.queryPlanHash,
        priorStageOutputs: prepared.outputs,
      });
      const runId = idFactory();
      const usageId = idFactory();
      await storage.startAnalysisStageRun({
        id: runId,
        diagnosisId: expected.diagnosisId,
        stage,
        attempt: 1,
        inputHash,
        evidenceRegistryHash: prepared.plan.hashes.evidenceRegistryHash,
        competitorResolutionHash: prepared.plan.hashes.competitorResolutionHash,
        queryPlanHash: prepared.plan.hashes.queryPlanHash,
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
            evidence: prepared.evidence,
            competitorResolution: prepared.artifacts.competitorResolution,
            queryPlan: prepared.artifacts.queryPlan,
            priorStageOutputs: { ...prepared.outputs },
          },
        });
        output = validateOutput(definition, parseJsonStrict(invocation.rawJson));
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
      const outputJson = stableJson(output);
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
        outputJson,
        outputHash: stableHash(output),
        providerUsageId: usageId,
      });
      prepared.outputs[stage] = output;
    }

    for (const stage of ANALYSIS_STAGES) {
      if (prepared.outputs[stage] === undefined) {
        throw new AnalysisRecoveryError("ANALYSIS_OUTPUT_INCOMPLETE");
      }
    }
    const finalization = await deps.finalizeRecoveredAnalysis({
      diagnosisId: expected.diagnosisId,
      publicToken: (await storage.getDiagnosisRequest(expected.diagnosisId))!.publicToken,
      diagnosisInput: prepared.diagnosisInput,
      evidence: prepared.evidence,
      competitorResolution: prepared.artifacts.competitorResolution,
      queryPlan: prepared.artifacts.queryPlan,
      outputs: prepared.outputs as Record<AnalysisStage, unknown>,
    });
    if (finalization.resultState !== "READY") {
      throw new AnalysisRecoveryError("RECOVERY_FINALIZATION_NOT_READY");
    }

    const diagnosis = await storage.getDiagnosisRequest(expected.diagnosisId);
    if (!diagnosis || diagnosis.status !== "READY") {
      throw new AnalysisRecoveryError("RECOVERY_FINALIZATION_STATUS_INVALID");
    }
    if (!(await storage.getReport(expected.diagnosisId))) {
      throw new AnalysisRecoveryError("RECOVERY_FINALIZATION_REPORT_MISSING");
    }
    if ((await storage.countDiagnosisRequests()) !== diagnosisCountBefore) {
      throw new AnalysisRecoveryError("NEW_DIAGNOSIS_CREATED");
    }

    const usageAfter = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
    const bocha = usageDelta(usageBefore, usageAfter, "bocha");
    const crawler = usageDelta(usageBefore, usageAfter, "crawler");
    const deepseek = usageDelta(usageBefore, usageAfter, "deepseek");
    if (bocha.calls !== 0) throw new AnalysisRecoveryError("BOCHA_CALL_DELTA_NONZERO");
    if (crawler.calls !== 0) throw new AnalysisRecoveryError("CRAWLER_CALL_DELTA_NONZERO");
    if (deepseek.calls !== invoked || deepseek.calls > prepared.plan.deepSeekCallCap) {
      throw new AnalysisRecoveryError("DEEPSEEK_BUDGET_MISMATCH");
    }
    if (bocha.retries + crawler.retries + deepseek.retries !== 0) {
      throw new AnalysisRecoveryError("RETRY_DELTA_NONZERO");
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
      providerUsage: {
        bochaDelta: 0,
        crawlerDelta: 0,
        deepSeekDelta: deepseek.calls,
        retries: 0,
      },
      outputs: prepared.outputs as Record<AnalysisStage, unknown>,
      resultState: "READY",
    };
  } catch (error) {
    const current = await storage.getDiagnosisRequest(expected.diagnosisId);
    if (current?.status === "READY") {
      await storage.updateDiagnosisStatus(expected.diagnosisId, "FAILED");
    }
    const failedUsage = usageTotals(await storage.getProviderUsage(expected.diagnosisId));
    const failedDeepSeek = usageDelta(usageBefore, failedUsage, "deepseek");
    await storage.completeAnalysisRepairAttempt({
      diagnosisId: expected.diagnosisId,
      repairAttempt: 1,
      status: "FAILED",
      providerCallDelta: failedDeepSeek.calls,
      resultState: "ANALYSIS_RECOVERY_FAILED",
      failureCategory: categoryOf(error),
    });
    throw error;
  }
}
