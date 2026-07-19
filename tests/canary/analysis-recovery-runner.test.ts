import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  AnalysisRecoveryRunnerError,
  buildSanitizedRecoveryPlan,
  runAnalysisRecoveryRunner,
  type AnalysisRecoveryRunnerDependencies,
  type FrozenRecoveryPreflight,
  type RecoveryUsage,
} from "../../scripts/resume-analysis-recovery";

const AUTH = { TECHNICAL_CANARY_REPAIR_AUTHORIZED: "true" };
const ZERO: RecoveryUsage = { bochaCalls: 0, crawlerCalls: 0, deepSeekCalls: 0, retries: 0 };

function preflight(overrides: Partial<FrozenRecoveryPreflight> = {}): FrozenRecoveryPreflight {
  const hash = { frozen: "sha256:frozen", current: "sha256:frozen" };
  return {
    diagnosisId: "diag_d9d",
    originalStatus: "FAILED",
    originalPhase: "ANALYZING",
    originalFailureCode: "REPORT_CLAIMS_FAILED",
    runLockExists: true,
    repairAttemptCount: 0,
    diagnosisCount: 2,
    evidenceCount: 22,
    expectedEvidenceCount: 22,
    identities: {
      diagnosisInput: { ...hash },
      evidenceRegistry: { ...hash },
      competitorResolution: { ...hash },
      queryPlan: { ...hash },
    },
    recoverableStages: {
      REPORT_PROFILE: false,
      REPORT_SCORING: false,
      REPORT_AI_VISIBILITY: false,
    },
    ...overrides,
  };
}

function deps(
  pf = preflight(),
  usageAfter: RecoveryUsage = { ...ZERO, deepSeekCalls: 4 },
): AnalysisRecoveryRunnerDependencies & {
  planRecovery: ReturnType<typeof vi.fn>;
  resumeRecovery: ReturnType<typeof vi.fn>;
  printSanitizedPlan: ReturnType<typeof vi.fn>;
} {
  const reusedStages = (["REPORT_PROFILE", "REPORT_SCORING", "REPORT_AI_VISIBILITY"] as const)
    .filter((stage) => pf.recoverableStages[stage]);
  const rerunStages: Array<
    "REPORT_PROFILE" | "REPORT_SCORING" | "REPORT_AI_VISIBILITY" | "REPORT_CLAIMS"
  > = [
    ...(["REPORT_PROFILE", "REPORT_SCORING", "REPORT_AI_VISIBILITY"] as const).filter(
      (stage) => !pf.recoverableStages[stage],
    ),
    "REPORT_CLAIMS",
  ];
  let usageReads = 0;
  return {
    readPreflight: vi.fn().mockResolvedValue(pf),
    planRecovery: vi.fn().mockResolvedValue({
      diagnosisId: pf.diagnosisId,
      reusedStages,
      rerunStages,
      deepSeekCallCap: rerunStages.length,
    }),
    resumeRecovery: vi.fn().mockResolvedValue({
      ok: true,
      finalStatus: "READY",
      repairAttempt: 1,
      originalFailurePreserved: true,
      repairTimeline: ["FAILED", "REPAIR_ATTEMPT", "READY"],
      publicApiPayload: { diagnosisId: "diag_d9d", status: "READY", report: null },
    }),
    readUsage: vi.fn().mockImplementation(async () => (usageReads++ === 0 ? ZERO : usageAfter)),
    readDiagnosisCount: vi.fn().mockResolvedValue(pf.diagnosisCount),
    printSanitizedPlan: vi.fn(),
  };
}

async function expectBlocked(
  d: AnalysisRecoveryRunnerDependencies & { resumeRecovery: ReturnType<typeof vi.fn> },
  code: string,
  env: Readonly<Record<string, string | undefined>> = AUTH,
): Promise<void> {
  await expect(runAnalysisRecoveryRunner(d, env)).rejects.toMatchObject({ code });
  expect(d.resumeRecovery).not.toHaveBeenCalled();
}

describe("analysis recovery planning", () => {
  it("plans four calls when no prior analysis stage is recoverable", () => {
    const plan = buildSanitizedRecoveryPlan(preflight(), AUTH);
    expect(plan.rerunStages).toEqual([
      "REPORT_PROFILE",
      "REPORT_SCORING",
      "REPORT_AI_VISIBILITY",
      "REPORT_CLAIMS",
    ]);
    expect(plan.providerBudget.deepSeek).toBe(4);
  });

  it("plans one call when all three prior stages are recoverable", () => {
    const plan = buildSanitizedRecoveryPlan(
      preflight({
        recoverableStages: {
          REPORT_PROFILE: true,
          REPORT_SCORING: true,
          REPORT_AI_VISIBILITY: true,
        },
      }),
      AUTH,
    );
    expect(plan.reusedStages).toHaveLength(3);
    expect(plan.rerunStages).toEqual(["REPORT_CLAIMS"]);
    expect(plan.providerBudget.deepSeek).toBe(1);
  });

  it("prints only hash availability and budgets, never hash values", () => {
    const plan = buildSanitizedRecoveryPlan(preflight(), AUTH);
    const output = JSON.stringify(plan);
    expect(output).not.toContain("sha256:frozen");
    expect(output).toContain("identityAvailability");
  });
});

describe("fail-closed preflight with zero calls", () => {
  it("refuses an evidence hash change", async () => {
    const pf = preflight();
    pf.identities.evidenceRegistry.current = "sha256:changed";
    await expectBlocked(deps(pf), "EVIDENCE_REGISTRY_HASH_MISMATCH");
  });

  it("refuses an input hash change", async () => {
    const pf = preflight();
    pf.identities.diagnosisInput.current = "sha256:changed";
    await expectBlocked(deps(pf), "DIAGNOSIS_INPUT_HASH_MISMATCH");
  });

  it("refuses a missing run-lock", async () => {
    await expectBlocked(deps(preflight({ runLockExists: false })), "RUN_LOCK_MISSING");
  });

  it("refuses an existing repair attempt", async () => {
    await expectBlocked(
      deps(preflight({ repairAttemptCount: 1 })),
      "REPAIR_ATTEMPT_ALREADY_EXISTS",
    );
  });

  it("requires the exact opaque process authorization", async () => {
    await expectBlocked(deps(), "REPAIR_NOT_AUTHORIZED", {});
    await expectBlocked(deps(), "REPAIR_NOT_AUTHORIZED", {
      TECHNICAL_CANARY_REPAIR_AUTHORIZED: "TRUE",
    });
  });

  it("has no public API, frontend, body, or URL seam for repair authorization", () => {
    const publicFiles = execSync("git ls-files app components src/runtime/api", {
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean);
    for (const file of publicFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("TECHNICAL_CANARY_REPAIR_AUTHORIZED");
      expect(source).not.toContain("resumeAnalysisFromFrozenEvidence");
    }
  });

  it("blocks current diag when competitor and query-plan frozen identities are unavailable", async () => {
    const pf = preflight();
    pf.identities.competitorResolution = { frozen: null, current: null };
    pf.identities.queryPlan = { frozen: null, current: null };
    const d = deps(pf);
    await expectBlocked(d, "COMPETITOR_RESOLUTION_HASH_MISSING");
    expect(d.printSanitizedPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        identityAvailability: expect.objectContaining({
          competitorResolutionHash: false,
          queryPlanHash: false,
        }),
      }),
    );
    expect(d.planRecovery).not.toHaveBeenCalled();
  });
});

describe("one-shot provider and mutation budgets", () => {
  it("fails if Bocha usage increases", async () => {
    await expect(runAnalysisRecoveryRunner(deps(preflight(), { ...ZERO, bochaCalls: 1 }), AUTH))
      .rejects.toMatchObject({ code: "BOCHA_CALL_FORBIDDEN" });
  });

  it("fails if crawler usage increases", async () => {
    await expect(runAnalysisRecoveryRunner(deps(preflight(), { ...ZERO, crawlerCalls: 1 }), AUTH))
      .rejects.toMatchObject({ code: "CRAWLER_CALL_FORBIDDEN" });
  });

  it("fails if DeepSeek exceeds the computed cap", async () => {
    await expect(runAnalysisRecoveryRunner(deps(preflight(), { ...ZERO, deepSeekCalls: 5 }), AUTH))
      .rejects.toMatchObject({ code: "DEEPSEEK_BUDGET_EXCEEDED" });
  });

  it("does not automatically rerun after failure", async () => {
    const d = deps();
    d.resumeRecovery.mockRejectedValueOnce(new Error("stage failed"));
    await expect(runAnalysisRecoveryRunner(d, AUTH)).rejects.toThrow("stage failed");
    expect(d.resumeRecovery).toHaveBeenCalledTimes(1);
  });

  it("fails if a new Diagnosis appears", async () => {
    const d = deps();
    d.readDiagnosisCount = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    await expect(runAnalysisRecoveryRunner(d, AUTH)).rejects.toMatchObject({
      code: "NEW_DIAGNOSIS_FORBIDDEN",
    });
  });

  it("requires original failure preservation", async () => {
    const d = deps();
    d.resumeRecovery.mockResolvedValue({
      ok: true,
      finalStatus: "READY",
      repairAttempt: 1,
      originalFailurePreserved: false,
      repairTimeline: ["REPAIR_ATTEMPT", "READY"],
    });
    await expect(runAnalysisRecoveryRunner(d, AUTH)).rejects.toMatchObject({
      code: "ORIGINAL_FAILURE_NOT_PRESERVED",
    });
  });

  it("requires a single repair attempt in the successful state chain", async () => {
    const d = deps();
    const outcome = await runAnalysisRecoveryRunner(d, AUTH);
    expect(d.resumeRecovery).toHaveBeenCalledTimes(1);
    expect(outcome.result.repairAttempt).toBe(1);
    expect(outcome.result.repairTimeline).toContain("REPAIR_ATTEMPT");
    expect(outcome.usageDelta).toEqual({ ...ZERO, deepSeekCalls: 4 });
  });

  it("rejects recovery internals in a public API response", async () => {
    const d = deps();
    d.resumeRecovery.mockResolvedValue({
      ok: true,
      finalStatus: "READY",
      repairAttempt: 1,
      originalFailurePreserved: true,
      repairTimeline: ["FAILED", "REPAIR_ATTEMPT", "READY"],
      publicApiPayload: { diagnosisId: "diag_d9d", rerunStages: ["REPORT_CLAIMS"] },
    });
    await expect(runAnalysisRecoveryRunner(d, AUTH)).rejects.toBeInstanceOf(
      AnalysisRecoveryRunnerError,
    );
  });
});
