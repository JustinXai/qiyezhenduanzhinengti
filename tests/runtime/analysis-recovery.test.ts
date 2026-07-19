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
  AnalysisRecoveryError,
  computeAnalysisStageInputHash,
  hashEvidenceRegistry,
  planFrozenEvidenceAnalysisRecovery,
  resumeAnalysisFromFrozenEvidence,
  type AnalysisStageDefinition,
  type FrozenAnalysisArtifacts,
  type FrozenAnalysisExpectation,
  type ResumeFrozenAnalysisDependencies,
} from "../../src/diagnosis/orchestration/recovery/resume-analysis";
import { stableHash, stableJson } from "../../src/diagnosis/orchestration/recovery/stable-hash";

const DIAGNOSIS_ID = "diag_d9d";
const INPUT = { website: "https://www.insta360.com.cn", brandName: "影石创新" };
const ARTIFACTS: FrozenAnalysisArtifacts = {
  competitorResolution: { status: "UNRESOLVED", candidates: ["GoPro"] },
  queryPlan: { queries: ["影石创新 官网", "Insta360 产品"] },
  runLockExists: true,
};
const ORDER: AnalysisStage[] = [
  "REPORT_PROFILE",
  "REPORT_SCORING",
  "REPORT_AI_VISIBILITY",
  "REPORT_CLAIMS",
];

function definitions(): Record<AnalysisStage, AnalysisStageDefinition> {
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

function evidenceRows(): EvidenceRecordInput[] {
  return Array.from({ length: 22 }, (_, index) => ({
    id: `ev_${String(index + 1).padStart(2, "0")}`,
    diagnosisId: DIAGNOSIS_ID,
    sourceType: index < 6 ? "FIRST_PARTY_EVIDENCE" : "OBSERVED_WEB_EVIDENCE",
    sourceDomain: index < 6 ? "insta360.com.cn" : `source-${index}.example`,
    url: `https://example.com/evidence/${index}`,
    title: `证据 ${index}`,
    snippet: `公开摘要 ${index}`,
    authorityLevel: index < 6 ? "A" : "C",
    supportLevel: null,
    fetchedAt: new Date("2026-07-19T00:00:00.000Z"),
  }));
}

describe("frozen-Evidence analysis recovery", () => {
  let db: SqliteDatabase;
  let storage: SqliteStorageAdapter;
  let expected: FrozenAnalysisExpectation;
  let authorization: AnalysisRepairAuthorization;
  let oldAuthorization: string | undefined;

  beforeEach(async () => {
    oldAuthorization = process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED = "true";
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    storage = created.adapter;
    await storage.createDiagnosisRequest({
      id: DIAGNOSIS_ID,
      inputJson: JSON.stringify(INPUT),
      publicToken: "private-token",
    });
    await storage.updateDiagnosisStatus(DIAGNOSIS_ID, "FAILED");
    await storage.saveEvidence(evidenceRows());
    const storedEvidence = await storage.getEvidence(DIAGNOSIS_ID);
    expected = {
      diagnosisId: DIAGNOSIS_ID,
      inputHash: stableHash(INPUT),
      evidenceRegistryHash: hashEvidenceRegistry(storedEvidence),
      competitorResolutionHash: stableHash(ARTIFACTS.competitorResolution),
      queryPlanHash: stableHash(ARTIFACTS.queryPlan),
      evidenceCount: 22,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
    };
    authorization = AnalysisRepairAuthorization.fromServerEnvironment(DIAGNOSIS_ID);
  });

  afterEach(() => {
    db.close();
    if (oldAuthorization === undefined) {
      delete process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    } else {
      process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED = oldAuthorization;
    }
  });

  function deps(
    overrides: Partial<ResumeFrozenAnalysisDependencies> = {},
  ): ResumeFrozenAnalysisDependencies {
    return {
      storage,
      authorization,
      expected,
      stages: definitions(),
      loadFrozenArtifacts: async () => ARTIFACTS,
      invokeDeepSeekStage: async ({ stage }) => ({
        rawJson: JSON.stringify({ stage }),
      }),
      ...overrides,
    };
  }

  async function persistReusableStages(): Promise<void> {
    const priorStageOutputs: Partial<Record<AnalysisStage, unknown>> = {};
    for (const stage of ORDER.slice(0, 3)) {
      const output = { stage };
      const definition = definitions()[stage];
      const inputHash = computeAnalysisStageInputHash({
        diagnosisInput: INPUT,
        evidenceRegistryHash: expected.evidenceRegistryHash,
        competitorResolutionHash: expected.competitorResolutionHash,
        queryPlanHash: expected.queryPlanHash,
        priorStageOutputs,
      });
      await storage.startAnalysisStageRun({
        id: `forensic_${stage}`,
        diagnosisId: DIAGNOSIS_ID,
        stage,
        attempt: 0,
        inputHash,
        evidenceRegistryHash: expected.evidenceRegistryHash,
        competitorResolutionHash: expected.competitorResolutionHash,
        queryPlanHash: expected.queryPlanHash,
        schemaVersion: definition.schemaVersion,
        promptVersion: definition.promptVersion,
        providerModel: definition.providerModel,
      });
      await storage.completeAnalysisStageRun({
        id: `forensic_${stage}`,
        outputJson: stableJson(output),
        outputHash: stableHash(output),
        providerUsageId: "historic_usage",
      });
      priorStageOutputs[stage] = output;
    }
  }

  it("plans four calls when all analysis stages are unavailable without writing", async () => {
    const invoke = vi.fn();
    const plan = await planFrozenEvidenceAnalysisRecovery(
      deps({ invokeDeepSeekStage: invoke }),
    );
    expect(plan.reusedStages).toEqual([]);
    expect(plan.rerunStages).toEqual(ORDER);
    expect(plan.deepSeekCallCap).toBe(4);
    expect(invoke).not.toHaveBeenCalled();
    expect(await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID)).toEqual([]);
  });

  it("reuses three strictly validated stage runs and always reruns Claims", async () => {
    await persistReusableStages();
    const invoke = vi.fn(async ({ stage }: { stage: AnalysisStage }) => ({
      rawJson: JSON.stringify({ stage }),
    }));
    const result = await resumeAnalysisFromFrozenEvidence(
      deps({ invokeDeepSeekStage: invoke }),
    );
    expect(result.reusedStages).toEqual(ORDER.slice(0, 3));
    expect(result.rerunStages).toEqual(["REPORT_CLAIMS"]);
    expect(result.deepSeekCallCap).toBe(1);
    expect(result.providerUsage).toEqual({
      bochaDelta: 0,
      crawlerDelta: 0,
      deepSeekDelta: 1,
      retries: 0,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect((await storage.getDiagnosisRequest(DIAGNOSIS_ID))?.status).toBe("FAILED");
    expect(await storage.countDiagnosisRequests()).toBe(1);
    expect((await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID))[0]).toMatchObject({
      status: "SUCCEEDED",
      originalFailureStage: "REPORT_CLAIMS_FAILED",
      providerCallDelta: 1,
    });
  });

  it("runs each missing stage exactly once with no retry and persists each success", async () => {
    const invoke = vi.fn(async ({ stage }: { stage: AnalysisStage }) => ({
      rawJson: JSON.stringify({ stage }),
    }));
    const result = await resumeAnalysisFromFrozenEvidence(
      deps({ invokeDeepSeekStage: invoke }),
    );
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(result.providerUsage.deepSeekDelta).toBe(4);
    const usage = await storage.getProviderUsage(DIAGNOSIS_ID);
    expect(usage).toHaveLength(4);
    expect(usage.every((row) => row.provider === "deepseek" && row.retryCount === 0)).toBe(true);
    const runs = await storage.getAnalysisStageRuns(DIAGNOSIS_ID);
    expect(runs).toHaveLength(4);
    expect(runs.every((run) => run.status === "SUCCEEDED" && run.outputJson)).toBe(true);
  });

  it("fails closed on missing frozen competitor/query data before a call or repair row", async () => {
    const invoke = vi.fn();
    await expect(
      resumeAnalysisFromFrozenEvidence(
        deps({
          loadFrozenArtifacts: async () => ({
            competitorResolution: undefined,
            queryPlan: undefined,
            runLockExists: true,
          }),
          invokeDeepSeekStage: invoke,
        }),
      ),
    ).rejects.toMatchObject({ category: "COMPETITOR_RESOLUTION_MISSING" });
    expect(invoke).not.toHaveBeenCalled();
    expect(await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID)).toEqual([]);
  });

  it("rejects changed Evidence, input, and missing run-lock before any call", async () => {
    const invoke = vi.fn();
    for (const changed of [
      { expected: { ...expected, evidenceRegistryHash: "changed" } },
      { expected: { ...expected, inputHash: "changed" } },
      { loadFrozenArtifacts: async () => ({ ...ARTIFACTS, runLockExists: false }) },
    ]) {
      await expect(
        planFrozenEvidenceAnalysisRecovery(deps({ ...changed, invokeDeepSeekStage: invoke })),
      ).rejects.toBeInstanceOf(AnalysisRecoveryError);
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID)).toEqual([]);
  });

  it("stores no invalid output or raw response and does not retry schema failure", async () => {
    const invoke = vi.fn(async () => ({
      rawJson: JSON.stringify({
        unexpected: "secret raw response must not persist",
        Authorization: "Bearer secret",
      }),
    }));
    await expect(
      resumeAnalysisFromFrozenEvidence(deps({ invokeDeepSeekStage: invoke })),
    ).rejects.toMatchObject({ category: "PROVIDER_SCHEMA_MISMATCH" });
    expect(invoke).toHaveBeenCalledTimes(1);
    const runs = await storage.getAnalysisStageRuns(DIAGNOSIS_ID);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "FAILED",
      outputJson: null,
      outputHash: null,
      errorCategory: "PROVIDER_SCHEMA_MISMATCH",
    });
    expect(runs[0]!.errorMetadataJson).not.toContain("secret raw response");
    expect(runs[0]!.errorMetadataJson).not.toContain("Bearer");
    const attempt = (await storage.getAnalysisRepairAttempts(DIAGNOSIS_ID))[0]!;
    expect(attempt.status).toBe("FAILED");
    expect(attempt.providerCallDelta).toBe(1);
  });

  it("rejects a second repair before invocation", async () => {
    await resumeAnalysisFromFrozenEvidence(deps());
    const invoke = vi.fn();
    await expect(
      resumeAnalysisFromFrozenEvidence(deps({ invokeDeepSeekStage: invoke })),
    ).rejects.toMatchObject({ category: "REPAIR_ATTEMPT_ALREADY_EXISTS" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("cannot construct authorization when the server environment is not enabled", () => {
    delete process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
    expect(() => AnalysisRepairAuthorization.fromServerEnvironment(DIAGNOSIS_ID)).toThrow(
      "TECHNICAL_CANARY_REPAIR_NOT_AUTHORIZED",
    );
  });
});
