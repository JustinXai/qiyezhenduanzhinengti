import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AnalysisStage, EvidenceRecordInput } from "../../src/storage/adapter";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  createSqliteStorageAdapter,
  type SqliteStorageAdapter,
} from "../../src/storage/sqlite-adapter";
import { AnalysisRepairAuthorization } from "../../src/runtime/analysis-repair-authorization";
import {
  hashFrozenEvidenceRegistry,
  prepareFrozenEvidenceReanalysis,
  reanalyzeFromFrozenEvidence,
  type FrozenEvidenceReanalysisDependencies,
  type FrozenEvidenceReanalysisExpectation,
} from "../../src/diagnosis/orchestration/recovery/frozen-evidence-reanalysis";
import type { AnalysisStageDefinition } from "../../src/diagnosis/orchestration/recovery/resume-analysis";
import { stableHash } from "../../src/diagnosis/orchestration/recovery/stable-hash";

const DIAGNOSIS_ID = "diag_d9d";
const INPUT = { website: "https://www.insta360.com.cn", brandName: "影石创新" };
const ORDER: AnalysisStage[] = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
  "REPORT_CLAIMS",
];
const DATABASE_HASH = "a".repeat(64);
const RUN_LOCK_HASH = "b".repeat(64);
const CAPTURED_AT = new Date("2026-07-19T08:00:00.000Z");

function evidenceRows(): EvidenceRecordInput[] {
  return Array.from({ length: 22 }, (_, index) => {
    const sourceType =
      index < 6
        ? "FIRST_PARTY_EVIDENCE"
        : index < 20
          ? "OBSERVED_WEB_EVIDENCE"
          : "COMPETITOR_WEB_EVIDENCE";
    return {
      id: `ev_${String(index + 1).padStart(2, "0")}`,
      diagnosisId: DIAGNOSIS_ID,
      sourceType,
      sourceDomain: sourceType === "FIRST_PARTY_EVIDENCE" ? "insta360.com.cn" : `source-${index}.cn`,
      url: `https://example.cn/evidence/${index}`,
      title: `证据 ${index}`,
      snippet: `公开摘要 ${index}`,
      authorityLevel: index < 6 ? "A" : index < 20 ? "C" : "B",
      supportLevel: "CONTEXT_ONLY",
      fetchedAt: CAPTURED_AT,
    };
  });
}

function normalizedEvidence() {
  return evidenceRows().map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceDomain: item.sourceDomain,
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    authorityLevel: item.authorityLevel,
    supportLevel: item.supportLevel,
    fetchedAt: item.fetchedAt.toISOString(),
    language: "zh",
    sourceTier: item.authorityLevel,
  }));
}

function stageDefinitions(): Record<AnalysisStage, AnalysisStageDefinition> {
  return Object.fromEntries(
    ORDER.map((stage) => [
      stage,
      {
        schemaVersion: `${stage}.schema.v1`,
        promptVersion: `${stage}.prompt.v1`,
        providerModel: "deepseek-v4-flash",
        validator: z.object({ stage: z.literal(stage) }).strict(),
      },
    ]),
  ) as unknown as Record<AnalysisStage, AnalysisStageDefinition>;
}

describe("Frozen-Evidence Reanalysis runtime", () => {
  let db: SqliteDatabase;
  let storage: SqliteStorageAdapter;
  let authorization: AnalysisRepairAuthorization;
  let expected: FrozenEvidenceReanalysisExpectation;
  let previousAuthorization: string | undefined;

  beforeEach(async () => {
    previousAuthorization = process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED = "true";
    ({ db, adapter: storage } = createSqliteStorageAdapter({ filename: ":memory:" }));
    await storage.createDiagnosisRequest({
      id: DIAGNOSIS_ID,
      inputJson: JSON.stringify(INPUT),
      publicToken: "private-token",
    });
    await storage.updateDiagnosisStatus(DIAGNOSIS_ID, "FAILED");
    await storage.saveEvidence(evidenceRows());
    const normalized = normalizedEvidence();
    await storage.saveCheckpoint({
      diagnosisId: DIAGNOSIS_ID,
      stage: "NORMALIZING_EVIDENCE",
      inputHash: stableHash({ input: INPUT, evidenceIds: normalized.map((item) => item.id) }),
      outputJson: JSON.stringify(normalized),
      reportContractVersion: "report.v1",
      scoreContractVersion: "score.v1",
      providerModel: "n/a",
      promptVersion: "n/a",
      trustGuardVersion: "n/a",
    });
    expected = {
      diagnosisId: DIAGNOSIS_ID,
      diagnosisInputHash: stableHash(INPUT),
      evidenceRegistryHash: hashFrozenEvidenceRegistry(await storage.getEvidence(DIAGNOSIS_ID)),
      normalizedEvidenceHash: stableHash(normalized),
      evidenceCount: 22,
      databaseFileHash: DATABASE_HASH,
      runLockHash: RUN_LOCK_HASH,
      recoveryContractVersion: "frozen-evidence-reanalysis.v1",
      originalFailureStage: "REPORT_CLAIMS_FAILED",
    };
    authorization = AnalysisRepairAuthorization.fromServerEnvironment(DIAGNOSIS_ID);
  });

  afterEach(() => {
    db.close();
    if (previousAuthorization === undefined) {
      delete process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    } else {
      process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED = previousAuthorization;
    }
  });

  function deps(
    overrides: Partial<FrozenEvidenceReanalysisDependencies> = {},
  ): FrozenEvidenceReanalysisDependencies {
    return {
      storage,
      authorization,
      expected,
      loadFrozenArtifactIdentity: async () => ({
        databaseFileHash: DATABASE_HASH,
        runLockHash: RUN_LOCK_HASH,
      }),
      stages: stageDefinitions(),
      invokeDeepSeekStage: async ({ stage }) => ({ rawJson: JSON.stringify({ stage }) }),
      finalizeRecoveredAnalysis: async ({ diagnosisId }) => {
        await storage.saveReport({
          id: "recovered_report",
          diagnosisId,
          reportContractVersion: "report.v1",
          scoreContractVersion: "score.v1",
          canonicalJson: "{}",
        });
        await storage.updateDiagnosisStatus(diagnosisId, "READY");
        return { resultState: "READY" };
      },
      now: () => CAPTURED_AT,
      ...overrides,
    };
  }

  it("preflights the original input, registry and normalized checkpoint with zero calls or writes", async () => {
    const invoke = vi.fn();
    const plan = await prepareFrozenEvidenceReanalysis(deps({ invokeDeepSeekStage: invoke }));
    expect(plan).toMatchObject({
      diagnosisId: DIAGNOSIS_ID,
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      reusedStages: ["EVIDENCE_REGISTRY"],
      rerunStages: ORDER,
      deepSeekCallCap: 4,
      retries: 0,
    });
    expect(plan.snapshot).toMatchObject({
      queryPlanProvenance: "UNAVAILABLE",
      competitorResolutionProvenance: "UNAVAILABLE",
      evidenceCount: 22,
      firstPartyEvidenceCount: 6,
      observedEvidenceCount: 14,
      competitorEvidenceCount: 2,
      languageDistribution: { zh: 22 },
      sourceTierDistribution: { A: 6, B: 2, C: 14 },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID)).toEqual([]);
    expect(await storage.getAnalysisStageRuns(DIAGNOSIS_ID)).toEqual([]);
  });

  it("runs all four stages sequentially, committing each output before the next call", async () => {
    const seen: AnalysisStage[] = [];
    const invoke = vi.fn(async ({ stage, stageInput }) => {
      const runs = await storage.getAnalysisStageRuns(DIAGNOSIS_ID);
      expect(runs.filter((run) => run.status === "SUCCEEDED")).toHaveLength(seen.length);
      expect(stageInput.priorStageOutputs).toEqual(
        Object.fromEntries(seen.map((completed) => [completed, { stage: completed }])),
      );
      expect(stageInput.coverageMode).toBe("FROZEN_EVIDENCE_SCOPE_ONLY");
      expect(stageInput.competitorResolutionStatus).toBe("UNVERIFIED_LEGACY_STATE");
      expect(stageInput.competitorGaps).toEqual([]);
      seen.push(stage);
      return { rawJson: JSON.stringify({ stage }) };
    });
    const result = await reanalyzeFromFrozenEvidence(deps({ invokeDeepSeekStage: invoke }));
    expect(seen).toEqual(ORDER);
    expect(result.providerUsage).toEqual({
      bochaDelta: 0,
      crawlerDelta: 0,
      deepSeekDelta: 4,
      retries: 0,
    });
    const runs = await storage.getAnalysisStageRuns(DIAGNOSIS_ID);
    expect(runs).toHaveLength(4);
    expect(runs.every((run) => run.status === "SUCCEEDED")).toBe(true);
    expect(runs.every((run) => run.queryPlanHash === null)).toBe(true);
    expect(runs.every((run) => run.competitorResolutionHash === null)).toBe(true);
    expect(runs.every((run) => run.frozenEvidenceSnapshotHash === result.snapshotHash)).toBe(true);
    const attempt = (await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID))[0]!;
    expect(attempt).toMatchObject({
      repairAttempt: 1,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      reusedStages: ["EVIDENCE_REGISTRY"],
      missingHistoricalProvenance: ["QUERY_PLAN_HASH", "COMPETITOR_RESOLUTION_HASH"],
      status: "SUCCEEDED",
      providerCallDelta: 4,
    });
    expect(attempt.frozenEvidenceSnapshotHash).toBe(result.snapshotHash);
    expect(await storage.countDiagnosisRequests()).toBe(1);
  });

  it("stops on the first invalid stage with no retry and preserves prior successes", async () => {
    const invoke = vi.fn(async ({ stage }: { stage: AnalysisStage }) => ({
      rawJson:
        stage === "REPORT_SCORING"
          ? JSON.stringify({ invalid: true })
          : JSON.stringify({ stage }),
    }));
    const finalize = vi.fn();
    await expect(
      reanalyzeFromFrozenEvidence(
        deps({ invokeDeepSeekStage: invoke, finalizeRecoveredAnalysis: finalize }),
      ),
    ).rejects.toMatchObject({ category: "PROVIDER_SCHEMA_MISMATCH" });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(finalize).not.toHaveBeenCalled();
    const runs = await storage.getAnalysisStageRuns(DIAGNOSIS_ID);
    expect(runs.map((run) => [run.stage, run.status])).toEqual([
      ["REPORT_PROFILE", "SUCCEEDED"],
      ["REPORT_SCORING", "FAILED"],
    ]);
    expect(runs[1]).toMatchObject({ outputJson: null, outputHash: null });
    expect((await storage.getProviderUsage(DIAGNOSIS_ID)).map((row) => row.retryCount)).toEqual([
      0,
      0,
    ]);
    expect((await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID))[0]).toMatchObject({
      status: "FAILED",
      providerCallDelta: 2,
      failureCategory: "PROVIDER_SCHEMA_MISMATCH",
    });
  });

  it("hard-stops an identity mismatch before Repair Attempt 1 or an executor call", async () => {
    const invoke = vi.fn();
    await expect(
      reanalyzeFromFrozenEvidence(
        deps({
          expected: { ...expected, normalizedEvidenceHash: "c".repeat(64) },
          invokeDeepSeekStage: invoke,
        }),
      ),
    ).rejects.toMatchObject({ category: "NORMALIZED_EVIDENCE_HASH_MISMATCH" });
    expect(invoke).not.toHaveBeenCalled();
    expect(await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID)).toEqual([]);
    expect(await storage.getProviderUsage(DIAGNOSIS_ID)).toEqual([]);
  });

  it("rejects search/crawl activity added by finalization and returns the diagnosis to FAILED", async () => {
    const finalize = vi.fn(async ({ diagnosisId }) => {
      await storage.recordProviderUsage({
        id: "illegal_bocha",
        diagnosisId,
        provider: "bocha",
        stage: "RECOVERY_FINALIZATION",
        callCount: 1,
        retryCount: 0,
      });
      await storage.saveReport({
        id: "illegal_report",
        diagnosisId,
        reportContractVersion: "report.v1",
        scoreContractVersion: "score.v1",
        canonicalJson: "{}",
      });
      await storage.updateDiagnosisStatus(diagnosisId, "READY");
      return { resultState: "READY" as const };
    });
    await expect(
      reanalyzeFromFrozenEvidence(deps({ finalizeRecoveredAnalysis: finalize })),
    ).rejects.toMatchObject({ category: "UNAUTHORIZED_PROVIDER_CALL_DELTA" });
    expect((await storage.getDiagnosisRequest(DIAGNOSIS_ID))?.status).toBe("FAILED");
    expect((await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID))[0]).toMatchObject({
      status: "FAILED",
      providerCallDelta: 4,
      failureCategory: "UNAUTHORIZED_PROVIDER_CALL_DELTA",
    });
  });
});
