import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  SqliteStorageAdapter,
  createSqliteStorageAdapter,
} from "../../src/storage/sqlite-adapter";
import {
  runDiagnosisPipeline,
  type EvidencePipeline,
  type OrchestratorDeps,
  type ReportProducer,
} from "../../src/diagnosis/orchestration/state-machine";
import {
  createMockEvidencePipeline,
  createMockReportProducer,
} from "../../src/diagnosis/orchestration/mocks";
import { createDeterministicVerifier } from "../../src/diagnosis/verification";
import type { VerifierStrategy } from "../../src/diagnosis/verification";
import { buildSampleReport } from "../../src/fixtures/sample-report";

/** A deterministic verifier wrapper that counts how often it is invoked. */
function countingVerifier(version: string): { strategy: VerifierStrategy; calls: () => number } {
  const base = createDeterministicVerifier();
  let calls = 0;
  return {
    strategy: {
      mode: "MOCK_DETERMINISTIC",
      version,
      async assess(input) {
        calls += 1;
        return base.assess(input);
      },
    },
    calls: () => calls,
  };
}

const VALID_INPUT = { website: "https://example-equip.com", brandName: "示例智能装备" };

function seq(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

describe("diagnosis pipeline state machine", () => {
  let db: SqliteDatabase;
  let adapter: SqliteStorageAdapter;

  async function createRequest(id = "diag_sm", token = "tok_sm") {
    await adapter.createDiagnosisRequest({
      id,
      inputJson: JSON.stringify(VALID_INPUT),
      publicToken: token,
    });
    return { id, token };
  }

  function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
    return {
      storage: adapter,
      evidence: createMockEvidencePipeline(),
      producer: createMockReportProducer(),
      idFactory: seq("gen"),
      ...overrides,
    };
  }

  beforeEach(() => {
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    adapter = created.adapter;
  });

  afterEach(() => db.close());

  it("walks CREATED → READY_LIMITED when the mock has no persisted full-analysis stages", async () => {
    const { id, token } = await createRequest();
    const result = await runDiagnosisPipeline(deps(), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("READY_LIMITED");

    const rec = await adapter.getDiagnosisRequest(id);
    expect(rec!.status).toBe("READY_LIMITED");

    // evidence persisted
    const evidence = await adapter.getEvidence(id);
    expect(evidence.length).toBeGreaterThan(0);

    // provider usage recorded for bocha (search+crawl) and deepseek (analyze)
    const usage = await adapter.getProviderUsage(id);
    const providers = new Set(usage.map((u) => u.provider));
    expect(providers.has("bocha")).toBe(true);
    expect(providers.has("deepseek")).toBe(true);

    // canonical report stored and identity-bound to this diagnosis
    const stored = await adapter.getReport(id);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!.canonicalJson);
    expect(parsed.diagnosisId).toBe(id);
    expect(parsed.publicToken).toBe(token);
  });

  it("records the ordered status transitions", async () => {
    const { id, token } = await createRequest();
    const transitions: string[] = [];
    const spyStorage = new Proxy(adapter, {
      get(target, prop, receiver) {
        if (prop === "updateDiagnosisStatus") {
          return async (rid: string, status: string) => {
            transitions.push(status);
            return (target.updateDiagnosisStatus as (a: string, b: string) => Promise<void>)(
              rid,
              status,
            );
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    await runDiagnosisPipeline(deps({ storage: spyStorage }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(transitions).toEqual([
      "VALIDATING",
      "SEARCHING",
      "CRAWLING",
      "NORMALIZING_EVIDENCE",
      "ANALYZING",
      "CLAIM_EVIDENCE_VERIFICATION",
      "VALIDATING_REPORT",
      "READY_LIMITED",
    ]);
  });

  it("fails at VALIDATING on invalid input without touching the producer", async () => {
    const { id, token } = await createRequest("diag_bad", "tok_bad");
    const producer: ReportProducer = { produce: vi.fn() };
    const result = await runDiagnosisPipeline(
      deps({ producer }),
      { diagnosisId: id, publicToken: token, input: { website: "not-a-url" } },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.failedStage).toBe("VALIDATING");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(producer.produce).not.toHaveBeenCalled();
    expect((await adapter.getDiagnosisRequest(id))!.status).toBe("FAILED");
    expect(await adapter.getReport(id)).toBeNull();
  });

  it("fails at CRAWLING when the evidence pipeline throws", async () => {
    const { id, token } = await createRequest("diag_crawl", "tok_crawl");
    const evidence: EvidencePipeline = {
      ...createMockEvidencePipeline(),
      async crawl() {
        throw new Error("crawler blocked by SSRF guard");
      },
    };
    const result = await runDiagnosisPipeline(deps({ evidence }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.failedStage).toBe("CRAWLING");
    expect(result.error.code).toBe("CRAWL_FAILED");
    expect((await adapter.getDiagnosisRequest(id))!.status).toBe("FAILED");
  });

  it("fails at ANALYZING when the producer returns an error", async () => {
    const { id, token } = await createRequest("diag_an", "tok_an");
    const producer: ReportProducer = {
      async produce() {
        return { ok: false, error: { code: "PROVIDER_TIMEOUT", message: "deepseek timeout" } };
      },
    };
    const result = await runDiagnosisPipeline(deps({ producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.failedStage).toBe("ANALYZING");
    expect(result.error.code).toBe("PROVIDER_TIMEOUT");
    expect((await adapter.getDiagnosisRequest(id))!.status).toBe("FAILED");
  });

  it("does not mark FULL READY when DeepSeek usage is zero", async () => {
    const { id, token } = await createRequest("diag_no_ds", "tok_no_ds");
    const producer: ReportProducer = {
      async produce() {
        return {
          ok: true,
          report: buildSampleReport({ diagnosisId: id, publicToken: token }),
          usage: [],
        };
      },
    };
    const result = await runDiagnosisPipeline(deps({ producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("READY_LIMITED");
    if (!result.ok) throw new Error("expected limited success");
    expect(result.report.executionMode).toBe("LIMITED_PUBLIC_SCAN");
    expect(result.report.publicReportEligible).toBe(false);
  });

  it("does not mark FULL READY when publication leaves no diagnostic content", async () => {
    const { id, token } = await createRequest("diag_no_content", "tok_no_content");
    const producer: ReportProducer = {
      async produce() {
        return {
          ok: true,
          report: buildSampleReport({
            diagnosisId: id,
            publicToken: token,
            strengths: [],
            coreIssues: [],
            geoOpportunities: [],
            competitorGaps: [],
            demonstrationFix: null,
          }),
          usage: [{ provider: "deepseek", stage: "ANALYZING", callCount: 1 }],
        };
      },
    };
    const result = await runDiagnosisPipeline(deps({ producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected limited success");
    expect(result.status).toBe("READY_LIMITED");
    expect(result.report.executionMode).toBe("LIMITED_PUBLIC_SCAN");
    expect(result.report.publicReportEligible).toBe(false);
    expect(result.report.completionProfile?.completionReasons).toContain(
      "NO_PUBLISHED_DIAGNOSTIC_CONTENT",
    );
  });

  it("keeps search-snippet-only runs LIMITED and strips formal claims", async () => {
    const { id, token } = await createRequest("diag_snippet", "tok_snippet");
    const snippetReport = buildSampleReport({
      diagnosisId: id,
      publicToken: token,
      evidence: buildSampleReport().evidence.map((item) => ({
        ...item,
        sourceType: "OBSERVED_WEB_EVIDENCE",
        supportLevel: "CONTEXT_ONLY",
        acquisitionLevel: "SEARCH_SNIPPET",
      })),
    });
    const evidence: EvidencePipeline = {
      async search() {
        return { data: {}, usage: [{ provider: "bocha", stage: "SEARCHING", callCount: 1 }] };
      },
      async crawl() {
        return { data: {}, usage: [{ provider: "crawler", stage: "CRAWLING", callCount: 0 }] };
      },
      async normalize() {
        return { evidence: snippetReport.evidence };
      },
    };
    const produce = vi.fn(async () => ({
      ok: true as const,
      report: snippetReport,
      usage: [{ provider: "deepseek", stage: "ANALYZING", callCount: 1 }],
    }));
    const producer: ReportProducer = {
      produce,
    };

    const result = await runDiagnosisPipeline(deps({ evidence, producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected limited success");
    expect(result.status).toBe("READY_LIMITED");
    expect(result.report.scores.overallScore).toBeNull();
    expect(result.report.coreIssues).toEqual([]);
    expect(result.report.geoOpportunities).toEqual([]);
    expect(result.report.limitedReport?.contentAssetPlans.length).toBeGreaterThanOrEqual(2);
    expect(produce).not.toHaveBeenCalled();
  });

  it("fails at VALIDATING_REPORT when the produced report is not canonical", async () => {
    const { id, token } = await createRequest("diag_inv", "tok_inv");
    const producer: ReportProducer = {
      async produce() {
        // Missing required fields → fails DiagnosisReport.safeParse.
        return { ok: true, report: { diagnosisId: id } as never };
      },
    };
    const result = await runDiagnosisPipeline(deps({ producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.failedStage).toBe("VALIDATING_REPORT");
    expect(result.error.code).toBe("REPORT_VALIDATION_FAILED");
  });

  it("fails at VALIDATING_REPORT when the report identity does not match", async () => {
    const { id, token } = await createRequest("diag_mis", "tok_mis");
    const producer: ReportProducer = {
      async produce() {
        return {
          ok: true,
          report: buildSampleReport({ diagnosisId: "someone_else", publicToken: "tok_other" }),
        };
      },
    };
    const result = await runDiagnosisPipeline(deps({ producer }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.failedStage).toBe("VALIDATING_REPORT");
    expect(result.error.code).toBe("REPORT_IDENTITY_MISMATCH");
  });

  it("reuses the ANALYZING checkpoint on a second identical run", async () => {
    const { id, token } = await createRequest("diag_reuse", "tok_reuse");
    const produce = vi.fn(createMockReportProducer().produce);
    const producer: ReportProducer = { produce };
    // One shared id sequence across both runs (mirrors a single-process
    // randomUUID stream), so the append-only usage log keeps unique ids.
    const idFactory = seq("gen");

    const first = await runDiagnosisPipeline(deps({ producer, idFactory }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });
    expect(first.ok).toBe(true);
    expect(produce).toHaveBeenCalledTimes(1);

    const second = await runDiagnosisPipeline(deps({ producer, idFactory }), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });
    expect(second.ok).toBe(true);
    // Second run served the report from the reusable checkpoint.
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("persists claim-evidence relations and counts the verifier stage in the budget", async () => {
    const { id, token } = await createRequest("diag_rel", "tok_rel");
    const result = await runDiagnosisPipeline(deps(), {
      diagnosisId: id,
      publicToken: token,
      input: VALID_INPUT,
    });
    expect(result.ok).toBe(true);

    const relations = await adapter.getClaimEvidenceRelations(id);
    expect(relations.length).toBeGreaterThan(0);
    expect(relations.every((r) => r.verifierMode === "MOCK_DETERMINISTIC")).toBe(true);
    // Every persisted relation is traceable to the verifier version that judged it.
    expect(relations.every((r) => r.verifierVersion.length > 0)).toBe(true);

    const usage = await adapter.getProviderUsage(id);
    expect(usage.some((u) => u.stage === "CLAIM_EVIDENCE_VERIFICATION")).toBe(true);
  });

  it("re-verifies when the verifier version changes (checkpoint invalidation)", async () => {
    const { id, token } = await createRequest("diag_ver", "tok_ver");
    const idFactory = seq("gen");
    const args = { diagnosisId: id, publicToken: token, input: VALID_INPUT };

    const v1 = countingVerifier("verifier.v1");
    await runDiagnosisPipeline(deps({ verifier: v1.strategy, idFactory }), args);
    expect(v1.calls()).toBeGreaterThan(0);

    // Same version + same input → verification checkpoint is reused (no re-verify).
    const v1again = countingVerifier("verifier.v1");
    await runDiagnosisPipeline(deps({ verifier: v1again.strategy, idFactory }), args);
    expect(v1again.calls()).toBe(0);

    // Bumped verifier version → checkpoint key changes → re-verify.
    const v2 = countingVerifier("verifier.v2");
    await runDiagnosisPipeline(deps({ verifier: v2.strategy, idFactory }), args);
    expect(v2.calls()).toBeGreaterThan(0);
  });
});
