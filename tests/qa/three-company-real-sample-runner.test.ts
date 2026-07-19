import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THREE_COMPANY_SAMPLE_AUTH_ENV,
  THREE_COMPANY_SAMPLE_BUDGET,
  THREE_COMPANY_SAMPLE_PRIVATE_ROOT,
  THREE_COMPANY_SAMPLE_TARGETS,
  assessThreeCompanySampleAuthorization,
  batchBudgetStopReasons,
  buildIsolatedChildEnvironment,
  buildThreeCompanySamplePlan,
  companyStopReasons,
  resolveCompanyPaths,
  requiredCompanyArtifactPaths,
  runThreeCompanySampleBatch,
  type CompanyExecutionResult,
} from "../../scripts/three-company-real-sample";

const AUTHORIZED_ENV = {
  THREE_COMPANY_SAMPLE_AUTHORIZED: "true",
  PROVIDER_MODE: "REAL",
  DIAGNOSIS_SMOKE_MODE: "false",
  BOCHA_API_KEY: "test-only-bocha-key",
  DEEPSEEK_API_KEY: "test-only-deepseek-key",
};

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()))) throw new Error("refusing to remove a non-temporary path");
    rmSync(path, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function temporaryRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "round6-sample-runner-"));
  temporaryRoots.push(path);
  return path;
}

function resultFor(
  target: CompanyExecutionResult["target"],
  overrides: Partial<CompanyExecutionResult> = {},
): CompanyExecutionResult {
  return {
    target,
    diagnosisIdShort: `diag-${target}`.slice(0, 8),
    diagnosisCount: 1,
    finalState: "READY",
    durationMs: 1_000,
    providerUsage: {
      bocha: 10,
      crawler: 12,
      crawlerFirstParty: 8,
      crawlerCompetitor: 4,
      deepseek: 4,
      retries: 0,
    },
    schemaFailure: false,
    safetyFailure: false,
    publicApiLeak: false,
    truthGuardViolation: false,
    unsupportedPublishedClaimCount: 0,
    scoringWeightsChanged: false,
    stateMachineAnomaly: false,
    databaseConflict: false,
    runLockConflict: false,
    issueCount: 1,
    opportunityCount: 1,
    demonstrationFixPublished: false,
    productYieldStatus: "HEALTHY",
    reportLanguage: "zh-CN",
    quickVisibleCharacters: 900,
    mobileOverflow: false,
    printCaptured: true,
    viewSwitchProviderDelta: 0,
    canonicalProjectionConsistent: true,
    pruneAuditComplete: true,
    crawlerUsageAuditable: true,
    ...overrides,
  };
}

describe("Round-6 server-only authorization", () => {
  it("defaults false and fails closed before creating a private directory or calling an executor", async () => {
    expect(assessThreeCompanySampleAuthorization({}).authorized).toBe(false);
    expect(
      assessThreeCompanySampleAuthorization({ ...AUTHORIZED_ENV, THREE_COMPANY_SAMPLE_AUTHORIZED: "false" })
        .failures,
    ).toContain("SAMPLE_NOT_AUTHORIZED");
    expect(
      assessThreeCompanySampleAuthorization({ ...AUTHORIZED_ENV, THREE_COMPANY_SAMPLE_AUTHORIZED: "TRUE" })
        .failures,
    ).toContain("SAMPLE_NOT_AUTHORIZED");

    const root = join(temporaryRoot(), "must-not-exist");
    const executor = vi.fn();
    await expect(
      runThreeCompanySampleBatch({ env: {}, executor, privateRoot: root }),
    ).rejects.toThrow("THREE_COMPANY_SAMPLE_NOT_AUTHORIZED");
    expect(executor).not.toHaveBeenCalled();
    expect(() => readFileSync(root)).toThrow();
  });

  it("cannot be enabled by API body, URL, form, page, or NEXT_PUBLIC environment", () => {
    const fakePublicValues = {
      body: { THREE_COMPANY_SAMPLE_AUTHORIZED: "true" },
      url: "?THREE_COMPANY_SAMPLE_AUTHORIZED=true",
      form: "THREE_COMPANY_SAMPLE_AUTHORIZED=true",
      NEXT_PUBLIC_THREE_COMPANY_SAMPLE_AUTHORIZED: "true",
    };
    expect(fakePublicValues).toBeDefined();
    expect(assessThreeCompanySampleAuthorization({ ...fakePublicValues } as never).authorized).toBe(false);

    for (const path of [
      "app/api/diagnoses/route.ts",
      "app/api/diagnoses/[id]/route.ts",
      "components/diagnose-form.tsx",
      "app/page.tsx",
      "app/report/[token]/page.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).not.toContain(THREE_COMPANY_SAMPLE_AUTH_ENV);
    }
  });

  it("bridges the legacy technical switch only after the new authorization succeeds", () => {
    const paths = resolveCompanyPaths(temporaryRoot(), THREE_COMPANY_SAMPLE_TARGETS[0]!);
    expect(() => buildIsolatedChildEnvironment({}, paths, 3200)).toThrow(
      "THREE_COMPANY_SAMPLE_NOT_AUTHORIZED",
    );
    const child = buildIsolatedChildEnvironment(AUTHORIZED_ENV, paths, 3200);
    expect(child.THREE_COMPANY_SAMPLE_AUTHORIZED).toBe("true");
    expect(child.TECHNICAL_COMPANY_CANARY_AUTHORIZED).toBe("true");
    expect(child.DIAGNOSIS_SMOKE_MODE).toBe("false");
    expect(child.DATABASE_URL).toBe(paths.database);
  });

  it("provides an inert plan with zero provider calls, diagnoses, and private writes", () => {
    const root = join(temporaryRoot(), "plan-does-not-create-this-directory");
    const plan = buildThreeCompanySamplePlan(root);
    expect(plan).toMatchObject({
      mode: "PLAN_ONLY",
      authorizationDefault: false,
      realProviderCalls: 0,
      newDiagnoses: 0,
      privateWrites: 0,
    });
    expect(plan.targets.map((target) => target.slug)).toEqual(["qiaqia", "iflytek", "heli"]);
    expect(() => readFileSync(root)).toThrow();
  });
});

describe("Round-6 fixed targets and private isolation", () => {
  it("freezes qiaqia → iflytek → heli with the exact sites, competitors, focus, and five questions", () => {
    expect(THREE_COMPANY_SAMPLE_TARGETS.map((target) => target.slug)).toEqual([
      "qiaqia",
      "iflytek",
      "heli",
    ]);
    expect(THREE_COMPANY_SAMPLE_TARGETS.map((target) => target.website)).toEqual([
      "https://www.qiaqiafood.com/",
      "https://www.iflytek.com/cn/",
      "https://www.helichina.com/",
    ]);
    expect(THREE_COMPANY_SAMPLE_TARGETS.map((target) => target.competitor)).toEqual([
      "三只松鼠",
      "百度智能云",
      "杭叉集团",
    ]);
    expect(THREE_COMPANY_SAMPLE_TARGETS.every((target) => target.customerQuestions.length === 5)).toBe(true);
    expect(THREE_COMPANY_SAMPLE_TARGETS[1]!.industryOrFocus).toBe(
      "企业AI解决方案、智慧办公和行业数字化",
    );
    expect(THREE_COMPANY_SAMPLE_TARGETS[1]!.input.notes).not.toContain("全部业务");
  });

  it("assigns separate directories, SQLite files, and run-locks under the frozen private root", () => {
    const paths = THREE_COMPANY_SAMPLE_TARGETS.map((target) =>
      resolveCompanyPaths(THREE_COMPANY_SAMPLE_PRIVATE_ROOT, target),
    );
    expect(new Set(paths.map((item) => item.directory)).size).toBe(3);
    expect(new Set(paths.map((item) => item.database)).size).toBe(3);
    expect(new Set(paths.map((item) => item.runLock)).size).toBe(3);
    expect(paths.every((item) => item.sanitizedCanonical.endsWith("sanitized-canonical.json"))).toBe(true);
    expect(paths.every((item) => item.quickScreenshot.endsWith("quick.png"))).toBe(true);
    expect(paths.every((item) => item.deepScreenshot.endsWith("deep.png"))).toBe(true);
    expect(paths.every((item) => item.evidenceScreenshot.endsWith("evidence.png"))).toBe(true);
    expect(paths.every((item) => item.printScreenshot.endsWith("print.png"))).toBe(true);
    expect(paths.every((item) => item.log.endsWith("run.log"))).toBe(true);
    expect(paths.every((item) => item.providerUsage.endsWith("provider-usage.json"))).toBe(true);
    expect(paths.every((item) => item.sampleMetrics.endsWith("sample-metrics.json"))).toBe(true);
    expect(paths.map((item) => item.directory.replaceAll("/", "\\"))).toEqual([
      `${THREE_COMPANY_SAMPLE_PRIVATE_ROOT}\\01-qiaqia`,
      `${THREE_COMPANY_SAMPLE_PRIVATE_ROOT}\\02-iflytek`,
      `${THREE_COMPANY_SAMPLE_PRIVATE_ROOT}\\03-heli`,
    ]);
  });

  it("verifies the required private artifact matrix from an isolated temp execution", async () => {
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      verifyRequiredArtifacts: true,
      executor: async ({ target, paths }) => {
        for (const path of requiredCompanyArtifactPaths(paths)) writeFileSync(path, "mock artifact", "utf8");
        return resultFor(target.slug);
      },
    });
    expect(output.status).toBe("COMPLETED");
    expect(output.stopReasons).toEqual([]);
  });

  it("stops before company two when a required private artifact is missing", async () => {
    const calls: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      verifyRequiredArtifacts: true,
      executor: async ({ target }) => {
        calls.push(target.slug);
        return resultFor(target.slug);
      },
    });
    expect(calls).toEqual(["qiaqia"]);
    expect(output.stopReasons).toEqual(["qiaqia:REQUIRED_ARTIFACT_MISSING"]);
  });
});

describe("Round-6 serial execution, budgets, and stop-batch rules", () => {
  it("runs the three targets strictly serially and records the frozen batch totals", async () => {
    let active = 0;
    let maximumActive = 0;
    const order: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      now: () => "2026-07-20T00:00:00.000Z",
      executor: async ({ target }) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        order.push(target.slug);
        await Promise.resolve();
        active -= 1;
        return resultFor(target.slug);
      },
    });
    expect(maximumActive).toBe(1);
    expect(order).toEqual(["qiaqia", "iflytek", "heli"]);
    expect(output.status).toBe("COMPLETED");
    expect(output.totals).toEqual({ bocha: 30, crawler: 36, deepseek: 12, retries: 0, diagnoses: 3 });
  });

  it("stops the batch immediately on a hard budget breach or retry", async () => {
    const calls: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      executor: async ({ target }) => {
        calls.push(target.slug);
        return resultFor(target.slug, {
          providerUsage: {
            bocha: 13,
            crawler: 1,
            crawlerFirstParty: 1,
            crawlerCompetitor: 0,
            deepseek: 4,
            retries: 1,
          },
        });
      },
    });
    expect(calls).toEqual(["qiaqia"]);
    expect(output.status).toBe("STOPPED");
    expect(output.stopReasons).toEqual([
      "qiaqia:BOCHA_COMPANY_BUDGET_EXCEEDED",
      "qiaqia:UNEXPECTED_RETRY",
      "qiaqia:BATCH_RETRY_VIOLATION",
    ]);
  });

  it.each([
    ["SCHEMA_FAILURE", { schemaFailure: true }],
    ["SAFETY_FAILURE", { safetyFailure: true }],
    ["PUBLIC_API_LEAK", { publicApiLeak: true }],
    ["TRUTH_GUARD_VIOLATION", { truthGuardViolation: true }],
    ["UNSUPPORTED_CLAIM_PUBLISHED", { unsupportedPublishedClaimCount: 1 }],
    ["SCORING_WEIGHTS_CHANGED", { scoringWeightsChanged: true }],
    ["STATE_MACHINE_ANOMALY", { stateMachineAnomaly: true }],
    ["DATABASE_CONFLICT", { databaseConflict: true }],
    ["RUN_LOCK_CONFLICT", { runLockConflict: true }],
    ["REPORT_LANGUAGE_INVALID", { reportLanguage: "en" }],
    ["QUICK_CHARACTER_LIMIT_FAILED", { quickVisibleCharacters: 1801 }],
    ["MOBILE_OVERFLOW_OR_UNVERIFIED", { mobileOverflow: null }],
    ["PRINT_NOT_CAPTURED", { printCaptured: false }],
    ["VIEW_SWITCH_PROVIDER_DELTA_NONZERO_OR_UNKNOWN", { viewSwitchProviderDelta: null }],
    ["CANONICAL_PROJECTION_MISMATCH", { canonicalProjectionConsistent: false }],
    ["PRUNE_AUDIT_INCOMPLETE", { pruneAuditComplete: false }],
    ["CRAWLER_USAGE_NOT_AUDITABLE", { crawlerUsageAuditable: false }],
  ] as const)("stops before company two on %s", async (reason, override) => {
    const calls: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      executor: async ({ target }) => {
        calls.push(target.slug);
        return resultFor(target.slug, override);
      },
    });
    expect(calls).toEqual(["qiaqia"]);
    expect(output.stopReasons).toContain(`qiaqia:${reason}`);
  });

  it("continues after READY sparse output and never auto-reruns a company", async () => {
    const calls: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      executor: async ({ target }) => {
        calls.push(target.slug);
        return resultFor(target.slug, {
          issueCount: 0,
          opportunityCount: 0,
          demonstrationFixPublished: false,
          productYieldStatus: "SPARSE_BUT_TRUTHFUL",
        });
      },
    });
    expect(output.status).toBe("COMPLETED");
    expect(calls).toEqual(["qiaqia", "iflytek", "heli"]);
    expect(new Set(calls).size).toBe(3);
  });

  it("stops and records an executor failure without starting company two", async () => {
    const calls: string[] = [];
    const output = await runThreeCompanySampleBatch({
      env: AUTHORIZED_ENV,
      privateRoot: temporaryRoot(),
      executor: async ({ target }) => {
        calls.push(target.slug);
        throw new Error("simulated executor failure");
      },
    });
    expect(calls).toEqual(["qiaqia"]);
    expect(output.status).toBe("STOPPED");
    expect(output.stopReasons).toEqual(["qiaqia:EXECUTOR_FAILURE"]);
  });

  it("keeps the one-shot batch lock and refuses a second attempt", async () => {
    const root = temporaryRoot();
    const executor = vi.fn(async ({ target }) => resultFor(target.slug));
    await runThreeCompanySampleBatch({ env: AUTHORIZED_ENV, privateRoot: root, executor });
    await expect(
      runThreeCompanySampleBatch({ env: AUTHORIZED_ENV, privateRoot: root, executor }),
    ).rejects.toThrow("BATCH_RUN_LOCK_PRESENT");
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it("freezes the exact per-company and batch hard budgets", () => {
    expect(THREE_COMPANY_SAMPLE_BUDGET).toEqual({
      perCompany: {
        bochaExpectedMax: 10,
        bochaHardMax: 12,
        crawlerHardMax: 12,
        crawlerFirstPartyHardMax: 8,
        crawlerCompetitorHardMax: 4,
        deepseekExpected: 4,
        deepseekHardMax: 8,
        retries: 0,
        diagnoses: 1,
      },
      batch: {
        bochaHardMax: 36,
        crawlerHardMax: 36,
        deepseekHardMax: 24,
        retries: 0,
        diagnoses: 3,
      },
    });
    expect(
      companyStopReasons(
        resultFor("qiaqia", {
          providerUsage: {
            bocha: 12,
            crawler: 12,
            crawlerFirstParty: 8,
            crawlerCompetitor: 4,
            deepseek: 8,
            retries: 0,
          },
        }),
      ),
    ).toEqual([]);
    expect(
      batchBudgetStopReasons({ bocha: 36, crawler: 36, deepseek: 24, retries: 0, diagnoses: 3 }),
    ).toEqual([]);
  });
});
