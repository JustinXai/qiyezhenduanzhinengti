// ============================================================================
// Round-4B — shared CLI environment loading + ServerEnv schema guards.
//
// Ten invariants (Phase 5):
//   1. .env.local is loadable by a CLI process
//   2. process-explicit vars win over .env.local
//   3. env values never reach logs
//   4. missing keys → fail-closed (REAL_PROVIDER_NOT_AUTHORIZED, names only)
//   5. MOCK is the default and is never treated as an authorized real run
//   6. REAL requires explicit authorization
//   7. the front-end bundle carries no provider config (no NEXT_PUBLIC exposure)
//   8. the public API surface returns no provider config
//   9. .env.local is git-ignored
//  10. the canary keeps ≤1 request/provider and 0 retries
// ============================================================================
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadEnvironment,
  MANAGED_ENV_KEYS,
  resetEnvironmentLoadedFlag,
} from "../../src/runtime/load-environment";
import {
  parseServerEnv,
  resolveDevelopmentConfig,
  resolveProviderCanaryConfig,
} from "../../src/runtime/server-env";
import { CANARY_BUDGET, CANARY_MAX_RETRIES } from "../../scripts/provider-canary";
import { presentReport } from "../../src/report/presentation";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

/** Create a throwaway project dir holding a .env.local; returns [dir, cleanup]. */
function withEnvLocal(contents: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "canary-env-"));
  writeFileSync(join(dir, ".env.local"), contents);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** @next/env skips .env.local when NODE_ENV==='test'; run body as non-test. */
function asNonTestEnv<T>(fn: () => T): T {
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = "development";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev;
  }
}

const MANAGED = [...MANAGED_ENV_KEYS];

beforeEach(() => {
  resetEnvironmentLoadedFlag();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of MANAGED) delete process.env[k];
  delete process.env.CANARY_ENV_PROBE;
});

// 1 ----------------------------------------------------------------------------
describe("1. .env.local is loadable by a CLI process", () => {
  it("populates process.env from a project-root .env.local", () => {
    const { dir, cleanup } = withEnvLocal("CANARY_ENV_PROBE=loaded-from-file\n");
    try {
      delete process.env.CANARY_ENV_PROBE;
      asNonTestEnv(() => loadEnvironment({ dir, force: true }));
      expect(process.env.CANARY_ENV_PROBE).toBe("loaded-from-file");
    } finally {
      cleanup();
    }
  });
});

// 2 ----------------------------------------------------------------------------
describe("2. process-explicit vars win over .env.local", () => {
  it("does not override a variable already set in the process", () => {
    const { dir, cleanup } = withEnvLocal("PROVIDER_MODE=MOCK\n");
    try {
      process.env.PROVIDER_MODE = "REAL"; // explicit process setting
      asNonTestEnv(() => loadEnvironment({ dir, force: true }));
      expect(process.env.PROVIDER_MODE).toBe("REAL");
    } finally {
      cleanup();
    }
  });
});

// 3 ----------------------------------------------------------------------------
describe("3. env values never reach logs", () => {
  it("loading does not print any secret value to the console", () => {
    const secret = "supersecret-value-do-not-print";
    const { dir, cleanup } = withEnvLocal(`CANARY_ENV_PROBE=${secret}\n`);
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    try {
      asNonTestEnv(() => loadEnvironment({ dir, force: true }));
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(secret);
        }
      }
    } finally {
      cleanup();
    }
  });
});

// 4 ----------------------------------------------------------------------------
describe("4. missing keys → fail-closed", () => {
  it("returns REAL_PROVIDER_NOT_AUTHORIZED with field NAMES only, no values", () => {
    const res = resolveProviderCanaryConfig({
      PROVIDER_MODE: "REAL",
      PROVIDER_CANARY_AUTHORIZED: "true",
      BOCHA_API_KEY: "noleak", // short value (present); others absent
      // BOCHA_BASE_URL / DEEPSEEK_* absent
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("REAL_PROVIDER_NOT_AUTHORIZED");
      expect(res.missing).toEqual(
        expect.arrayContaining(["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "BOCHA_BASE_URL"]),
      );
      // The failure path carries field NAMES only — never the present value.
      expect(JSON.stringify(res)).not.toContain("noleak");
    }
  });
});

// 5 ----------------------------------------------------------------------------
describe("5. MOCK is the default and never an authorized real run", () => {
  it("defaults to MOCK and refuses a real canary in MOCK mode", () => {
    expect(resolveDevelopmentConfig({}).providerMode).toBe("MOCK");
    expect(parseServerEnv({}).PROVIDER_MODE).toBe("MOCK");
    const res = resolveProviderCanaryConfig({
      PROVIDER_MODE: "MOCK",
      PROVIDER_CANARY_AUTHORIZED: "true",
      BOCHA_API_KEY: "k",
      BOCHA_BASE_URL: "u",
      DEEPSEEK_API_KEY: "k",
      DEEPSEEK_BASE_URL: "u",
      DEEPSEEK_MODEL: "m",
    });
    expect(res.ok).toBe(false);
  });
});

// 6 ----------------------------------------------------------------------------
describe("6. REAL requires explicit authorization", () => {
  const full = {
    PROVIDER_MODE: "REAL",
    BOCHA_API_KEY: "k",
    BOCHA_BASE_URL: "u",
    DEEPSEEK_API_KEY: "k",
    DEEPSEEK_BASE_URL: "u",
    DEEPSEEK_MODEL: "m",
  };
  it("REAL without PROVIDER_CANARY_AUTHORIZED is refused", () => {
    expect(resolveProviderCanaryConfig({ ...full, PROVIDER_CANARY_AUTHORIZED: "false" }).ok).toBe(false);
  });
  it("REAL with full config + authorization is accepted", () => {
    const res = resolveProviderCanaryConfig({ ...full, PROVIDER_CANARY_AUTHORIZED: "true" });
    expect(res.ok).toBe(true);
  });
});

// 7 ----------------------------------------------------------------------------
describe("7. no provider config is exposed to the client bundle", () => {
  const loaderSrc = readFileSync(new URL("../../src/runtime/load-environment.ts", import.meta.url), "utf-8");
  const schemaSrc = readFileSync(new URL("../../src/runtime/server-env.ts", import.meta.url), "utf-8");

  it("no managed key is a NEXT_PUBLIC_ variable", () => {
    for (const k of MANAGED) expect(k.startsWith("NEXT_PUBLIC")).toBe(false);
  });

  it("the loader/schema declare no NEXT_PUBLIC_ provider variable and the loader is server-only", () => {
    // A real client-exposed var is `NEXT_PUBLIC_<NAME>`; match that, not the prose.
    expect(loaderSrc).not.toMatch(/NEXT_PUBLIC_[A-Z]/);
    expect(schemaSrc).not.toMatch(/NEXT_PUBLIC_[A-Z]/);
    expect(loaderSrc).toContain('typeof window !== "undefined"'); // server-only guard
  });
});

// 8 ----------------------------------------------------------------------------
describe("8. the public API surface returns no provider config", () => {
  it("presented Quick/Deep/Evidence view models carry no provider secrets/config", () => {
    const { quick, deep, evidence } = presentReport(SAMPLE_DIAGNOSIS_REPORT);
    const serialized = JSON.stringify({ quick, deep, evidence });
    for (const token of [
      ...MANAGED,
      "api.bocha.cn",
      "aliyuncs.com",
      "compatible-mode",
      "Bearer",
    ]) {
      expect(serialized).not.toContain(token);
    }
  });
});

// 9 ----------------------------------------------------------------------------
describe("9. .env.local is git-ignored", () => {
  it("git check-ignore reports .env.local as ignored", () => {
    let ignored = false;
    try {
      // vitest runs with cwd = repo root; git check-ignore exits 0 when ignored.
      const out = execSync("git check-ignore .env.local", { encoding: "utf-8" });
      ignored = out.trim().length > 0;
    } catch {
      ignored = false;
    }
    expect(ignored).toBe(true);
  });
});

// 10 ---------------------------------------------------------------------------
describe("10. canary keeps ≤1 request/provider and 0 retries", () => {
  it("budget + retry constants are unchanged by the env refactor", () => {
    expect(CANARY_BUDGET.totalMax).toBe(2);
    expect(CANARY_BUDGET.perProviderMax).toBe(1);
    expect(CANARY_MAX_RETRIES).toBe(0);
  });
});
