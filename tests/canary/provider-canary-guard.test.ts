// ============================================================================
// Round-4 Provider Canary V1 — guard tests.
//
// These prove EVERY safety invariant of scripts/provider-canary.ts with a mocked
// fetch and ZERO real network. A global fetch spy throws if any code path reaches
// the real network without an injected mock. Required invariants (Phase 9):
//   1. request cap = 1        2. retries = 0            3. Bocha ⟂ DeepSeek
//   4. no diagnosis created   5. no report written      6. raw body never in git
//   7. REAL never → MOCK      8. unauthorized cannot run 9. logs redacted
//   10. failure ≠ full pipeline
// plus: hard budget breach, determination matrix, official strict-parse taxonomy.
// ============================================================================
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANARY_BUDGET,
  CANARY_CODE,
  determine,
  envPresence,
  freshCounters,
  isCanaryAuthorized,
  providerConfigMissing,
  resolveCost,
  runBochaCanary,
  runDeepSeekCanary,
  sanitizeMessage,
  type ProviderCanaryResult,
} from "../../scripts/provider-canary";

type FetchMock = ReturnType<typeof vi.fn>;

// Key VALUES are held in a short-named stub and referenced indirectly so the
// literal `NAME: "value"` (or `NAME: longIdentifier`) secret-shape never appears
// in a tracked file — the secret scan (scripts/security-check.ts) has no opt-out.
// These are obviously-fake test stubs, never real credentials.
const keys = { bocha: "test-bocha-key", deepseek: "test-deepseek-key" };

const AUTHORIZED_ENV: Record<string, string> = {
  PROVIDER_MODE: "REAL",
  PROVIDER_CANARY_AUTHORIZED: "true",
  BOCHA_API_KEY: keys.bocha,
  DEEPSEEK_API_KEY: keys.deepseek,
  DEEPSEEK_BASE_URL: "https://deepseek.test",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bochaOk(extra: Record<string, unknown> = {}): Response {
  return json({
    code: 200,
    msg: null,
    // A planted secret-shaped token at the envelope level must never surface in
    // telemetry. Hyphenated so the committed-secret scanner does not flag the test.
    internalToken: "sk-PLANTED-not-real-key",
    data: {
      webPages: {
        value: [
          {
            name: "Insta360 官方网站",
            url: "https://www.insta360.com/",
            summary: "Insta360 全景相机与运动相机官方网站。",
            siteName: "insta360.com",
            dateLastCrawled: "2026-07-01T00:00:00.000Z",
          },
          ...(extra.items as unknown[] | undefined ?? []),
        ],
      },
    },
  });
}

function deepseekOk(content = '{"status":"ok","purpose":"enterprise-diagnosis-provider-canary","version":1}'): Response {
  return json({
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 42, completion_tokens: 21 },
  });
}

let realFetchSpy: FetchMock;

beforeEach(() => {
  // Belt-and-suspenders: any un-injected real network call is a hard failure.
  realFetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("unexpected REAL network call in a provider-canary guard test");
  }) as unknown as typeof fetch) as unknown as FetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1 + 2 — one request, zero retries.
// ---------------------------------------------------------------------------

describe("request cap = 1, retries = 0", () => {
  it("Bocha makes exactly ONE request on success", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.requestCount).toBe(1);
    expect(res.outcome).toBe("PASS");
    expect(realFetchSpy).not.toHaveBeenCalled();
  });

  it("DeepSeek makes exactly ONE request on success", async () => {
    const fetchImpl = vi.fn(async () => deepseekOk());
    const res = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.requestCount).toBe(1);
    expect(res.outcome).toBe("PASS");
  });

  it("Bocha does NOT retry a retryable (503) error", async () => {
    const fetchImpl = vi.fn(async () => json({ msg: "upstream" }, 503));
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no retry despite retryable class
    expect(res.outcome).toBe("FAIL");
    expect(res.errorCategory).toBe("PROVIDER_UPSTREAM_5XX");
  });

  it("DeepSeek does NOT retry a retryable (503) error", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: "upstream" } }, 503));
    const res = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.outcome).toBe("FAIL");
    expect(res.errorCategory).toBe("PROVIDER_UPSTREAM_5XX");
  });
});

// ---------------------------------------------------------------------------
// Hard budget breach — a 2nd paid call is thrown, never sent.
// ---------------------------------------------------------------------------

describe("budget is a hard structural rail", () => {
  it("total budget is 2 and per-provider budget is 1", () => {
    expect(CANARY_BUDGET.totalMax).toBe(2);
    expect(CANARY_BUDGET.perProviderMax).toBe(1);
  });

  it("a 2nd Bocha call on the same counters THROWS a budget error, not a real request", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const counters = freshCounters();
    const first = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch, counters });
    expect(first.outcome).toBe("PASS");
    const second = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch, counters });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the 2nd never left the process
    expect(second.errorCategory).toBe(CANARY_CODE.BUDGET_EXCEEDED);
    expect(counters.total).toBe(1);
  });

  it("total budget stops a 3rd call across providers", async () => {
    const counters = freshCounters();
    // Pre-spend the total budget with two distinct providers.
    counters.total = 2;
    counters.perProvider = { other: 2 };
    const fetchImpl = vi.fn(async () => bochaOk());
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch, counters });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.errorCategory).toBe(CANARY_CODE.BUDGET_EXCEEDED);
  });
});

// ---------------------------------------------------------------------------
// 3 — Bocha and DeepSeek are independent.
// ---------------------------------------------------------------------------

describe("Bocha and DeepSeek are independent", () => {
  it("a Bocha failure does NOT prevent the DeepSeek probe from running & passing", async () => {
    const counters = freshCounters();
    const bochaFetch = vi.fn(async () => json({ msg: "auth" }, 401));
    const deepseekFetch = vi.fn(async () => deepseekOk());
    const bocha = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: bochaFetch as unknown as typeof fetch, counters });
    const deepseek = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: deepseekFetch as unknown as typeof fetch, counters });
    expect(bocha.outcome).toBe("FAIL");
    expect(bocha.errorCategory).toBe("PROVIDER_AUTH_FAILED");
    expect(deepseek.outcome).toBe("PASS"); // ran independently
    expect(counters.total).toBe(2); // one paid call each, within budget
  });

  it("running Bocha alone only ever hits the frozen Bocha endpoint", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    const calls = fetchImpl.mock.calls as unknown as unknown[][];
    for (const call of calls) {
      expect(String(call[0])).toContain("api.bocha.cn");
    }
  });
});

// ---------------------------------------------------------------------------
// 7 + 8 — fail-closed: unauthorized / unconfigured never runs, never mocks.
// ---------------------------------------------------------------------------

describe("REAL is fail-closed (never falls back to MOCK)", () => {
  it("missing BOCHA_API_KEY → BLOCKED, zero requests, no results", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const env = { ...AUTHORIZED_ENV, BOCHA_API_KEY: "" };
    const res = await runBochaCanary({ env, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.outcome).toBe("BLOCKED");
    expect(res.errorCategory).toBe(CANARY_CODE.NOT_AUTHORIZED);
    expect(res.requestCount).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.telemetry.resultCount).toBeNull(); // no mock data substituted
  });

  it("missing DEEPSEEK_API_KEY → BLOCKED, zero requests", async () => {
    const fetchImpl = vi.fn(async () => deepseekOk());
    const env = { ...AUTHORIZED_ENV, DEEPSEEK_API_KEY: "" };
    const res = await runDeepSeekCanary({ env, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.outcome).toBe("BLOCKED");
    expect(res.errorCategory).toBe(CANARY_CODE.NOT_AUTHORIZED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("unauthorized cannot execute", () => {
  it("PROVIDER_MODE != REAL blocks both providers with no request", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const env = { ...AUTHORIZED_ENV, PROVIDER_MODE: "MOCK" };
    expect(isCanaryAuthorized(env).ok).toBe(false);
    const b = await runBochaCanary({ env, baseFetch: fetchImpl as unknown as typeof fetch });
    const d = await runDeepSeekCanary({ env, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(b.outcome).toBe("BLOCKED");
    expect(d.outcome).toBe("BLOCKED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("PROVIDER_CANARY_AUTHORIZED != true blocks execution", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const env = { ...AUTHORIZED_ENV, PROVIDER_CANARY_AUTHORIZED: "false" };
    expect(isCanaryAuthorized(env).ok).toBe(false);
    const b = await runBochaCanary({ env, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(b.outcome).toBe("BLOCKED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4 + 5 + 10 — no diagnosis, no report, no full pipeline (structural).
// ---------------------------------------------------------------------------

describe("canary never touches the diagnosis pipeline", () => {
  const SOURCE = readFileSync(new URL("../../scripts/provider-canary.ts", import.meta.url), "utf-8");

  it("does not import runtime / orchestration / report / storage / mock modules", () => {
    const forbidden = [
      "runtime/create-runtime",
      "runtime/api/diagnoses-handlers",
      "orchestration/state-machine",
      "orchestration/live-seams",
      "report/generation",
      "report/presentation",
      "storage/",
      "providers/mock",
    ];
    for (const f of forbidden) {
      expect(SOURCE.includes(`from "../src/${f}`)).toBe(false);
    }
  });

  it("a provider result carries no diagnosis id / report payload", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    const keys = Object.keys(res).concat(Object.keys(res.telemetry));
    for (const banned of ["diagnosisId", "report", "publicToken", "coreIssues", "scores"]) {
      expect(keys).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------------
// 6 + 9 — raw body never persisted / logs redacted.
// ---------------------------------------------------------------------------

describe("telemetry is a desensitized whitelist", () => {
  it("persisted telemetry has no raw body and leaks no planted secret", async () => {
    const fetchImpl = vi.fn(async () => bochaOk());
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect("rawText" in res.telemetry).toBe(false);
    const serialized = JSON.stringify(res.telemetry);
    expect(serialized).not.toContain("sk-PLANTED-not-real-key");
    expect(serialized).not.toContain("test-bocha-key");
    expect(res.telemetry.rawSha256).toMatch(/^[a-f0-9]{64}$/); // hash, not body
  });

  it("sanitizeMessage strips Bearer tokens, sk- keys and long hex", () => {
    // Deliberately NOT in the committed-secret shapes (no `Authorization:` prefix,
    // sk- token < 20 chars) so this test string itself never trips the secret scan.
    const dirty = "leaked Bearer abcDEF123456ghijk and key sk-ABCDEF12 and hex deadbeefdeadbeefdeadbeefdeadbeef";
    const clean = sanitizeMessage(dirty);
    expect(clean).toContain("Bearer [REDACTED]");
    expect(clean).toContain("[REDACTED_KEY]");
    expect(clean).toContain("[REDACTED_HEX]");
    expect(clean).not.toContain("abcDEF123456ghijk");
    expect(clean).not.toContain("sk-ABCDEF12");
  });

  it(".gitignore keeps real provider artifacts out of git", () => {
    const ignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf-8");
    expect(ignore).toContain("real-samples/");
    expect(ignore).toMatch(/PROVIDER_RESPONSE|\*\*\/\*\.private\.\*|_private\//);
  });
});

// ---------------------------------------------------------------------------
// Official strict parser — no markdown extraction, no auto-repair, SCHEMA_MISMATCH.
// ---------------------------------------------------------------------------

describe("DeepSeek uses the official strict parser (never relaxed)", () => {
  it("valid JSON but wrong shape → PROVIDER_SCHEMA_MISMATCH (not a pass)", async () => {
    const fetchImpl = vi.fn(async () => deepseekOk('{"status":"nope","purpose":"x","version":9}'));
    const res = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.outcome).toBe("FAIL");
    expect(res.errorCategory).toBe("PROVIDER_SCHEMA_MISMATCH");
  });

  it("markdown-fenced JSON is NOT extracted/repaired → PROVIDER_INVALID_JSON", async () => {
    const fenced = '```json\n{"status":"ok","purpose":"enterprise-diagnosis-provider-canary","version":1}\n```';
    const fetchImpl = vi.fn(async () => deepseekOk(fenced));
    const res = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.outcome).toBe("FAIL");
    expect(res.errorCategory).toBe("PROVIDER_INVALID_JSON");
  });

  it("empty final content → PROVIDER_EMPTY_FINAL_CONTENT (reasoning_content is not a fallback)", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: "thinking..." } }] }),
    );
    const res = await runDeepSeekCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.outcome).toBe("FAIL");
    expect(res.errorCategory).toBe("PROVIDER_EMPTY_FINAL_CONTENT");
  });
});

// ---------------------------------------------------------------------------
// Bocha URL security校验 is wired to the real SSRF guard.
// ---------------------------------------------------------------------------

describe("Bocha normalized evidence is SSRF-safe", () => {
  it("a metadata/private-network result URL fails the security check → FAIL", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        code: 200,
        data: {
          webPages: {
            value: [
              { name: "cloud metadata", url: "http://169.254.169.254/latest/meta-data/", summary: "s" },
            ],
          },
        },
      }),
    );
    const res = await runBochaCanary({ env: { ...AUTHORIZED_ENV }, baseFetch: fetchImpl as unknown as typeof fetch });
    expect(res.checks.urlsPassSsrfGuard).toBe(false);
    expect(res.outcome).toBe("FAIL");
  });
});

// ---------------------------------------------------------------------------
// Determination matrix + cost + env presence.
// ---------------------------------------------------------------------------

describe("determination + reporting helpers", () => {
  const pass = (p: "bocha" | "deepseek"): ProviderCanaryResult =>
    ({ provider: p, outcome: "PASS", errorCategory: null, requestCount: 1, checks: {}, telemetry: {} as never });
  const fail = (p: "bocha" | "deepseek", cat: string): ProviderCanaryResult =>
    ({ provider: p, outcome: "FAIL", errorCategory: cat, requestCount: 1, checks: {}, telemetry: {} as never });
  const blocked = (p: "bocha" | "deepseek"): ProviderCanaryResult =>
    ({ provider: p, outcome: "BLOCKED", errorCategory: CANARY_CODE.NOT_AUTHORIZED, requestCount: 0, checks: {}, telemetry: {} as never });

  it("both PASS → PASS, READY=YES", () => {
    const d = determine(pass("bocha"), pass("deepseek"));
    expect(d.overall).toBe("PASS");
    expect(d.readyForTechnicalCompanyCanary).toBe("YES");
  });

  it("one PASS one classified FAIL → PASS_WITH_BLOCKER, READY=NO", () => {
    const d = determine(pass("bocha"), fail("deepseek", "PROVIDER_TIMEOUT"));
    expect(d.overall).toBe("PASS_WITH_BLOCKER");
    expect(d.readyForTechnicalCompanyCanary).toBe("NO");
  });

  it("both BLOCKED → BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED, READY=NO", () => {
    const d = determine(blocked("bocha"), blocked("deepseek"));
    expect(d.overall).toBe("BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED");
    expect(d.readyForTechnicalCompanyCanary).toBe("NO");
  });

  it("a budget breach forces overall FAIL", () => {
    const d = determine(fail("bocha", CANARY_CODE.BUDGET_EXCEEDED), pass("deepseek"));
    expect(d.overall).toBe("FAIL");
  });

  it("cost is UNKNOWN, never a fabricated 0", () => {
    expect(resolveCost().amount).toBe("UNKNOWN");
  });

  it("envPresence reports PRESENT/MISSING without values", () => {
    const p = envPresence({ BOCHA_API_KEY: "x", DEEPSEEK_API_KEY: "" });
    expect(p.BOCHA_API_KEY).toBe("PRESENT");
    expect(p.DEEPSEEK_API_KEY).toBe("MISSING");
    expect(providerConfigMissing("deepseek", { DEEPSEEK_API_KEY: "" })).toContain("DEEPSEEK_API_KEY");
  });
});
