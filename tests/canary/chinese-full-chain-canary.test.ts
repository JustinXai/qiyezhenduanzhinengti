// ============================================================================
// Round-5.1 §十三 — three FULL-CHAIN Chinese canaries. ZERO network.
//
// Chain per canary: API (handleCreateDiagnosis) → runtime state machine →
// REAL query planner → REAL evidence tiering/dedup → REAL analysis builders →
// Claim–Evidence verification → publish guard → canonical (SQLite) → GET →
// presentation → Quick/Deep/Evidence → ChinesePublicReportGuard →
// Chinese Conversion Review. Providers are deterministic mocks; the fetch spy
// proves no real network is ever touched.
// ============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";
import {
  handleCreateDiagnosis,
  handleGetDiagnosis,
  type DiagnosisView,
} from "../../src/runtime/api/diagnoses-handlers";
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
import { chineseConversionReview, chinesePublicReportGuard } from "../../src/report/validation";
import { computeContentYield } from "../../src/diagnosis/evidence/tiering";
import type { DiagnosisReport, EvidenceItem } from "../../src/contracts";

let db: BetterSqlite3.Database | null = null;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("unexpected REAL network call in a full-chain Chinese canary");
  }) as unknown as typeof fetch) as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  db?.close();
  db = null;
  vi.restoreAllMocks();
});

// --- scenario plumbing ------------------------------------------------------

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
        body: `<html><head><title>官方页面</title></head><body><p>${bodyText}</p></body></html>`,
        redirectChain: [url],
      };
    },
  } as unknown as GuardedCrawler;
}

/** Stage outputs bound lazily to the evidence the REAL pipeline produced. */
function stagesFor(brand: string): (ev: readonly EvidenceItem[]) => Record<string, unknown> {
  return (ev) => {
    const fp = ev.filter((e) => e.sourceType === "FIRST_PARTY_EVIDENCE").map((e) => e.id);
    const ids = fp.length > 0 ? fp.slice(0, 2) : ev.slice(0, 1).map((e) => e.id);
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
          evidenceIds: ids,
        },
        websiteCompleteness: {
          criteria: [
            { key: "productInfo", rating: "PRESENT" },
            { key: "companyBackground", rating: "PARTIAL" },
            { key: "contactChannel", rating: "PARTIAL" },
            { key: "processOrPricing", rating: "ABSENT" },
            { key: "caseOrProof", rating: "PARTIAL" },
          ],
          evidenceIds: ids,
        },
        customerQuestionCoverage: {
          criteria: [
            { key: "purchaseDecisionQuestions", rating: "PARTIAL" },
            { key: "comparisonQuestions", rating: "ABSENT" },
            { key: "deliveryAndAfterSales", rating: "PARTIAL" },
            { key: "structuredFaq", rating: "ABSENT" },
          ],
          evidenceIds: ids,
        },
        trustEvidence: {
          criteria: [
            { key: "thirdPartyCredentials", rating: "PARTIAL" },
            { key: "verifiableCases", rating: "PARTIAL" },
            { key: "mediaOrPublicMentions", rating: "PRESENT" },
            { key: "customerTestimonials", rating: "ABSENT" },
          ],
          evidenceIds: ids,
        },
      },
      ai_visibility: {
        tests: [
          { id: "aiv_1", questionCategory: "PURCHASE_DECISION", question: "运动相机怎么选购比较稳妥。", answerText: `建议关注防抖与画质,${brand}等品牌均有产品线。`, accuracy: "PARTIAL", recommendationStrength: "WEAK", evidenceIds: [] },
          { id: "aiv_2", questionCategory: "BRAND_DIRECT", question: `${brand}主要提供什么产品。`, answerText: `${brand}主要提供运动相机与配件。`, accuracy: "ACCURATE", recommendationStrength: "MODERATE", evidenceIds: [] },
          { id: "aiv_3", questionCategory: "BRAND_DIRECT", question: `${brand}有什么特点。`, answerText: "该品牌以防抖与全景能力见长。", evidenceIds: [] },
        ],
      },
      claims: {
        strengths: [
          { statement: `${brand}官网清晰展示了产品线与目标场景`, businessImpact: "客户能快速判断是否对口", claimType: "DIAGNOSTIC_INFERENCE", evidenceIds: ids },
        ],
        coreIssues: [
          { statement: `本次检查的公开页面中,未发现${brand}官网面向购买决策的结构化问答内容`, businessImpact: "高意向客户获取关键信息成本高", claimType: "DIAGNOSTIC_INFERENCE", fixDirection: "补充选型与售后FAQ", evidenceIds: ids },
        ],
        geoOpportunities: [
          {
            statement: "围绕选型问题建立权威问答内容",
            businessImpact: "承接高意向搜索与问答流量",
            claimType: "DIAGNOSTIC_INFERENCE",
            customerQuestion: "运动相机怎么选购比较稳妥。",
            contentGap: "官网缺少选型指南",
            sourceIssueId: "iss_1",
            recommendedAction: "在官网新增选型FAQ专区,覆盖防抖、续航与配件兼容三类高频问题",
            priorityReason: "该问题有第一方证据支撑,且直接影响购买决策阶段的转化",
            evidenceIds: ids,
          },
        ],
        competitorGaps: [],
        demonstrationFix: null,
      },
    };
  };
}

/** Drive one full-chain diagnosis over mock providers; returns the stored view. */
async function runFullChain(opts: {
  brand: string;
  website: string;
  searchResults: WebSearchResultItem[];
  crawlBody: string;
}): Promise<{ report: DiagnosisReport; status: string }> {
  db = openMigratedDatabase(":memory:");
  const storage = new SqliteStorageAdapter(db);
  const tracker = new CanaryBudgetTracker();
  const bocha: WebSearchProvider = {
    async search() {
      return { ok: true, results: opts.searchResults };
    },
  };
  const evidence = createRealEvidencePipeline({
    bocha,
    crawler: crawlerFor(opts.crawlBody),
    tracker,
    now: () => "2026-07-18T00:00:00.000Z",
  });
  const stageFor = stagesFor(opts.brand);
  // The producer receives the REAL curated evidence via ctx — bind stage JSON then.
  let boundStages: Record<string, unknown> | null = null;
  const deepseek: StructuredCompletionProvider = {
    async completeJson({ stage }) {
      return { ok: true, json: boundStages?.[stage] ?? {} };
    },
  };
  const baseProducer = createRealReportProducer({
    deepseek,
    tracker,
    model: "deepseek-v4-flash",
    clock: () => new Date("2026-07-18T00:00:00.000Z"),
  });
  const producer = {
    async produce(ctx: Parameters<typeof baseProducer.produce>[0]) {
      boundStages = stageFor(ctx.evidence);
      return baseProducer.produce(ctx);
    },
  };

  const created = await handleCreateDiagnosis(
    { storage, evidence, producer },
    { website: opts.website, brandName: opts.brand, industry: "运动影像设备" },
  );
  expect(created.status).toBe(201);
  const body = created.body as { diagnosisId: string; publicToken: string; status: string };
  const got = await handleGetDiagnosis({ storage, evidence, producer }, {
    id: body.diagnosisId,
    publicToken: body.publicToken,
  });
  const view = got.body as DiagnosisView;
  expect(view.report).not.toBeNull();
  return { report: view.report!, status: body.status };
}

function assertAllChineseAndReviewed(report: DiagnosisReport) {
  const views = presentReport(report);
  expect(chinesePublicReportGuard(views)).toEqual({ ok: true });
  const review = chineseConversionReview(report, views);
  const failing = review.filter((c) => !c.pass);
  expect(failing.map((c) => `${c.id}:${c.name}(${c.detail})`)).toEqual([]);
  return views;
}

// --- Canary A ---------------------------------------------------------------

describe("full-chain Canary A — 中文企业,中文证据充分", () => {
  it("reaches READY with ≥1 issue, ≥1 linked opportunity, zh-CN everywhere", async () => {
    const { report, status } = await runFullChain({
      brand: "智慧影像",
      website: "https://www.zhmyx.cn/",
      searchResults: [
        item("https://www.zhmyx.cn/", "智慧影像 官网首页", "智慧影像专注运动相机与全景影像设备。"),
        item("https://www.zhmyx.cn/products", "智慧影像 产品中心", "运动相机、全景相机与配件产品线。"),
        item("https://media-example.cn/report", "行业观察:运动影像市场", "中文行业媒体报道运动影像市场趋势。"),
      ],
      crawlBody: "智慧影像官网:运动相机、全景相机与配件,支持全国联保与售后服务。",
    });
    expect(status).toBe("READY");
    expect(report.reportLanguage).toBe("zh-CN");
    expect(report.coreIssues.length).toBeGreaterThanOrEqual(1);
    expect(report.geoOpportunities.length).toBeGreaterThanOrEqual(1);
    expect(report.geoOpportunities[0]!.sourceIssueId).toBe("iss_1");
    expect(report.geoOpportunities[0]!.recommendedAction).toBeTruthy();
    assertAllChineseAndReviewed(report);
    const yieldStats = computeContentYield(report);
    expect(yieldStats.evidenceUsedByClaims).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// --- Canary B ---------------------------------------------------------------

describe("full-chain Canary B — 英文品牌名,中文网络", () => {
  it("keeps the English brand, Chinese conclusions, READY", async () => {
    const { report, status } = await runFullChain({
      brand: "ActionCam Pro",
      website: "https://www.actioncam-pro.cn/",
      searchResults: [
        item("https://www.actioncam-pro.cn/", "ActionCam Pro 官网", "ActionCam Pro 中文官网,提供运动相机产品与售后支持。"),
        item("https://www.zhihu.com/question/2", "ActionCam Pro 怎么样", "用户讨论其防抖表现与配件生态。"),
      ],
      crawlBody: "ActionCam Pro 中文官网:运动相机产品线、售后与渠道信息。",
    });
    expect(status).toBe("READY");
    expect(report.companyProfile.brandName).toBe("ActionCam Pro");
    const views = assertAllChineseAndReviewed(report);
    // Chinese evidence is primary in the annotated registry.
    const annotated = report.evidence.filter((e) => e.language !== undefined);
    const zh = annotated.filter((e) => e.language === "zh").length;
    expect(zh / Math.max(1, annotated.length)).toBeGreaterThanOrEqual(0.5);
    expect(views.quick.reportLanguage).toBe("zh-CN");
  });
});

// --- Canary C ---------------------------------------------------------------

describe("full-chain Canary C — 中文不足,英文官方Fallback", () => {
  it("admits English official evidence with Chinese summaries + origin label, READY", async () => {
    const { report, status } = await runFullChain({
      brand: "GlobalCam",
      website: "https://www.globalcam.com/",
      searchResults: [
        item("https://www.globalcam.com/", "GlobalCam Official Site", "GlobalCam action cameras with stabilization and mounts."),
        item("https://www.globalcam.com/products", "GlobalCam Product Lineup", "Explore the full lineup of GlobalCam action cameras."),
      ],
      crawlBody: "GlobalCam official website. Action cameras with stabilization and mounts.",
    });
    expect(status).toBe("READY");
    const views = presentReport(report);
    expect(chinesePublicReportGuard(views)).toEqual({ ok: true });
    // Original English titles survive; summaries + origin labels are Chinese.
    expect(views.evidence.items.some((i) => /Official Site|Product Lineup/.test(i.title))).toBe(true);
    for (const i of views.evidence.items) {
      expect(/[一-鿿]/.test(i.summaryZh ?? "")).toBe(true);
    }
    // The English official fallback is explicitly labelled — never伪装中文来源.
    expect(views.evidence.items.some((i) => i.languageLabel === "英文官方补充")).toBe(true);
    const fallback = report.evidence.filter((e) => e.sourceTier === "B" && e.language !== "zh");
    expect(fallback.length).toBeGreaterThan(0);
  });
});
