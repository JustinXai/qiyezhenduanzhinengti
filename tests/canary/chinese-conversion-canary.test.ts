// ============================================================================
// Round-5.1 中文成交版 canaries + guards. ZERO network (fetch spy throws).
//
//   Canary A — 中文企业、中文官网、中文证据充分 → all-Chinese Quick/Deep with a
//              publishable opportunity (sourceIssueId linked).
//   Canary B — 英文品牌名 + 中文网络 → brand stays English, explanations Chinese.
//   Canary C — 中文证据不足 → 英文官方 fallback kept as evidence with原文 title,
//              Chinese summaries + boundary intact.
//
// Plus unit guards: ChinesePublicReportGuard rules, measurementComposition,
// evidence tiering/dedup caps, ZH query buckets, ASCII-brand English-first
// resolution, claims reasonCodes + opportunity linkage.
// ============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CanaryBudgetTracker,
  createRealEvidencePipeline,
  createRealReportProducer,
} from "../../src/diagnosis/orchestration/real-seams";
import type { GuardedCrawler } from "../../src/security/crawler/guarded-crawler";
import type {
  StructuredCompletionProvider,
  WebSearchProvider,
  WebSearchResultItem,
} from "../../src/providers/types";
import { presentReport } from "../../src/report/presentation";
import {
  computeMeasurementComposition,
  ESTIMATION_DOMINANT_NOTICE,
  estimationNoticeFor,
} from "../../src/report/presentation/measurement-composition";
import { chinesePublicReportGuard } from "../../src/report/validation";
import { curateEvidence, detectLanguage } from "../../src/diagnosis/evidence/tiering";
import {
  buildCompetitorDomainQueries,
  planSearchQueries,
  ZH_CN_QUERY_POLICY,
} from "../../src/diagnosis/search/query-planner";
import { buildClaims } from "../../src/diagnosis/analysis/claims";
import { normalizeEvidence } from "../../src/diagnosis/evidence/normalize";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import type { DiagnosisReport } from "../../src/contracts";

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("unexpected REAL network call in a Chinese-conversion canary");
  }) as unknown as typeof fetch) as unknown as ReturnType<typeof vi.fn>;
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Shared scenario plumbing (drives the REAL pipeline + producer, no network).
// ---------------------------------------------------------------------------

function item(url: string, title: string, snippet: string): WebSearchResultItem {
  return { title, url, snippet, sourceDomain: new URL(url).hostname, fetchedAt: "2026-07-01T00:00:00.000Z" };
}

function crawlerFor(bodyText: string): GuardedCrawler {
  return {
    async crawl(url: string) {
      return {
        ok: true as const,
        finalUrl: url,
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>页面</title></head><body><p>${bodyText}</p></body></html>`,
        redirectChain: [url],
      };
    },
  } as unknown as GuardedCrawler;
}

interface ScenarioStageOverrides {
  opportunitySourceIssueId?: string;
}

/** Chinese stage outputs referencing REAL evidence ids from the pipeline. */
function chineseStages(
  ev: readonly { id: string; sourceType: string }[],
  brand: string,
  o: ScenarioStageOverrides = {},
): Record<string, unknown> {
  const fp = ev.filter((e) => e.sourceType === "FIRST_PARTY_EVIDENCE").map((e) => e.id);
  const anyIds = ev.map((e) => e.id);
  const pick = (ids: string[]) => (ids.length > 0 ? ids.slice(0, 2) : anyIds.slice(0, 1));
  return {
    company_profile: {
      brandName: brand,
      industry: "运动影像设备",
      productOrService: "运动相机与配件",
      targetRegion: "中国",
      competitors: [],
      unresolvedQuestions: ["本次公开页面未见质保期说明,需企业确认。"],
    },
    dimension_signals: {
      companyClarity: {
        criteria: [
          { key: "brandIdentityClear", rating: "PRESENT" },
          { key: "offeringClear", rating: "PRESENT" },
          { key: "targetCustomerClear", rating: "PARTIAL" },
          { key: "valuePropositionClear", rating: "PARTIAL" },
        ],
        evidenceIds: pick(fp),
      },
      websiteCompleteness: {
        criteria: [
          { key: "productInfo", rating: "PRESENT" },
          { key: "companyBackground", rating: "PARTIAL" },
          { key: "contactChannel", rating: "PARTIAL" },
          { key: "processOrPricing", rating: "ABSENT" },
          { key: "caseOrProof", rating: "PARTIAL" },
        ],
        evidenceIds: pick(fp),
      },
      customerQuestionCoverage: {
        criteria: [
          { key: "purchaseDecisionQuestions", rating: "PARTIAL" },
          { key: "comparisonQuestions", rating: "ABSENT" },
          { key: "deliveryAndAfterSales", rating: "PARTIAL" },
          { key: "structuredFaq", rating: "ABSENT" },
        ],
        evidenceIds: pick(anyIds),
      },
      trustEvidence: {
        criteria: [
          { key: "thirdPartyCredentials", rating: "PARTIAL" },
          { key: "verifiableCases", rating: "PARTIAL" },
          { key: "mediaOrPublicMentions", rating: "PRESENT" },
          { key: "customerTestimonials", rating: "ABSENT" },
        ],
        evidenceIds: pick(anyIds),
      },
    },
    ai_visibility: {
      tests: [
        { id: "aiv_q1", questionCategory: "PURCHASE_DECISION", question: "运动相机怎么选", answerText: `建议关注防抖与画质,${brand}等品牌均有产品线。`, accuracy: "PARTIAL", recommendationStrength: "WEAK", evidenceIds: [] },
        { id: "aiv_q2", questionCategory: "BRAND_DIRECT", question: `${brand}主要提供什么`, answerText: `${brand}主要提供运动相机与配件。`, accuracy: "ACCURATE", recommendationStrength: "MODERATE", evidenceIds: [] },
        { id: "aiv_q3", questionCategory: "BRAND_DIRECT", question: `${brand}的特点`, answerText: "该品牌以防抖与全景能力见长。", evidenceIds: [] },
      ],
    },
    claims: {
      strengths: [
        { statement: "官网清晰展示了产品线与目标场景", businessImpact: "客户能快速判断是否对口", claimType: "DIAGNOSTIC_INFERENCE", evidenceIds: pick(fp) },
      ],
      coreIssues: [
        { statement: "本次检查的公开页面中,未发现面向购买决策的结构化问答内容", businessImpact: "高意向客户获取关键信息成本高", claimType: "DIAGNOSTIC_INFERENCE", fixDirection: "补充选型与售后FAQ", evidenceIds: pick(fp) },
      ],
      geoOpportunities: [
        { statement: "围绕选型问题建立权威问答内容", businessImpact: "承接高意向搜索与问答流量", claimType: "DIAGNOSTIC_INFERENCE", customerQuestion: "运动相机怎么选", contentGap: "官网缺少选型指南", sourceIssueId: o.opportunitySourceIssueId ?? "iss_1", evidenceIds: pick(fp) },
      ],
      competitorGaps: [],
      demonstrationFix: null,
    },
  };
}

async function runScenario(opts: {
  brand: string;
  website: string;
  searchResults: WebSearchResultItem[];
  crawlBody: string;
  overrides?: ScenarioStageOverrides;
}): Promise<DiagnosisReport> {
  const tracker = new CanaryBudgetTracker();
  const bocha: WebSearchProvider = {
    async search() {
      return { ok: true, results: opts.searchResults };
    },
  };
  const pipeline = createRealEvidencePipeline({
    bocha,
    crawler: crawlerFor(opts.crawlBody),
    tracker,
    now: () => "2026-07-18T00:00:00.000Z",
  });
  const input = { website: opts.website, brandName: opts.brand, industry: "运动影像设备" };
  const ctx = { diagnosisId: "d1", input } as Parameters<typeof pipeline.search>[0];
  const search = await pipeline.search(ctx);
  const crawl = await pipeline.crawl(ctx, search);
  const { evidence } = await pipeline.normalize(ctx, crawl);

  const stages = chineseStages(evidence, opts.brand, opts.overrides);
  const deepseek: StructuredCompletionProvider = {
    async completeJson({ stage }) {
      return { ok: true, json: stages[stage] ?? {} };
    },
  };
  const producer = createRealReportProducer({
    deepseek,
    tracker,
    model: "deepseek-v4-flash",
    clock: () => new Date("2026-07-18T00:00:00.000Z"),
  });
  const res = await producer.produce({ diagnosisId: "d1", publicToken: "tok1", input, evidence });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("producer failed");
  return res.report;
}

// ---------------------------------------------------------------------------
// Canary A — 中文企业、中文证据充分.
// ---------------------------------------------------------------------------

describe("Canary A — Chinese company, Chinese-rich evidence", () => {
  const results = [
    item("https://www.zhmyx.cn/", "智慧影像 官网首页", "智慧影像专注运动相机与全景影像设备。"),
    item("https://www.zhmyx.cn.example-media.cn/report", "行业媒体:运动影像市场观察", "国内运动影像市场稳步增长,头部品牌竞争激烈。"),
    item("https://www.zhihu.com/question/1", "运动相机怎么选?", "知乎用户讨论防抖、画质与配件生态。"),
  ];

  it("produces an all-Chinese report with a publishable, issue-linked opportunity", async () => {
    const report = await runScenario({
      brand: "智慧影像",
      website: "https://www.zhyx.cn/".replace("zhyx", "zhmyx"),
      searchResults: [item("https://www.zhmyx.cn/", "智慧影像 官网首页", "智慧影像专注运动相机与全景影像设备。"), ...results.slice(1)],
      crawlBody: "智慧影像官网:运动相机、全景相机与配件,支持全国联保。",
    });
    expect(report.reportLanguage).toBe("zh-CN");
    expect(report.geoOpportunities.length).toBeGreaterThan(0); // 可发布 Opportunity
    const views = presentReport(report);
    const guard = chinesePublicReportGuard(views);
    expect(guard).toEqual({ ok: true });
    expect(views.quick.measurementComposition.measuredWeight + views.quick.measurementComposition.estimatedWeight).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Canary B — English brand name, Chinese web.
// ---------------------------------------------------------------------------

describe("Canary B — English brand, Chinese explanations", () => {
  it("keeps the brand English while all customer prose stays Chinese", async () => {
    const report = await runScenario({
      brand: "ActionCam Pro",
      website: "https://www.actioncam-pro.cn/",
      searchResults: [
        item("https://www.actioncam-pro.cn/", "ActionCam Pro 官网", "ActionCam Pro 中文官网,提供运动相机产品与售后支持。"),
        item("https://www.zhihu.com/question/2", "ActionCam Pro 怎么样?", "用户讨论其防抖表现与配件生态。"),
      ],
      crawlBody: "ActionCam Pro 中文官网:运动相机产品线、售后与渠道信息。",
    });
    expect(report.companyProfile.brandName).toBe("ActionCam Pro");
    const views = presentReport(report);
    const guard = chinesePublicReportGuard(views);
    expect(guard).toEqual({ ok: true });
    // Chinese prose everywhere the customer reads conclusions.
    expect(/[一-鿿]/.test(views.quick.headlineConclusion)).toBe(true);
    // Round-8 FINAL: coreIssues removed from Quick — check via demonstrationFix or skip.
  });
});

// ---------------------------------------------------------------------------
// Canary C — Chinese evidence insufficient → English official fallback.
// ---------------------------------------------------------------------------

describe("Canary C — English official fallback with Chinese summaries", () => {
  it("keeps original English titles while summaries and conclusions stay Chinese", async () => {
    const report = await runScenario({
      brand: "GlobalCam",
      website: "https://www.globalcam.com/",
      searchResults: [
        item("https://www.globalcam.com/", "GlobalCam Official Site", "GlobalCam action cameras: stabilization, waterproof design and mounts."),
        item("https://www.globalcam.com/products", "GlobalCam Product Lineup", "Explore the full lineup of GlobalCam action cameras."),
      ],
      crawlBody: "GlobalCam official website. Action cameras with stabilization and mounts.",
    });
    const views = presentReport(report);
    // Original titles keep their source language…
    expect(views.evidence.items.some((i) => /Official Site|Product Lineup/.test(i.title))).toBe(true);
    // …while every public item carries a Chinese summary + Chinese labels.
    for (const i of views.evidence.items) {
      expect(/[一-鿿]/.test(i.summaryZh ?? "")).toBe(true);
      expect(/[一-鿿]/.test(i.sourceTypeLabel ?? "")).toBe(true);
    }
    const guard = chinesePublicReportGuard(views);
    expect(guard).toEqual({ ok: true });
    // The fallback is visible in the tier stats (English first-party = tier B).
    const fallback = report.evidence.filter((e) => e.sourceTier === "B" && e.language !== "zh");
    expect(fallback.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ChinesePublicReportGuard unit rules.
// ---------------------------------------------------------------------------

describe("ChinesePublicReportGuard rules", () => {
  function views() {
    return presentReport(buildSampleReport());
  }

  it("passes the canonical sample projections", () => {
    expect(chinesePublicReportGuard(views())).toEqual({ ok: true });
  });

  it("flags a full English sentence in customer prose", () => {
    const v = views();
    v.quick.headlineConclusion = "This company should really improve its online presence right now.";
    const res = chinesePublicReportGuard(v);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.violations.some((x) => x.rule === "ZH_FULL_ENGLISH_SENTENCE")).toBe(true);
  });

  it("flags raw internal enums and state names", () => {
    const v = views();
    v.deep.measurementNotes = ["该维度为 ESTIMATED 状态。", "当前状态 ANALYZING。"];
    const res = chinesePublicReportGuard(v);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const rules = res.violations.map((x) => x.rule);
      expect(rules).toContain("ZH_INTERNAL_ENUM_LEAK");
      expect(rules).toContain("ZH_STATE_MACHINE_LEAK");
    }
  });

  it("flags half-width !? punctuation and English technical errors", () => {
    const v = views();
    v.quick.headlineConclusion = "企业表现有待提升!";
    v.deep.measurementNotes = ["PROVIDER_TIMEOUT occurred"];
    const res = chinesePublicReportGuard(v);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const rules = res.violations.map((x) => x.rule);
      expect(rules).toContain("ZH_PUNCTUATION");
      expect(rules).toContain("ZH_TECH_ERROR_LEAK");
    }
  });

  it("requires zh-CN language and Chinese evidence summaries", () => {
    const v = views();
    (v.quick as { reportLanguage: string }).reportLanguage = "en-US";
    v.evidence.items = v.evidence.items.map((i) => ({ ...i, summaryZh: "no chinese here" }));
    const res = chinesePublicReportGuard(v);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const rules = res.violations.map((x) => x.rule);
      expect(rules).toContain("ZH_WRONG_REPORT_LANGUAGE");
      expect(rules).toContain("ZH_MISSING_CHINESE_SUMMARY");
    }
  });
});

// ---------------------------------------------------------------------------
// measurementComposition.
// ---------------------------------------------------------------------------

describe("measurementComposition", () => {
  it("uses the frozen weights and triggers the estimation notice when估算 dominates", () => {
    const report = buildSampleReport();
    const comp = computeMeasurementComposition(report.scores);
    const total =
      comp.measuredWeight + comp.estimatedWeight + comp.insufficientWeight + comp.providerFailedWeight;
    expect(Math.round(total * 100)).toBe(100);
    // Insta360-shape: 4×ESTIMATED (85%) vs aiVisibility MEASURED (15%).
    const estimatedHeavy = { ...comp, measuredWeight: 0.15, estimatedWeight: 0.85 };
    expect(estimationNoticeFor(estimatedHeavy)).toBe(ESTIMATION_DOMINANT_NOTICE);
    expect(estimationNoticeFor({ ...comp, measuredWeight: 0.9, estimatedWeight: 0.1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Evidence tiering / dedup / caps.
// ---------------------------------------------------------------------------

describe("evidence tiering + dedup (§六)", () => {
  it("detects language, assigns tiers, dedups titles and caps marketplace/community domains", () => {
    expect(detectLanguage("影石Insta360 全景相机")).toBe("zh");
    expect(detectLanguage("GlobalCam Official Site")).toBe("other");

    const raw = normalizeEvidence(
      [
        item("https://www.brand.cn/", "品牌官网", "中文官网介绍"),
        item("https://www.brand.com/en", "Brand Global", "Global official site"),
        item("https://media.cn/news/1", "行业媒体报道", "中文媒体内容"),
        // Marketplace: 3 items on one domain → capped at 2.
        item("https://item.jd.com/1", "品牌旗舰店A", "京东商品页"),
        item("https://item.jd.com/2", "品牌旗舰店B", "京东商品页"),
        item("https://item.jd.com/3", "品牌旗舰店C", "京东商品页"),
        // Community duplicate title → merged.
        item("https://www.zhihu.com/q/1", "品牌怎么样", "讨论内容一"),
        item("https://www.zhihu.com/q/2", "品牌怎么样", "讨论内容二"),
      ],
      { companyDomains: ["brand.cn", "brand.com"] },
    );
    const curated = curateEvidence(raw);
    const tiers = curated.evidence.map((e) => e.sourceTier);
    expect(tiers).toContain("A"); // 中文官网
    expect(tiers).toContain("B"); // 全球官方
    expect(tiers).toContain("C"); // 中文媒体
    expect(curated.evidence.filter((e) => e.sourceDomain === "item.jd.com").length).toBe(2);
    expect(curated.stats.duplicatesMerged).toBeGreaterThan(0);
    expect(curated.stats.cappedByDomain).toBeGreaterThan(0);
    expect(curated.stats.chineseCount).toBeGreaterThan(0);
    // Official pages are never evicted by caps.
    expect(curated.evidence.some((e) => e.sourceTier === "A")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZH query policy.
// ---------------------------------------------------------------------------

describe("ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK query policy", () => {
  it("covers the Chinese buckets (官网/口碑/案例/旗舰店/社区/媒体/选型)", () => {
    expect(ZH_CN_QUERY_POLICY).toBe("ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK");
    const queries = planSearchQueries({
      brandName: "智慧影像",
      website: "https://www.zhmyx.cn/",
      industry: "运动影像设备",
      productOrService: "运动相机",
      targetRegion: "中国",
      competitors: ["GoPro"],
      unresolvedQuestions: [],
    }).map((q) => q.query);
    const joined = queries.join("\n");
    for (const marker of ["官网", "口碑", "案例", "适合谁", "团队", "交付", "收费", "如何选择", "对比"]) {
      expect(joined).toContain(marker);
    }
  });

  it("resolves ASCII (international) competitor names English-first, Chinese names Chinese-first", () => {
    expect(buildCompetitorDomainQueries("GoPro")[0]).toBe("GoPro official website");
    expect(buildCompetitorDomainQueries("大疆")[0]).toBe("大疆 官网");
  });
});

// ---------------------------------------------------------------------------
// Claims reasonCodes + opportunity linkage (§七).
// ---------------------------------------------------------------------------

describe("content-yield reason codes (§七)", () => {
  const ev = normalizeEvidence(
    [item("https://www.brand.cn/", "品牌官网", "中文官网介绍")],
    { companyDomains: ["brand.cn"] },
  );
  const evId = ev[0]!.id;

  const base = {
    strengths: [],
    coreIssues: [
      { statement: "问题一", businessImpact: "影响", claimType: "DIAGNOSTIC_INFERENCE", fixDirection: "修", evidenceIds: [evId] },
    ],
    competitorGaps: [],
    demonstrationFix: null,
  };

  it("records NO_VALID_EVIDENCE / INVALID_EVIDENCE_REFERENCE for unpublishable opportunities", () => {
    const out = buildClaims(ev, {
      ...base,
      geoOpportunities: [
        { statement: "无证据机会", businessImpact: "无", claimType: "DIAGNOSTIC_INFERENCE", customerQuestion: "?".replace("?", "问"), contentGap: "缺", evidenceIds: [] },
        { statement: "坏引用机会", businessImpact: "无", claimType: "DIAGNOSTIC_INFERENCE", customerQuestion: "问", contentGap: "缺", evidenceIds: ["ev_ghost"] },
        { statement: "坏问题链接", businessImpact: "无", claimType: "DIAGNOSTIC_INFERENCE", customerQuestion: "问", contentGap: "缺", sourceIssueId: "iss_99", evidenceIds: [evId] },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.geoOpportunities).toHaveLength(0);
      const codes = out.value.dropped.map((d) => d.reasonCode);
      expect(codes).toContain("NO_VALID_EVIDENCE");
      expect(codes).toContain("INVALID_EVIDENCE_REFERENCE");
    }
  });

  it("publishes an opportunity properly linked to a built issue", () => {
    const out = buildClaims(ev, {
      ...base,
      geoOpportunities: [
        { statement: "好机会", businessImpact: "有", claimType: "DIAGNOSTIC_INFERENCE", customerQuestion: "问", contentGap: "缺", sourceIssueId: "iss_1", evidenceIds: [evId] },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.geoOpportunities).toHaveLength(1);
      expect(out.value.dropped).toHaveLength(0);
    }
  });
});
