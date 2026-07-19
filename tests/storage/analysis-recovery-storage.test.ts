import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  createSqliteStorageAdapter,
  type SqliteStorageAdapter,
} from "../../src/storage/sqlite-adapter";
import { stableHash } from "../../src/diagnosis/orchestration/recovery/stable-hash";

const NOW = new Date("2026-07-19T08:00:00.000Z");
const stageRun = {
  id: "run_1",
  diagnosisId: "diag_repair",
  stage: "REPORT_PROFILE" as const,
  attempt: 1,
  inputHash: "input-hash",
  evidenceRegistryHash: "evidence-hash",
  competitorResolutionHash: "competitor-hash",
  queryPlanHash: "query-hash",
  schemaVersion: "profile.v1",
  promptVersion: "prompt.v1",
  providerModel: "deepseek-v4-flash",
};

describe("analysis recovery storage", () => {
  let db: SqliteDatabase;
  let storage: SqliteStorageAdapter;

  beforeEach(async () => {
    const created = createSqliteStorageAdapter({
      filename: ":memory:",
      now: () => NOW,
      idFactory: () => "generated",
    });
    db = created.db;
    storage = created.adapter;
    await storage.createDiagnosisRequest({
      id: "diag_repair",
      inputJson: "{}",
      publicToken: "private-token",
    });
    await storage.updateDiagnosisStatus("diag_repair", "FAILED");
  });

  afterEach(() => db.close());

  it("commits a validated stage output and reuses it only on the exact provenance", async () => {
    const outputJson = '{"brand":"影石创新"}';
    await storage.startAnalysisStageRun(stageRun);
    await storage.completeAnalysisStageRun({
      id: stageRun.id,
      outputJson,
      outputHash: stableHash(JSON.parse(outputJson)),
      providerUsageId: "usage_1",
    });

    const hit = await storage.findReusableAnalysisStageRun(stageRun);
    expect(hit).toMatchObject({
      id: "run_1",
      status: "SUCCEEDED",
      outputJson,
      providerUsageId: "usage_1",
    });
    expect(
      await storage.findReusableAnalysisStageRun({ ...stageRun, queryPlanHash: "changed" }),
    ).toBeNull();
    expect((await storage.getAnalysisStageRuns("diag_repair"))[0]?.completedAt).toEqual(NOW);
  });

  it("rejects mismatched output hashes and does not mark the run successful", async () => {
    await storage.startAnalysisStageRun(stageRun);
    await expect(
      storage.completeAnalysisStageRun({
        id: stageRun.id,
        outputJson: '{"ok":true}',
        outputHash: "wrong",
        providerUsageId: null,
      }),
    ).rejects.toThrow("hash mismatch");
    expect((await storage.getAnalysisStageRuns("diag_repair"))[0]?.status).toBe("RUNNING");
  });

  it("persists only sanitized failure metadata and never an output", async () => {
    await storage.startAnalysisStageRun(stageRun);
    await storage.failAnalysisStageRun({
      id: stageRun.id,
      errorCategory: "PROVIDER_SCHEMA_MISMATCH",
      errorMetadataJson: JSON.stringify({
        errorName: "ZodError",
        issueCount: 1,
        issuePaths: ["demonstrationFix.currentIssue"],
        Authorization: "Bearer must-not-persist",
        prompt: "complete private prompt",
      }),
      providerUsageId: "usage_failed",
    });
    const row = (await storage.getAnalysisStageRuns("diag_repair"))[0]!;
    expect(row.status).toBe("FAILED");
    expect(row.outputJson).toBeNull();
    expect(row.outputHash).toBeNull();
    expect(row.errorMetadataJson).toContain("issuePaths");
    expect(row.errorMetadataJson).not.toContain("Bearer");
    expect(row.errorMetadataJson).not.toContain("prompt");
  });

  it("keeps the original FAILED diagnosis and atomically permits only repair attempt 1", async () => {
    await storage.beginAnalysisRepairAttempt({
      diagnosisId: "diag_repair",
      repairAttempt: 1,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
      authorizedAt: NOW,
      reusedStages: [],
      rerunStages: ["REPORT_PROFILE", "REPORT_CLAIMS"],
    });
    await expect(
      storage.beginAnalysisRepairAttempt({
        diagnosisId: "diag_repair",
        repairAttempt: 1,
        originalFailureStage: "REPORT_CLAIMS_FAILED",
        authorizedAt: NOW,
        reusedStages: [],
        rerunStages: ["REPORT_CLAIMS"],
      }),
    ).rejects.toThrow("already exists");

    await storage.completeAnalysisRepairAttempt({
      diagnosisId: "diag_repair",
      repairAttempt: 1,
      status: "SUCCEEDED",
      providerCallDelta: 2,
      resultState: "ANALYSIS_STAGES_RECOVERED",
      failureCategory: null,
    });
    const attempts = await storage.getAnalysisRepairAttempts("diag_repair");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "SUCCEEDED",
      providerCallDelta: 2,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
    });
    expect((await storage.getDiagnosisRequest("diag_repair"))?.status).toBe("FAILED");
    expect(await storage.countDiagnosisRequests()).toBe(1);
  });
});
