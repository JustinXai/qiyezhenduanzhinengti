// Section 4 — Provider Mode is formal, controlled, and cannot be switched by a
// request/user; REAL never silently falls back to MOCK.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildProviders,
  resolveProviderMode,
  realProviderPreflight,
  ProviderModeError,
  PROVIDER_ERROR,
} from "../../src/runtime/create-runtime";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";
import { runDiagnosisPipeline } from "../../src/diagnosis/orchestration/state-machine";
import {
  handleCreateDiagnosis,
  handleGetDiagnosis,
  type DiagnosisView,
} from "../../src/runtime/api/diagnoses-handlers";
import { presentReport } from "../../src/report/presentation";

afterEach(() => vi.restoreAllMocks());

describe("Provider Mode (MOCK | REAL)", () => {
  it("1) MOCK mode makes ZERO network calls end-to-end", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
      throw new Error("unexpected network call in MOCK mode");
    }) as typeof fetch);
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      await storage.createDiagnosisRequest({ id: "d1", inputJson: "{}", publicToken: "tok" });
      const res = await runDiagnosisPipeline(
        { storage, evidence, producer },
        { diagnosisId: "d1", publicToken: "tok", input: { website: "https://demo.example.com" } },
      );
      expect(res.ok).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("2) REAL with missing provider config fails with REAL_PROVIDER_NOT_AUTHORIZED", () => {
    const err = realProviderPreflight({});
    expect(err).toBeInstanceOf(ProviderModeError);
    expect(err?.code).toBe(PROVIDER_ERROR.NOT_AUTHORIZED);
    expect(() => buildProviders("REAL", {})).toThrow(ProviderModeError);
  });

  it("3) REAL fully-configured but WITHOUT the technical-canary switch fails with TECHNICAL_COMPANY_CANARY_NOT_AUTHORIZED", () => {
    const env = { BOCHA_API_KEY: "x".repeat(20), DEEPSEEK_API_KEY: "y".repeat(20) };
    const err = realProviderPreflight(env);
    expect(err?.code).toBe(PROVIDER_ERROR.TECHNICAL_CANARY_NOT_AUTHORIZED);
    expect(() => buildProviders("REAL", env)).toThrow(/TECHNICAL_COMPANY_CANARY|canary/i);
  });

  it("4) REAL never silently falls back to MOCK (always throws)", () => {
    let providers: unknown = null;
    expect(() => {
      providers = buildProviders("REAL", { BOCHA_API_KEY: "x".repeat(20), DEEPSEEK_API_KEY: "y".repeat(20) });
    }).toThrow();
    expect(providers).toBeNull();
  });

  it("5) provider mode is read ONLY from controlled env, never a request/user input", () => {
    expect(resolveProviderMode({})).toBe("MOCK");
    expect(resolveProviderMode({ PROVIDER_MODE: "REAL" })).toBe("REAL");
    expect(resolveProviderMode({ PROVIDER_MODE: "mock" })).toBe("MOCK");
    // A request-shaped object (body/query/headers) cannot flip the mode — the
    // resolver only accepts an env map and ignores everything else.
    const requestLike = { body: { PROVIDER_MODE: "REAL" }, query: { providerMode: "REAL" } } as unknown as Record<
      string,
      string | undefined
    >;
    expect(resolveProviderMode(requestLike)).toBe("MOCK");
  });

  it("6) provider mode never appears in the public report payload", async () => {
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      const created = await handleCreateDiagnosis(
        { storage, evidence, producer },
        { website: "https://demo.example.com", brandName: "X" },
      );
      const b = created.body as { diagnosisId: string; publicToken: string };
      const got = await handleGetDiagnosis({ storage, evidence, producer }, { id: b.diagnosisId, publicToken: b.publicToken });
      const json = JSON.stringify(got.body);
      expect(json).not.toContain("PROVIDER_MODE");
      expect(json).not.toContain("providerMode");
    } finally {
      db.close();
    }
  });

  it("7) provider mode never reaches the customer view models", async () => {
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      const created = await handleCreateDiagnosis(
        { storage, evidence, producer },
        { website: "https://demo.example.com" },
      );
      const b = created.body as { diagnosisId: string; publicToken: string };
      const got = await handleGetDiagnosis({ storage, evidence, producer }, { id: b.diagnosisId, publicToken: b.publicToken });
      const report = (got.body as DiagnosisView).report!;
      const vm = JSON.stringify(presentReport(report));
      expect(vm).not.toContain("PROVIDER_MODE");
      expect(vm).not.toContain("providerMode");
    } finally {
      db.close();
    }
  });
});
