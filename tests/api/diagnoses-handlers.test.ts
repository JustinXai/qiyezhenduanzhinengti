import { describe, expect, it } from "vitest";
import { DiagnosisReport } from "../../src/contracts";
import {
  handleCreateDiagnosis,
  handleGetDiagnosis,
  type DiagnosesApiDeps,
  type DiagnosisView,
} from "../../src/runtime/api/diagnoses-handlers";
import {
  createMockEvidencePipeline,
  createMockReportProducer,
} from "../../src/diagnosis/orchestration/mocks";
import type { ReportProducer } from "../../src/diagnosis/orchestration/state-machine";
import { InMemoryStorageAdapter } from "./in-memory-storage";

const NOW = new Date("2026-07-18T00:00:00.000Z");

function makeDeps(overrides: Partial<DiagnosesApiDeps> = {}): DiagnosesApiDeps {
  let n = 0;
  return {
    storage: new InMemoryStorageAdapter(() => NOW),
    evidence: createMockEvidencePipeline(),
    producer: createMockReportProducer(),
    idFactory: () => `gen_${++n}`,
    newDiagnosisId: () => "diag_fixed",
    newPublicToken: () => "tok_fixed",
    ...overrides,
  };
}

const VALID_BODY = { website: "https://example-equip.com", brandName: "示例智能装备" };

describe("POST /api/diagnoses (handleCreateDiagnosis)", () => {
  it("creates a diagnosis and drives it to READY", async () => {
    const res = await handleCreateDiagnosis(makeDeps(), VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      diagnosisId: "diag_fixed",
      publicToken: "tok_fixed",
      status: "READY",
    });
  });

  it("rejects an invalid input with 400 and issue detail", async () => {
    const res = await handleCreateDiagnosis(makeDeps(), { website: "not-a-url" });
    expect(res.status).toBe(400);
    const body = res.body as { error: string; issues: unknown[] };
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects a non-object body with 400 (bad/empty JSON)", async () => {
    expect((await handleCreateDiagnosis(makeDeps(), null)).status).toBe(400);
    expect((await handleCreateDiagnosis(makeDeps(), "oops")).status).toBe(400);
  });

  it("rejects unknown fields (strict input contract)", async () => {
    const res = await handleCreateDiagnosis(makeDeps(), {
      ...VALID_BODY,
      unexpected: true,
    });
    expect(res.status).toBe(400);
  });

  it("surfaces a FAILED pipeline outcome but still creates the request", async () => {
    const producer: ReportProducer = {
      async produce() {
        return { ok: false, error: { code: "PROVIDER_TIMEOUT", message: "timeout" } };
      },
    };
    const deps = makeDeps({ producer });
    const res = await handleCreateDiagnosis(deps, VALID_BODY);
    expect(res.status).toBe(201);
    expect((res.body as { status: string }).status).toBe("FAILED");

    const get = await handleGetDiagnosis(deps, { id: "diag_fixed" });
    const view = get.body as DiagnosisView;
    expect(view.status).toBe("FAILED");
    expect(view.report).toBeNull();
  });
});

describe("GET /api/diagnoses/[id] (handleGetDiagnosis)", () => {
  it("returns status + a valid canonical report by id", async () => {
    const deps = makeDeps();
    await handleCreateDiagnosis(deps, VALID_BODY);
    const res = await handleGetDiagnosis(deps, { id: "diag_fixed" });
    expect(res.status).toBe(200);
    const view = res.body as DiagnosisView;
    expect(view.status).toBe("READY");
    expect(view.report).not.toBeNull();
    expect(view.report!.diagnosisId).toBe("diag_fixed");
    expect(view.report!.publicToken).toBe("tok_fixed");
    // The served report round-trips through the canonical schema.
    expect(() => DiagnosisReport.parse(view.report)).not.toThrow();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await handleGetDiagnosis(makeDeps(), { id: "missing" });
    expect(res.status).toBe(404);
  });

  it("resolves the read-only report by public token", async () => {
    const deps = makeDeps();
    await handleCreateDiagnosis(deps, VALID_BODY);
    const res = await handleGetDiagnosis(deps, {
      id: "ignored-in-token-mode",
      publicToken: "tok_fixed",
    });
    expect(res.status).toBe(200);
    const view = res.body as DiagnosisView;
    expect(view.diagnosisId).toBe("diag_fixed");
    expect(view.report!.publicToken).toBe("tok_fixed");
  });

  it("returns 404 for an unknown public token", async () => {
    const deps = makeDeps();
    await handleCreateDiagnosis(deps, VALID_BODY);
    const res = await handleGetDiagnosis(deps, { id: "x", publicToken: "wrong" });
    expect(res.status).toBe(404);
  });
});
