import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FROZEN_EVIDENCE_REANALYSIS_MODE,
  FrozenEvidenceReanalysisRunnerError,
  buildSanitizedFrozenEvidenceReanalysisPlan,
  runFrozenEvidenceReanalysis,
  type FrozenDiagnosisState,
  type FrozenEvidenceReanalysisDependencies,
  type FrozenEvidenceSnapshotV1View,
  type ReanalysisUsage,
} from "../../scripts/frozen-evidence-reanalysis";

const HASH = "a".repeat(64);
const FULL_DIAGNOSIS_ID = "diag_d9d81ba3428f4696b088870ca7416e49";
const AUTH = {
  DIAGNOSIS_RECOVERY_MODE: FROZEN_EVIDENCE_REANALYSIS_MODE,
  TECHNICAL_CANARY_REPAIR_AUTHORIZED: "true",
};
const ZERO: ReanalysisUsage = {
  bochaCalls: 0,
  crawlerCalls: 0,
  deepSeekCalls: 0,
  retries: 0,
};
let originalMode: string | undefined;
let originalAuthorization: string | undefined;

function setProcessValue(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  originalMode = process.env.DIAGNOSIS_RECOVERY_MODE;
  originalAuthorization = process.env.TECHNICAL_CANARY_REPAIR_AUTHORIZED;
  setProcessValue("DIAGNOSIS_RECOVERY_MODE", AUTH.DIAGNOSIS_RECOVERY_MODE);
  setProcessValue(
    "TECHNICAL_CANARY_REPAIR_AUTHORIZED",
    AUTH.TECHNICAL_CANARY_REPAIR_AUTHORIZED,
  );
});

afterEach(() => {
  setProcessValue("DIAGNOSIS_RECOVERY_MODE", originalMode);
  setProcessValue("TECHNICAL_CANARY_REPAIR_AUTHORIZED", originalAuthorization);
});

function snapshot(
  overrides: Partial<FrozenEvidenceSnapshotV1View> = {},
): FrozenEvidenceSnapshotV1View {
  return {
    diagnosisId: FULL_DIAGNOSIS_ID,
    evidenceCount: 22,
    firstPartyEvidenceCount: 6,
    observedEvidenceCount: 14,
    competitorEvidenceCount: 2,
    languageDistribution: { zh: 22, other: 0 },
    sourceTierDistribution: { A: 6, B: 2, C: 14, D: 0, E: 0 },
    diagnosisInputHash: HASH,
    evidenceRegistryHash: "b".repeat(64),
    normalizedEvidenceHash: "c".repeat(64),
    sortedEvidenceIdsHash: "1".repeat(64),
    evidenceUrlsHash: "2".repeat(64),
    databaseFileHash: "d".repeat(64),
    runLockHash: "e".repeat(64),
    capturedAt: "2026-07-19T10:00:00.000Z",
    recoveryContractVersion: "frozen-evidence-reanalysis.v1",
    queryPlanProvenance: "UNAVAILABLE",
    competitorResolutionProvenance: "UNAVAILABLE",
    ...overrides,
  };
}

function diagnosis(overrides: Partial<FrozenDiagnosisState> = {}): FrozenDiagnosisState {
  return {
    diagnosisId: FULL_DIAGNOSIS_ID,
    status: "FAILED",
    phase: "ANALYZING",
    failureCode: "REPORT_CLAIMS_FAILED",
    evidenceCount: 22,
    repairAttemptCount: 0,
    diagnosisCount: 1,
    ...overrides,
  };
}

function deps(options: {
  snap?: FrozenEvidenceSnapshotV1View;
  state?: FrozenDiagnosisState;
  afterSnapshot?: FrozenEvidenceSnapshotV1View;
  usageAfter?: ReanalysisUsage;
  activityAfter?: { evidence: number; searchRecords: number; crawlerRecords: number };
} = {}): FrozenEvidenceReanalysisDependencies & {
  prepareRuntime: ReturnType<typeof vi.fn>;
  executeRuntime: ReturnType<typeof vi.fn>;
  invokeDeepSeekStage: ReturnType<typeof vi.fn>;
  finalizeRecoveredAnalysis: ReturnType<typeof vi.fn>;
  printSanitizedPlan: ReturnType<typeof vi.fn>;
  verifyReportPages: ReturnType<typeof vi.fn>;
} {
  const snap = options.snap ?? snapshot();
  const state = options.state ?? diagnosis();
  let snapshotReads = 0;
  let usageReads = 0;
  let activityReads = 0;
  const runtimeSnapshotHash = "3".repeat(64);
  const invokeDeepSeekStage = vi.fn();
  const finalizeRecoveredAnalysis = vi.fn();
  return {
    loadFrozenEvidenceSnapshot: vi.fn(async () =>
      snapshotReads++ === 0 ? snap : (options.afterSnapshot ?? snap),
    ),
    loadDiagnosis: vi.fn().mockResolvedValue(state),
    prepareRuntime: vi.fn().mockResolvedValue({
      diagnosisId: FULL_DIAGNOSIS_ID,
      recoveryMode: FROZEN_EVIDENCE_REANALYSIS_MODE,
      reusedStages: ["EVIDENCE_REGISTRY"],
      rerunStages: [
        "REPORT_PROFILE",
        "REPORT_SCORING",
        "REPORT_AI_VISIBILITY",
        "REPORT_CLAIMS",
      ],
      deepSeekCallCap: 4,
      retries: 0,
      snapshot: snap,
      snapshotHash: runtimeSnapshotHash,
    }),
    executeRuntime: vi.fn().mockImplementation(async (input) => {
      expect(input.invokeDeepSeekStage).toBe(invokeDeepSeekStage);
      expect(input.finalizeRecoveredAnalysis).toBe(finalizeRecoveredAnalysis);
      return {
        diagnosisId: FULL_DIAGNOSIS_ID,
        finalStatus: "READY",
        repairAttempt: 1,
        originalFailurePreserved: true,
        repairTimeline: ["FAILED", FROZEN_EVIDENCE_REANALYSIS_MODE, "READY"],
      };
    }),
    invokeDeepSeekStage,
    finalizeRecoveredAnalysis,
    readUsage: vi.fn(async () =>
      usageReads++ === 0
        ? ZERO
        : (options.usageAfter ?? { ...ZERO, deepSeekCalls: 4 }),
    ),
    readFrozenActivity: vi.fn(async () =>
      activityReads++ === 0
        ? { evidence: 22, searchRecords: 0, crawlerRecords: 0 }
        : (options.activityAfter ?? { evidence: 22, searchRecords: 0, crawlerRecords: 0 }),
    ),
    readDiagnosisCount: vi.fn().mockResolvedValue(state.diagnosisCount),
    readPublicApiPayload: vi.fn().mockResolvedValue({
      diagnosisId: FULL_DIAGNOSIS_ID,
      status: "READY",
      report: {},
    }),
    verifyReportPages: vi.fn().mockResolvedValue({
      quickRendered: true,
      deepRendered: true,
      evidenceRendered: true,
      reportLanguage: "zh-CN",
      quickCharacterCount: 1750,
      mobileViewportWidth: 390,
      mobileHorizontalOverflow: false,
      evidenceCount: 22,
    }),
    printSanitizedPlan: vi.fn(),
  };
}

async function expectBlocked(
  dependencies: ReturnType<typeof deps>,
  code: string,
  env: Readonly<Record<string, string | undefined>> = AUTH,
): Promise<void> {
  setProcessValue("DIAGNOSIS_RECOVERY_MODE", env.DIAGNOSIS_RECOVERY_MODE);
  setProcessValue(
    "TECHNICAL_CANARY_REPAIR_AUTHORIZED",
    env.TECHNICAL_CANARY_REPAIR_AUTHORIZED,
  );
  await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toMatchObject({ code });
  expect(dependencies.prepareRuntime).not.toHaveBeenCalled();
  expect(dependencies.executeRuntime).not.toHaveBeenCalled();
}

describe("Frozen-Evidence Reanalysis preflight", () => {
  it("requires both the explicit mode and exact process authorization", async () => {
    await expectBlocked(deps(), "REANALYSIS_MODE_REQUIRED", {});
    await expectBlocked(
      deps(),
      "REANALYSIS_NOT_AUTHORIZED",
      { DIAGNOSIS_RECOVERY_MODE: FROZEN_EVIDENCE_REANALYSIS_MODE },
    );
    await expectBlocked(
      deps(),
      "REANALYSIS_NOT_AUTHORIZED",
      {
        DIAGNOSIS_RECOVERY_MODE: FROZEN_EVIDENCE_REANALYSIS_MODE,
        TECHNICAL_CANARY_REPAIR_AUTHORIZED: "TRUE",
      },
    );
  });

  it("loads only diag_d9d and rejects a different persisted Diagnosis", async () => {
    const dependencies = deps({ state: diagnosis({ diagnosisId: "diag_other" }) });
    await expectBlocked(dependencies, "DIAGNOSIS_MISMATCH");
    expect(dependencies.loadDiagnosis).toHaveBeenCalledWith("diag_d9d");
  });

  it("rejects invalid snapshot version, identity fields, timestamp, and count", async () => {
    await expectBlocked(
      deps({ snap: snapshot({ recoveryContractVersion: "WRONG" as never }) }),
      "SNAPSHOT_VERSION_MISMATCH",
    );
    await expectBlocked(
      deps({ snap: snapshot({ runLockHash: "NOT_AVAILABLE" }) }),
      "SNAPSHOT_HASH_MISSING",
    );
    await expectBlocked(
      deps({ snap: snapshot({ capturedAt: "not-a-date" }) }),
      "SNAPSHOT_CAPTURE_TIME_INVALID",
    );
    await expectBlocked(
      deps({ snap: snapshot({ evidenceCount: 21 }) }),
      "EVIDENCE_COUNT_MISMATCH",
    );
    await expectBlocked(
      deps({ snap: snapshot({ languageDistribution: { zh: 21, other: 0 } }) }),
      "SNAPSHOT_DISTRIBUTION_MISMATCH",
    );
    await expectBlocked(
      deps({ snap: snapshot({ queryPlanProvenance: "OTHER" as never }) }),
      "SNAPSHOT_PROVENANCE_MISMATCH",
    );
  });

  it("requires the exact original failure and zero prior repair attempts", async () => {
    await expectBlocked(
      deps({ state: diagnosis({ failureCode: "OTHER" }) }),
      "ORIGINAL_FAILURE_MISMATCH",
    );
    await expectBlocked(
      deps({ state: diagnosis({ repairAttemptCount: 1 }) }),
      "REPAIR_ATTEMPT_ALREADY_EXISTS",
    );
  });

  it("prints a sanitized four-stage plan without any hash, timestamp, or authorization value", () => {
    const plan = buildSanitizedFrozenEvidenceReanalysisPlan(snapshot(), diagnosis(), AUTH);
    const serialized = JSON.stringify(plan);
    expect(plan.rerunStages).toHaveLength(4);
    expect(plan.providerBudget).toEqual({
      bocha: 0,
      crawler: 0,
      deepSeek: 4,
      retries: 0,
      newDiagnoses: 0,
    });
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain("2026-07-19T10:00:00.000Z");
    expect(serialized).not.toContain("TECHNICAL_CANARY_REPAIR_AUTHORIZED");
  });

  it("rejects a runtime plan that is not exactly four ordered stages with cap 4", async () => {
    const dependencies = deps();
    dependencies.prepareRuntime.mockResolvedValue({
      diagnosisId: FULL_DIAGNOSIS_ID,
      recoveryMode: FROZEN_EVIDENCE_REANALYSIS_MODE,
      reusedStages: ["EVIDENCE_REGISTRY"],
      rerunStages: ["REPORT_CLAIMS"],
      deepSeekCallCap: 1,
      retries: 0,
      snapshot: snapshot(),
      snapshotHash: "3".repeat(64),
    });
    await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toMatchObject({
      code: "RUNTIME_PLAN_MISMATCH",
    });
    expect(dependencies.executeRuntime).not.toHaveBeenCalled();
  });

  it("has no public API, body, URL, or frontend authorization seam", () => {
    const publicFiles = execSync("git ls-files app components src/runtime/api", {
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean);
    for (const file of publicFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain(FROZEN_EVIDENCE_REANALYSIS_MODE);
      expect(source).not.toContain("DIAGNOSIS_RECOVERY_MODE");
      expect(source).not.toContain("frozen-evidence-reanalysis");
    }
  });

  it("direct script execution cannot construct SQLite or Provider clients", () => {
    const source = readFileSync(
      new URL("../../scripts/frozen-evidence-reanalysis.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("openMigratedDatabase");
    expect(source).not.toContain("createSqliteStorageAdapter");
    expect(source).not.toContain("better-sqlite3");
    expect(source).not.toContain("createDeepSeekAdapter");
    expect(source).not.toContain("createBochaAdapter");
  });

  it("direct CLI execution defaults to blocked and performs no injected runtime", () => {
    const execution = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url)),
        fileURLToPath(new URL("../../scripts/frozen-evidence-reanalysis.ts", import.meta.url)),
      ],
      { encoding: "utf8" },
    );
    expect(execution.status).toBe(1);
    expect(execution.stderr).toContain("injected snapshot/runtime/DeepSeek/finalizer seams required");
  });
});

describe("Frozen-Evidence Reanalysis one-shot budgets", () => {
  it("passes Agent R the injected DeepSeek and deterministic finalizer seams once", async () => {
    const dependencies = deps();
    const outcome = await runFrozenEvidenceReanalysis(dependencies);
    expect(dependencies.prepareRuntime).toHaveBeenCalledTimes(1);
    expect(dependencies.executeRuntime).toHaveBeenCalledTimes(1);
    expect(outcome.usageDelta).toEqual({ ...ZERO, deepSeekCalls: 4 });
    expect(outcome.result.finalStatus).toBe("READY");
  });

  it("does not retry Agent R after any runtime failure", async () => {
    const dependencies = deps();
    dependencies.executeRuntime.mockRejectedValueOnce(new Error("stage failed"));
    await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toThrow("stage failed");
    expect(dependencies.executeRuntime).toHaveBeenCalledTimes(1);
  });

  it("rejects Bocha, Crawler, excess DeepSeek, retries, and a new Diagnosis", async () => {
    await expect(
      runFrozenEvidenceReanalysis(deps({ usageAfter: { ...ZERO, bochaCalls: 1 } })),
    ).rejects.toMatchObject({ code: "BOCHA_CALL_FORBIDDEN" });
    await expect(
      runFrozenEvidenceReanalysis(deps({ usageAfter: { ...ZERO, crawlerCalls: 1 } })),
    ).rejects.toMatchObject({ code: "CRAWLER_CALL_FORBIDDEN" });
    await expect(
      runFrozenEvidenceReanalysis(deps({ usageAfter: { ...ZERO, deepSeekCalls: 5 } })),
    ).rejects.toMatchObject({ code: "DEEPSEEK_BUDGET_EXCEEDED" });
    await expect(
      runFrozenEvidenceReanalysis(deps({ usageAfter: { ...ZERO, retries: 1 } })),
    ).rejects.toMatchObject({ code: "AUTOMATIC_RETRY_FORBIDDEN" });
    const changedCount = deps();
    changedCount.readDiagnosisCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await expect(runFrozenEvidenceReanalysis(changedCount)).rejects.toMatchObject({
      code: "NEW_DIAGNOSIS_FORBIDDEN",
    });
  });

  it("detects any mutation of the frozen snapshot", async () => {
    await expect(
      runFrozenEvidenceReanalysis(
        deps({ afterSnapshot: snapshot({ runLockHash: "f".repeat(64) }) }),
      ),
    ).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
  });

  it("rejects new Evidence, search records, and crawler records", async () => {
    await expect(
      runFrozenEvidenceReanalysis(
        deps({ activityAfter: { evidence: 23, searchRecords: 0, crawlerRecords: 0 } }),
      ),
    ).rejects.toMatchObject({ code: "NEW_EVIDENCE_FORBIDDEN" });
    await expect(
      runFrozenEvidenceReanalysis(
        deps({ activityAfter: { evidence: 22, searchRecords: 1, crawlerRecords: 0 } }),
      ),
    ).rejects.toMatchObject({ code: "NEW_SEARCH_RECORD_FORBIDDEN" });
    await expect(
      runFrozenEvidenceReanalysis(
        deps({ activityAfter: { evidence: 22, searchRecords: 0, crawlerRecords: 1 } }),
      ),
    ).rejects.toMatchObject({ code: "NEW_CRAWLER_RECORD_FORBIDDEN" });
  });

  it("requires original failure history, repair attempt 1, timeline, and READY", async () => {
    for (const [change, code] of [
      [{ originalFailurePreserved: false }, "ORIGINAL_FAILURE_NOT_PRESERVED"],
      [{ repairAttempt: 2 }, "REPAIR_ATTEMPT_MISMATCH"],
      [{ repairTimeline: ["READY"] }, "REPAIR_TIMELINE_MISSING"],
      [{ finalStatus: "FAILED" }, "FINAL_STATE_NOT_READY"],
      [{ diagnosisId: "diag_other" }, "RUNTIME_RESULT_DIAGNOSIS_MISMATCH"],
    ] as const) {
      const dependencies = deps();
      dependencies.executeRuntime.mockResolvedValue(Object.assign({
        diagnosisId: FULL_DIAGNOSIS_ID,
        finalStatus: "READY",
        repairAttempt: 1,
        originalFailurePreserved: true,
        repairTimeline: ["FAILED", FROZEN_EVIDENCE_REANALYSIS_MODE, "READY"],
      }, change));
      await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toMatchObject({ code });
    }
  });
});

describe("public and page verification", () => {
  it("rejects all recovery/reanalysis internals in the ordinary public API", async () => {
    const dependencies = deps();
    dependencies.readPublicApiPayload = vi.fn().mockResolvedValue({
      diagnosisId: FULL_DIAGNOSIS_ID,
      status: "READY",
      rerunStages: ["REPORT_CLAIMS"],
    });
    await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toBeInstanceOf(
      FrozenEvidenceReanalysisRunnerError,
    );

    const hashLeak = deps();
    hashLeak.readPublicApiPayload = vi.fn().mockResolvedValue({
      diagnosisId: FULL_DIAGNOSIS_ID,
      note: "b".repeat(64),
    });
    await expect(runFrozenEvidenceReanalysis(hashLeak)).rejects.toMatchObject({
      code: "PUBLIC_API_REANALYSIS_LEAK",
    });
  });

  it("verifies Quick, Deep, Evidence, zh-CN, 390px, length, overflow, and 22 Evidence", async () => {
    const dependencies = deps();
    const outcome = await runFrozenEvidenceReanalysis(dependencies);
    expect(dependencies.verifyReportPages).toHaveBeenCalledWith(FULL_DIAGNOSIS_ID);
    expect(outcome.pages).toMatchObject({
      quickRendered: true,
      deepRendered: true,
      evidenceRendered: true,
      reportLanguage: "zh-CN",
      mobileViewportWidth: 390,
      mobileHorizontalOverflow: false,
      evidenceCount: 22,
    });
  });

  it("fails each customer-facing page invariant independently", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ quickRendered: false }, "QUICK_PAGE_MISSING"],
      [{ deepRendered: false }, "DEEP_PAGE_MISSING"],
      [{ evidenceRendered: false }, "EVIDENCE_PAGE_MISSING"],
      [{ reportLanguage: "en-US" }, "REPORT_LANGUAGE_MISMATCH"],
      [{ quickCharacterCount: 1801 }, "QUICK_REPORT_TOO_LONG"],
      [{ mobileViewportWidth: 391 }, "MOBILE_VIEWPORT_NOT_390"],
      [{ mobileHorizontalOverflow: true }, "MOBILE_HORIZONTAL_OVERFLOW"],
      [{ evidenceCount: 21 }, "PUBLIC_EVIDENCE_COUNT_MISMATCH"],
    ];
    for (const [override, code] of cases) {
      const dependencies = deps();
      dependencies.verifyReportPages.mockResolvedValue({
        quickRendered: true,
        deepRendered: true,
        evidenceRendered: true,
        reportLanguage: "zh-CN",
        quickCharacterCount: 1800,
        mobileViewportWidth: 390,
        mobileHorizontalOverflow: false,
        evidenceCount: 22,
        ...override,
      });
      await expect(runFrozenEvidenceReanalysis(dependencies)).rejects.toMatchObject({ code });
    }
  });
});
