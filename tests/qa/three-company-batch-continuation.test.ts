import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_API_FORBIDDEN_INTERNAL_KEYS,
  THREE_COMPANY_CONTINUATION_AUTH_ENV,
  THREE_COMPANY_CONTINUATION_BUDGET,
  THREE_COMPANY_CONTINUATION_TARGETS,
  assessThreeCompanyContinuationAuthorization,
  buildThreeCompanyContinuationPlan,
  continuationBatchBudgetStopReasons,
  evaluateThreeCompanyAggregateGates,
  evaluateThreeCompanyContinuationPreflight,
  publicApiInternalAuditLeakKeys,
  runThreeCompanyBatchContinuation,
  type ContinuationCompanyResult,
  type ThreeCompanyAggregateInput,
  type ThreeCompanyContinuationPreflightFacts,
  type ThreeCompanyContinuationRecord,
  type ThreeCompanyContinuationStore,
} from "../../scripts/three-company-batch-continuation";
import { computeCompanySampleMetrics } from "../../scripts/round53-three-company-sample";
import { buildRound53ThreeCompanyMockFixture } from "../fixtures/round53-three-company-sample";

const AUTHORIZED_ENV = {
  THREE_COMPANY_SAMPLE_CONTINUATION_AUTHORIZED: "true",
  PROVIDER_MODE: "REAL",
  DIAGNOSIS_SMOKE_MODE: "false",
  ["BOCHA" + "_API_KEY"]: "test-only-bocha-key",
  ["DEEPSEEK" + "_API_KEY"]: "test-only-deepseek-key",
};

function preflight(
  overrides: Partial<ThreeCompanyContinuationPreflightFacts> = {},
): ThreeCompanyContinuationPreflightFacts {
  return {
    parentBatchId: "three-company-real-sample.v1",
    parentBatchStatus: "STOPPED",
    parentBatchHash: "sha256:parent-lock",
    acceptedCompletedCompany: "qiaqia",
    acceptedReportRevisionId: "revision-qiaqia-round6a",
    acceptedReportHash: "sha256:qiaqia-revision",
    qiaqiaRevisionTruthGuardPassed: true,
    originalQiaqiaCanonicalPreserved: true,
    continuationAlreadyExists: false,
    existingDiagnosisTargets: [],
    competitorGapPolicyActiveInNormalRuntime: true,
    normalRuntimePersistsAnalysisStageRuns: true,
    candidateDecisionAuditComplete: true,
    ...overrides,
  };
}

function companyResult(
  target: "iflytek" | "heli",
  overrides: Partial<ContinuationCompanyResult> = {},
): ContinuationCompanyResult {
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
    competitorGapTruthViolation: false,
    publicationDecisionComplete: true,
    candidateSourceAuditable: true,
    ...overrides,
  };
}

function memoryStore(parentUnchanged: boolean | boolean[] = true) {
  const created: ThreeCompanyContinuationRecord[] = [];
  const updated: ThreeCompanyContinuationRecord[] = [];
  const answers = Array.isArray(parentUnchanged) ? [...parentUnchanged] : null;
  const store: ThreeCompanyContinuationStore = {
    create: vi.fn(async (record) => {
      created.push(structuredClone(record));
    }),
    update: vi.fn(async (record) => {
      updated.push(structuredClone(record));
    }),
    assertParentBatchUnchanged: vi.fn(async () => answers?.shift() ?? parentUnchanged === true),
  };
  return { store, created, updated };
}

function aggregateInputs(count = 3): ThreeCompanyAggregateInput[] {
  const metrics = buildRound53ThreeCompanyMockFixture().map(computeCompanySampleMetrics);
  const companies = ["qiaqia", "iflytek", "heli"] as const;
  return companies.slice(0, count).map((company, index) => ({
    company,
    reportSource: company === "qiaqia" ? "LATEST_APPEND_ONLY_REVISION" : "CANONICAL",
    reportId: `report-${company}`,
    reportHash: `sha256:${company}`,
    metrics: { ...metrics[index]!, companyId: company },
  }));
}

describe("Round-6A continuation authorization and preflight", () => {
  it("defaults false, requires the exact server switch and exposes an inert zero-call plan", async () => {
    expect(assessThreeCompanyContinuationAuthorization({}).authorized).toBe(false);
    expect(
      assessThreeCompanyContinuationAuthorization({
        ...AUTHORIZED_ENV,
        THREE_COMPANY_SAMPLE_CONTINUATION_AUTHORIZED: "TRUE",
      }).failures,
    ).toContain("CONTINUATION_NOT_AUTHORIZED");
    expect(buildThreeCompanyContinuationPlan()).toMatchObject({
      mode: "PLAN_ONLY",
      authorizationDefault: false,
      realProviderCalls: 0,
      newDiagnoses: 0,
      privateWrites: 0,
      remainingTargets: ["iflytek", "heli"],
    });

    const executor = vi.fn();
    const { store } = memoryStore();
    await expect(
      runThreeCompanyBatchContinuation({ env: {}, preflight: preflight(), store, executor }),
    ).rejects.toThrow("THREE_COMPANY_CONTINUATION_NOT_AUTHORIZED");
    expect(store.create).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("fails closed on every frozen preflight condition before ledger creation or execution", async () => {
    const failed = evaluateThreeCompanyContinuationPreflight(
      preflight({
        parentBatchStatus: "COMPLETED",
        qiaqiaRevisionTruthGuardPassed: false,
        originalQiaqiaCanonicalPreserved: false,
        continuationAlreadyExists: true,
        existingDiagnosisTargets: ["iflytek", "heli"],
        competitorGapPolicyActiveInNormalRuntime: false,
        normalRuntimePersistsAnalysisStageRuns: false,
        candidateDecisionAuditComplete: false,
      }),
    );
    expect(failed.passed).toBe(false);
    expect(failed.failures).toEqual(
      expect.arrayContaining([
        "QIAQIA_REVISION_TRUTH_GUARD_FAILED",
        "ORIGINAL_QIAQIA_CANONICAL_NOT_PRESERVED",
        "PARENT_BATCH_NOT_STOPPED",
        "CONTINUATION_ALREADY_EXISTS",
        "IFLYTEK_DIAGNOSIS_ALREADY_EXISTS",
        "HELI_DIAGNOSIS_ALREADY_EXISTS",
        "COMPETITOR_GAP_POLICY_NOT_ACTIVE",
        "NORMAL_RUNTIME_STAGE_PERSISTENCE_MISSING",
        "CANDIDATE_DECISION_AUDIT_INCOMPLETE",
      ]),
    );

    const executor = vi.fn();
    const { store } = memoryStore();
    await expect(
      runThreeCompanyBatchContinuation({
        env: AUTHORIZED_ENV,
        preflight: preflight({ continuationAlreadyExists: true }),
        store,
        executor,
      }),
    ).rejects.toThrow("THREE_COMPANY_CONTINUATION_PREFLIGHT_FAILED");
    expect(store.create).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("Round-6A fixed two-diagnosis serial continuation", () => {
  it("Phase A #17 excludes qiaqia from the immutable continuation target order and record", async () => {
    expect(THREE_COMPANY_CONTINUATION_TARGETS.map((target) => target.slug)).toEqual(["iflytek", "heli"]);
    expect(THREE_COMPANY_CONTINUATION_TARGETS.some((target) => target.slug === ("qiaqia" as never))).toBe(false);

    const { store, created } = memoryStore();
    const result = await runThreeCompanyBatchContinuation({
      env: AUTHORIZED_ENV,
      preflight: preflight(),
      store,
      executor: async ({ target }) => companyResult(target.slug),
      now: () => "2026-07-20T00:00:00.000Z",
    });
    expect(created[0]).toMatchObject({
      parentBatchStatus: "STOPPED",
      acceptedCompletedCompany: "qiaqia",
      acceptedReportRevisionId: "revision-qiaqia-round6a",
      remainingTargets: ["iflytek", "heli"],
      authorizationStatus: "AUTHORIZED",
    });
    expect(created[0]!.remainingTargets).not.toContain("qiaqia");
    expect(result.record.status).toBe("COMPLETED");
  });

  it("Phase A #18 runs exactly two diagnoses in strict serial order with no retry or rerun", async () => {
    let active = 0;
    let maximumActive = 0;
    const calls: string[] = [];
    const { store } = memoryStore();
    const result = await runThreeCompanyBatchContinuation({
      env: AUTHORIZED_ENV,
      preflight: preflight(),
      store,
      executor: async ({ target }) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        calls.push(target.slug);
        await Promise.resolve();
        active -= 1;
        return companyResult(target.slug);
      },
    });
    expect(calls).toEqual(["iflytek", "heli"]);
    expect(maximumActive).toBe(1);
    expect(new Set(calls).size).toBe(2);
    expect(result.record.totals).toEqual({ bocha: 20, crawler: 24, deepseek: 8, retries: 0, diagnoses: 2 });
    expect(result.record.completedTargets).toEqual(["iflytek", "heli"]);
  });

  it("freezes continuation and per-company caps at 24/24/16/2 and 12/12/8/1", () => {
    expect(THREE_COMPANY_CONTINUATION_BUDGET).toEqual({
      perCompany: expect.objectContaining({
        bochaHardMax: 12,
        crawlerHardMax: 12,
        deepseekHardMax: 8,
        retries: 0,
        diagnoses: 1,
      }),
      batch: { bochaHardMax: 24, crawlerHardMax: 24, deepseekHardMax: 16, retries: 0, diagnoses: 2 },
    });
    expect(
      continuationBatchBudgetStopReasons({ bocha: 24, crawler: 24, deepseek: 16, retries: 0, diagnoses: 2 }),
    ).toEqual([]);
    expect(
      continuationBatchBudgetStopReasons({ bocha: 25, crawler: 25, deepseek: 17, retries: 1, diagnoses: 3 }),
    ).toEqual([
      "BOCHA_CONTINUATION_BUDGET_EXCEEDED",
      "CRAWLER_CONTINUATION_BUDGET_EXCEEDED",
      "DEEPSEEK_CONTINUATION_BUDGET_EXCEEDED",
      "CONTINUATION_RETRY_VIOLATION",
      "CONTINUATION_DIAGNOSIS_BUDGET_EXCEEDED",
    ]);
  });

  it.each([
    ["COMPETITOR_GAP_TRUTH_VIOLATION", { competitorGapTruthViolation: true }],
    ["PUBLICATION_DECISION_INCOMPLETE", { publicationDecisionComplete: false }],
    ["CANDIDATE_SOURCE_NOT_AUDITABLE", { candidateSourceAuditable: false }],
    ["SCHEMA_FAILURE", { schemaFailure: true }],
    ["PUBLIC_API_LEAK", { publicApiLeak: true }],
    ["UNSUPPORTED_CLAIM_PUBLISHED", { unsupportedPublishedClaimCount: 1 }],
    ["STATE_MACHINE_ANOMALY", { stateMachineAnomaly: true }],
    ["SAFETY_FAILURE", { safetyFailure: true }],
  ] as const)("stops before heli on %s", async (reason, override) => {
    const calls: string[] = [];
    const { store } = memoryStore();
    const result = await runThreeCompanyBatchContinuation({
      env: AUTHORIZED_ENV,
      preflight: preflight(),
      store,
      executor: async ({ target }) => {
        calls.push(target.slug);
        return companyResult(target.slug, override);
      },
    });
    expect(calls).toEqual(["iflytek"]);
    expect(result.record.status).toBe("STOPPED");
    expect(result.record.stopReason).toContain(`iflytek:${reason}`);
  });

  it("does not stop or retry for a truthful sparse READY result", async () => {
    const calls: string[] = [];
    const { store } = memoryStore();
    const result = await runThreeCompanyBatchContinuation({
      env: AUTHORIZED_ENV,
      preflight: preflight(),
      store,
      executor: async ({ target }) => {
        calls.push(target.slug);
        return companyResult(target.slug, {
          issueCount: 0,
          opportunityCount: 0,
          demonstrationFixPublished: false,
          productYieldStatus: "SPARSE_BUT_TRUTHFUL",
        });
      },
    });
    expect(calls).toEqual(["iflytek", "heli"]);
    expect(result.record.status).toBe("COMPLETED");
  });

  it("stops without starting another diagnosis when the immutable parent lock seal changes", async () => {
    const { store } = memoryStore(false);
    const executor = vi.fn();
    const result = await runThreeCompanyBatchContinuation({
      env: AUTHORIZED_ENV,
      preflight: preflight(),
      store,
      executor,
    });
    expect(result.record.stopReason).toBe("PARENT_BATCH_MUTATED");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("Round-6A tri-state aggregate gates", () => {
  it("Phase A #19 leaves complete-sample gates NOT_EVALUABLE without inventing missing metrics", () => {
    const result = evaluateThreeCompanyAggregateGates(aggregateInputs(1));
    expect(result.sampleStatus).toBe("NOT_EVALUABLE");
    expect(result.completeCompanyCount).toBe(1);
    expect(result.missingCompanies).toEqual(["iflytek", "heli"]);
    expect(result.gates.every((gate) => gate.status === "NOT_EVALUABLE")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("0/3 companies");
  });

  it("can fail an observed hard violation while other incomplete gates remain NOT_EVALUABLE", () => {
    const inputs = aggregateInputs(1);
    inputs[0]!.metrics.publishedUnsupportedClaimCount = 1;
    const result = evaluateThreeCompanyAggregateGates(inputs);
    expect(result.gates.find((gate) => gate.id === "NO_UNSUPPORTED_PUBLISHED_CLAIMS")?.status).toBe("FAIL");
    expect(
      result.gates.find((gate) => gate.id === "AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY")?.status,
    ).toBe("NOT_EVALUABLE");
    expect(result.sampleStatus).toBe("FAIL");
  });

  it("uses only qiaqia latest append-only revision plus two Canonicals and resolves all ten gates", () => {
    const result = evaluateThreeCompanyAggregateGates(aggregateInputs());
    expect(result.gates).toHaveLength(10);
    expect(result.gates.every((gate) => gate.status === "PASS")).toBe(true);
    expect(result.gates.some((gate) => gate.status === "NOT_EVALUABLE")).toBe(false);
    expect(result.sampleStatus).toBe("PASS");

    const invalid = aggregateInputs();
    invalid[0]!.reportSource = "CANONICAL";
    expect(() => evaluateThreeCompanyAggregateGates(invalid)).toThrow(
      "QIAQIA_AGGREGATE_MUST_USE_LATEST_REVISION",
    );
  });
});

describe("Round-6A public API isolation", () => {
  it("Phase A #20 keeps authorization, Decision and provenance internals out of public entrypoints", () => {
    for (const path of [
      "app/api/diagnoses/route.ts",
      "app/api/diagnoses/[id]/route.ts",
      "components/diagnose-form.tsx",
      "app/page.tsx",
      "app/report/[token]/page.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(THREE_COMPANY_CONTINUATION_AUTH_ENV);
      for (const key of PUBLIC_API_FORBIDDEN_INTERNAL_KEYS) expect(source).not.toContain(key);
    }
    expect(publicApiInternalAuditLeakKeys({ report: { title: "公开报告" } })).toEqual([]);
    expect(
      publicApiInternalAuditLeakKeys({
        report: { title: "公开报告" },
        internal: { publicationDecisions: [], candidateSourceProvenance: { stageRunId: "run-1" } },
      }),
    ).toEqual(["candidateSourceProvenance", "publicationDecisions", "stageRunId"]);
  });
});
