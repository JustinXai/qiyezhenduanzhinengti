// ============================================================================
// Round-5 — technical company canary guards.
//
// Covers the独立授权闸门 (Phase 5, 7 required tests), the frozen
// TECHNICAL_COMPANY_CANARY_V1 budget profile (Phase 6), and the real seams'
// behavior driven ENTIRELY by mocked providers — a global fetch spy proves zero
// real network in every test.
// ============================================================================
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProviders,
  realProviderPreflight,
  technicalCanaryAuthorized,
  PROVIDER_ERROR,
} from "../../src/runtime/create-runtime";
import {
  BudgetExceededError,
  CanaryBudgetTracker,
  TECHNICAL_COMPANY_CANARY_V1,
  budgetedSearchProvider,
  createRealEvidencePipeline,
  createRealReportProducer,
  extractPageSummary,
} from "../../src/diagnosis/orchestration/real-seams";
import { runDiagnosisPipeline } from "../../src/diagnosis/orchestration/state-machine";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";
import { handleCreateDiagnosis, handleGetDiagnosis } from "../../src/runtime/api/diagnoses-handlers";
import type {
  StructuredCompletionProvider,
  WebSearchProvider,
  WebSearchResultItem,
} from "../../src/providers/types";
import type { GuardedCrawler } from "../../src/security/crawler/guarded-crawler";
import { normalizeEvidence } from "../../src/diagnosis/evidence/normalize";
import { resolveRunConfig } from "../../scripts/technical-company-canary";

const SWITCH = ["TECHNICAL_COMPANY", "CANARY_AUTHORIZED"].join("_"); // avoid self-matching greps

// Fully-configured provider env WITHOUT the technical switch.
const keys = { bocha: "test-bocha-key", deepseek: "test-deepseek-key" };
const CONFIGURED = {
  BOCHA_API_KEY: keys.bocha,
  DEEPSEEK_API_KEY: keys.deepseek,
  DEEPSEEK_BASE_URL: "https://deepseek.test",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("unexpected REAL network call in a technical-canary guard test");
  }) as unknown as typeof fetch) as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => vi.restoreAllMocks());

describe("technical-canary isolated run profiles", () => {
  it("resolves zh-v2 only with its matching process-level profile", () => {
    const config = resolveRunConfig(
      ["--profile=zh-v2"],
      { TECHNICAL_CANARY_PROFILE: "TECHNICAL_COMPANY_CANARY_ZH_V2" },
    );
    expect(config.privateDir).toBe("E:/企业诊断智能体_private/technical-company-canary-zh-v2");
    expect(config.dbFile).toBe("technical-canary-zh-v2.sqlite");
    expect(config.round).toBe("technical-company-canary-zh-v2");
  });

  it("fails closed for a missing/mismatched or unknown profile", () => {
    expect(() => resolveRunConfig(["--profile=zh-v2"], {})).toThrow(/CANARY_PROFILE_MISMATCH/);
    expect(() => resolveRunConfig(["--profile=other"], {})).toThrow(/UNSUPPORTED_CANARY_PROFILE/);
  });

  it("keeps the legacy v1 path as the default without touching it", () => {
    const config = resolveRunConfig([], {});
    expect(config.privateDir).toBe("E:/企业诊断智能体_private/technical-company-canary-v1");
    expect(config.dbFile).toBe("technical-canary.sqlite");
  });
});

// ---------------------------------------------------------------------------
// Phase-5 authorization gate — the 7 required tests.
// ---------------------------------------------------------------------------

describe("technical-canary authorization gate", () => {
  it("1) REAL providers configured but full diagnosis NOT authorized → typed refusal", () => {
    const err = realProviderPreflight(CONFIGURED);
    expect(err?.code).toBe(PROVIDER_ERROR.TECHNICAL_CANARY_NOT_AUTHORIZED);
    expect(() => buildProviders("REAL", CONFIGURED)).toThrow(/TECHNICAL_COMPANY_CANARY/);
  });

  it("2) an API body field cannot enable authorization (strict input rejects; env decides)", async () => {
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      // The strict DiagnosisInput schema rejects an injected switch field outright.
      const res = await handleCreateDiagnosis(
        { storage, evidence, producer },
        { website: "https://demo.example.com", [SWITCH]: "true" },
      );
      expect(res.status).toBe(400);
      // And the gate itself only reads the env map it is given.
      expect(technicalCanaryAuthorized({})).toBe(false);
    } finally {
      db.close();
    }
  });

  it("3) a query-parameter-shaped object cannot enable authorization", () => {
    const requestLike = {
      query: { [SWITCH]: "true" },
      body: { [SWITCH]: "true" },
    } as unknown as Record<string, string | undefined>;
    expect(technicalCanaryAuthorized(requestLike)).toBe(false);
  });

  it("4) the switch is server-only: never NEXT_PUBLIC, never referenced by client code", () => {
    expect(SWITCH.startsWith("NEXT_PUBLIC")).toBe(false);
    // Client-delivered code lives under app/ and components/ — the switch name
    // must not appear there (it exists only in server runtime + scripts/tests).
    const tracked = execSync("git ls-files app components", { encoding: "utf-8" })
      .split("\n")
      .filter((f) => /\.(ts|tsx|js|jsx|css)$/.test(f));
    for (const file of tracked) {
      expect(readFileSync(file, "utf-8")).not.toContain(SWITCH);
    }
  });

  it("5) authorization state never enters the public API payload", async () => {
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      const created = await handleCreateDiagnosis(
        { storage, evidence, producer },
        { website: "https://demo.example.com", brandName: "边界" },
      );
      const b = created.body as { diagnosisId: string; publicToken: string };
      const got = await handleGetDiagnosis(
        { storage, evidence, producer },
        { id: b.diagnosisId, publicToken: b.publicToken },
      );
      const json = JSON.stringify(got.body);
      expect(json).not.toContain(SWITCH);
      expect(json).not.toContain("TECHNICAL_CANARY");
    } finally {
      db.close();
    }
  });

  it("6) MOCK tests are unaffected by the new gate (zero network, READY)", async () => {
    const db = openMigratedDatabase(":memory:");
    try {
      const storage = new SqliteStorageAdapter(db);
      const { evidence, producer } = buildProviders("MOCK");
      await storage.createDiagnosisRequest({ id: "d1", inputJson: "{}", publicToken: "t1" });
      const res = await runDiagnosisPipeline(
        { storage, evidence, producer },
        { diagnosisId: "d1", publicToken: "t1", input: { website: "https://demo.example.com" } },
      );
      expect(res.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("7) when unauthorized, provider call count is ZERO (throws before any provider exists)", () => {
    expect(() => buildProviders("REAL", CONFIGURED)).toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("authorization additionally requires DIAGNOSIS_SMOKE_MODE=false", () => {
    expect(technicalCanaryAuthorized({ [SWITCH]: "true" })).toBe(false);
    expect(technicalCanaryAuthorized({ [SWITCH]: "true", DIAGNOSIS_SMOKE_MODE: "true" })).toBe(false);
    expect(technicalCanaryAuthorized({ [SWITCH]: "true", DIAGNOSIS_SMOKE_MODE: "false" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase-6 frozen budget profile + tracker rails.
// ---------------------------------------------------------------------------

describe("TECHNICAL_COMPANY_CANARY_V1 budget", () => {
  it("profile constants are frozen as specified", () => {
    expect(TECHNICAL_COMPANY_CANARY_V1.bocha).toEqual({ expectedMax: 10, hardMax: 12, retries: 0 });
    expect(TECHNICAL_COMPANY_CANARY_V1.deepseek).toEqual({ expectedMax: 6, hardMax: 8, retries: 0 });
    expect(TECHNICAL_COMPANY_CANARY_V1.crawl).toEqual({
      maxPagesTotal: 12,
      maxPagesPerDomain: 8,
      maxFirstPartyPages: 8,
      maxCompetitorPages: 4,
    });
    expect(TECHNICAL_COMPANY_CANARY_V1.wallClockMs).toBe(15 * 60 * 1000);
  });

  it("bocha hard cap: the 13th charge throws BUDGET_EXCEEDED", () => {
    const t = new CanaryBudgetTracker();
    for (let i = 0; i < 12; i++) t.chargeBocha();
    expect(() => t.chargeBocha()).toThrow(BudgetExceededError);
    expect(t.bochaCalls).toBe(12);
  });

  it("deepseek hard cap: the 9th charge throws BUDGET_EXCEEDED", () => {
    const t = new CanaryBudgetTracker();
    for (let i = 0; i < 8; i++) t.chargeDeepSeek();
    expect(() => t.chargeDeepSeek()).toThrow(BudgetExceededError);
  });

  it("crawl caps skip (never breach): total 12, per-domain 8, competitor 4", () => {
    const t = new CanaryBudgetTracker();
    // Per-domain cap.
    for (let i = 0; i < 8; i++) expect(t.tryChargeCrawl("a.com", false)).toBe(true);
    expect(t.tryChargeCrawl("a.com", false)).toBe(false);
    // Competitor cap.
    for (let i = 0; i < 4; i++) expect(t.tryChargeCrawl("comp.com", true)).toBe(true);
    expect(t.tryChargeCrawl("comp.com", true)).toBe(false);
    // Total cap (8 + 4 = 12 pages already).
    expect(t.tryChargeCrawl("b.com", false)).toBe(false);
    expect(t.crawledPages).toBe(12);
  });

  it("wall clock breach throws on the next charge", () => {
    let nowMs = 0;
    const t = new CanaryBudgetTracker(TECHNICAL_COMPANY_CANARY_V1, () => nowMs);
    t.chargeBocha();
    nowMs = TECHNICAL_COMPANY_CANARY_V1.wallClockMs + 1;
    expect(() => t.chargeBocha()).toThrow(BudgetExceededError);
  });

  it("budgeted search charges BEFORE the call — an over-cap call never leaves", async () => {
    const inner = vi.fn(async () => ({ ok: true as const, results: [] }));
    const t = new CanaryBudgetTracker();
    for (let i = 0; i < 12; i++) t.chargeBocha();
    const provider = budgetedSearchProvider({ search: inner } as unknown as WebSearchProvider, t);
    await expect(provider.search("q")).rejects.toThrow(BudgetExceededError);
    expect(inner).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Real seams driven by mocked providers (zero network).
// ---------------------------------------------------------------------------

const COMPANY = "https://www.example-cam.com/";
const INPUT = {
  website: COMPANY,
  brandName: "示例影像",
  industry: "消费电子",
  competitors: ["示例竞品"],
  notes: "Q: 运动相机怎么选?\nQ: 全景相机与普通相机的区别?",
};

function searchItem(url: string, title: string, official = false): WebSearchResultItem {
  return {
    title: official ? `${title} - 官方网站` : title,
    url,
    snippet: `${title} 页面摘要`,
    sourceDomain: new URL(url).hostname,
    fetchedAt: "2026-07-01T00:00:00.000Z",
  };
}

/** Mock Bocha: competitor-resolution queries find one official host; others return company pages. */
function mockBocha(): WebSearchProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async search(query: string) {
      calls.push(query);
      if (/官网|官方网站|official site/.test(query) && query.includes("示例竞品")) {
        return { ok: true, results: [searchItem("https://rival-cam.example.com/", "示例竞品", true)] };
      }
      return {
        ok: true,
        results: [
          searchItem("https://www.example-cam.com/", "示例影像官网首页"),
          searchItem("https://www.example-cam.com/products", "产品中心"),
          searchItem("https://news.example.org/review", "行业评测报道"),
        ],
      };
    },
  };
}

function mockCrawler(): GuardedCrawler & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async crawl(url: string) {
      urls.push(url);
      return {
        ok: true as const,
        finalUrl: url,
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>页面标题</title><meta name="description" content="真实页面描述"></head><body><h1>主标题</h1><p>页面正文内容,介绍产品能力与服务范围。</p></body></html>`,
        redirectChain: [url],
      };
    },
  } as unknown as GuardedCrawler & { urls: string[] };
}

describe("real evidence pipeline (mocked providers)", () => {
  it("plans capped queries, resolves competitors, crawls only company/competitor domains, normalizes with coverage", async () => {
    const bocha = mockBocha();
    const crawler = mockCrawler();
    const tracker = new CanaryBudgetTracker();
    const pipeline = createRealEvidencePipeline({ bocha, crawler, tracker, now: () => "2026-07-18T00:00:00.000Z" });
    const ctx = { diagnosisId: "d1", input: INPUT } as Parameters<typeof pipeline.search>[0];

    const search = await pipeline.search(ctx);
    // 1 resolution call + ≤8 planned queries, all within the hard cap.
    expect(tracker.bochaCalls).toBeGreaterThanOrEqual(2);
    expect(tracker.bochaCalls).toBeLessThanOrEqual(1 + TECHNICAL_COMPANY_CANARY_V1.maxPlannedQueries);

    const crawl = await pipeline.crawl(ctx, search);
    // Only first-party + confirmed competitor domains are crawled.
    for (const u of crawler.urls) {
      expect(/example-cam\.com|rival-cam\.example\.com/.test(u)).toBe(true);
    }
    expect(tracker.crawledPages).toBeLessThanOrEqual(TECHNICAL_COMPANY_CANARY_V1.crawl.maxPagesTotal);

    const normalized = await pipeline.normalize(ctx, crawl);
    expect(normalized.evidence.length).toBeGreaterThan(0);
    expect(normalized.coverage).toBeDefined();
    const types = new Set(normalized.evidence.map((e) => e.sourceType));
    expect(types.has("FIRST_PARTY_EVIDENCE")).toBe(true);
    expect(types.has("COMPETITOR_WEB_EVIDENCE")).toBe(true);
    // Crawled first-party evidence carries enriched real-page content.
    const fp = normalized.evidence.find((e) => e.sourceType === "FIRST_PARTY_EVIDENCE");
    expect(fp?.snippet).toContain("真实页面描述");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws SEARCH_INSUFFICIENT when every planned query fails (no retry)", async () => {
    const failing: WebSearchProvider = {
      async search() {
        return {
          ok: false,
          error: { code: "PROVIDER_UPSTREAM_5XX", message: "boom", retryable: true },
        };
      },
    };
    const tracker = new CanaryBudgetTracker();
    const pipeline = createRealEvidencePipeline({ bocha: failing, crawler: mockCrawler(), tracker });
    const ctx = { diagnosisId: "d1", input: { website: COMPANY } } as Parameters<typeof pipeline.search>[0];
    await expect(pipeline.search(ctx)).rejects.toThrow(/SEARCH_INSUFFICIENT/);
    // No retries: calls = planned queries only.
    expect(tracker.bochaCalls).toBeLessThanOrEqual(TECHNICAL_COMPANY_CANARY_V1.maxPlannedQueries);
  });
});

describe("real report producer (mocked DeepSeek)", () => {
  function evidenceFixture() {
    return normalizeEvidence(
      [
        searchItem("https://www.example-cam.com/", "官网首页"),
        searchItem("https://www.example-cam.com/products", "产品中心"),
        searchItem("https://news.example.org/review", "行业评测"),
        searchItem("https://rival-cam.example.com/", "竞品官网"),
      ],
      { companyDomains: ["example-cam.com"], competitorDomains: ["rival-cam.example.com"] },
    );
  }

  function stageJson(stage: string, ev: ReturnType<typeof evidenceFixture>): unknown {
    const fp = ev.filter((e) => e.sourceType === "FIRST_PARTY_EVIDENCE");
    const comp = ev.filter((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE");
    const obs = ev.filter((e) => e.sourceType === "OBSERVED_WEB_EVIDENCE");
    switch (stage) {
      case "company_profile":
        return {
          brandName: "示例影像",
          industry: "消费电子",
          productOrService: "运动相机",
          targetRegion: "全球",
          competitors: ["示例竞品"],
          unresolvedQuestions: ["官网未说明保修期"],
        };
      case "dimension_signals":
        return {
          companyClarity: {
            criteria: [
              { key: "brandIdentityClear", rating: "PRESENT" },
              { key: "offeringClear", rating: "PRESENT" },
              { key: "targetCustomerClear", rating: "PARTIAL" },
              { key: "valuePropositionClear", rating: "PARTIAL" },
            ],
            evidenceIds: [fp[0]!.id],
          },
          websiteCompleteness: {
            criteria: [
              { key: "productInfo", rating: "PRESENT" },
              { key: "companyBackground", rating: "PARTIAL" },
              { key: "contactChannel", rating: "PARTIAL" },
              { key: "processOrPricing", rating: "ABSENT" },
              { key: "caseOrProof", rating: "PARTIAL" },
            ],
            evidenceIds: [fp[1]!.id],
          },
          customerQuestionCoverage: {
            criteria: [
              { key: "purchaseDecisionQuestions", rating: "PARTIAL" },
              { key: "comparisonQuestions", rating: "ABSENT" },
              { key: "deliveryAndAfterSales", rating: "PARTIAL" },
              { key: "structuredFaq", rating: "ABSENT" },
            ],
            evidenceIds: [fp[1]!.id],
          },
          trustEvidence: {
            criteria: [
              { key: "thirdPartyCredentials", rating: "PARTIAL" },
              { key: "verifiableCases", rating: "PARTIAL" },
              { key: "mediaOrPublicMentions", rating: "PRESENT" },
              { key: "customerTestimonials", rating: "ABSENT" },
            ],
            evidenceIds: [obs[0]!.id],
          },
        };
      case "ai_visibility":
        return {
          tests: [
            {
              id: "aiv_q1",
              questionCategory: "PURCHASE_DECISION",
              question: "运动相机怎么选?",
              answerText: "选择运动相机时建议关注防抖、画质与配件生态,示例影像和其他品牌都有相应产品线。",
              accuracy: "PARTIAL",
              recommendationStrength: "WEAK",
              evidenceIds: [],
            },
            {
              id: "aiv_brand_1",
              questionCategory: "BRAND_DIRECT",
              question: "示例影像主要提供什么产品?",
              answerText: "示例影像主要提供运动相机与配件。",
              accuracy: "ACCURATE",
              recommendationStrength: "MODERATE",
              evidenceIds: [],
            },
            {
              id: "aiv_brand_2",
              questionCategory: "BRAND_DIRECT",
              question: "示例影像的特点?",
              answerText: "该品牌以防抖技术见长。",
              evidenceIds: [],
            },
          ],
        };
      case "claims":
        return {
          strengths: [
            {
              statement: "官网清晰展示了产品线",
              businessImpact: "客户能快速了解产品",
              claimType: "DIAGNOSTIC_INFERENCE",
              evidenceIds: [fp[0]!.id],
            },
          ],
          coreIssues: [
            {
              statement: "本次检查的公开页面中未发现结构化FAQ",
              businessImpact: "购买决策信息获取成本高",
              claimType: "DIAGNOSTIC_INFERENCE",
              fixDirection: "补充FAQ",
              evidenceIds: [fp[1]!.id],
            },
          ],
          geoOpportunities: [
            {
              statement: "建立选型问答内容",
              businessImpact: "承接AI问答流量",
              claimType: "DIAGNOSTIC_INFERENCE",
              customerQuestion: "怎么选运动相机?",
              contentGap: "缺少选型指南",
              evidenceIds: [fp[1]!.id],
            },
          ],
          competitorGaps: [
            {
              competitorName: "示例竞品",
              gapStatement: "竞品官网公开展示了配件生态,本企业官网本次检查未发现同类信息",
              evidenceIds: [comp[0]!.id],
            },
          ],
          demonstrationFix: null,
        };
      default:
        return {};
    }
  }

  function mockDeepSeek(ev: ReturnType<typeof evidenceFixture>): StructuredCompletionProvider & { stages: string[] } {
    const stages: string[] = [];
    return {
      stages,
      async completeJson({ stage }) {
        stages.push(stage);
        return { ok: true, json: stageJson(stage, ev) };
      },
    };
  }

  it("makes exactly 4 stage calls and assembles a canonical report", async () => {
    const ev = evidenceFixture();
    const deepseek = mockDeepSeek(ev);
    const tracker = new CanaryBudgetTracker();
    const producer = createRealReportProducer({
      deepseek,
      tracker,
      model: "deepseek-v4-flash",
      clock: () => new Date("2026-07-18T00:00:00.000Z"),
    });
    const res = await producer.produce({
      diagnosisId: "d1",
      publicToken: "tok1",
      input: INPUT,
      evidence: ev,
    });
    expect(deepseek.stages).toEqual(["company_profile", "dimension_signals", "ai_visibility", "claims"]);
    expect(tracker.deepseekCalls).toBe(4);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.diagnosisId).toBe("d1");
      expect(res.report.coreIssues.length).toBeGreaterThan(0);
      // Numeric scoring is computed programmatically — model emitted none.
      expect(res.report.scores.scoreCoverage).toBeGreaterThanOrEqual(0);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a stage schema mismatch fails WITHOUT retry (that stage called once)", async () => {
    const ev = evidenceFixture();
    const bad: StructuredCompletionProvider & { calls: number } = {
      calls: 0,
      async completeJson() {
        bad.calls += 1;
        return { ok: true, json: { totally: "wrong-shape" } };
      },
    };
    const tracker = new CanaryBudgetTracker();
    const producer = createRealReportProducer({ deepseek: bad, tracker, model: "m" });
    const res = await producer.produce({
      diagnosisId: "d1",
      publicToken: "tok1",
      input: INPUT,
      evidence: ev,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("REPORT_COMPANY_PROFILE_FAILED");
    expect(bad.calls).toBe(1); // failed on the first stage, no retry, no further stages
  });
});

describe("page-summary extraction", () => {
  it("extracts bounded title/description/body text and survives bad HTML", () => {
    const good = extractPageSummary(
      `<html><head><title>T</title><meta name="description" content="D"></head><body><h1>H</h1><p>Body text</p></body></html>`,
    );
    expect(good.title).toBe("T");
    expect(good.text).toContain("D");
    expect(good.text).toContain("H");
    const bad = extractPageSummary(" <not-html");
    expect(typeof bad.text).toBe("string");
  });
});

describe("structural safety", () => {
  it("real-seams never imports storage or presentation (no pipeline shortcut)", () => {
    const src = readFileSync(
      new URL("../../src/diagnosis/orchestration/real-seams.ts", import.meta.url),
      "utf-8",
    );
    expect(src).not.toContain("../../storage");
    expect(src).not.toContain("report/presentation");
    expect(src).not.toContain("diagnoses-handlers");
  });
});
