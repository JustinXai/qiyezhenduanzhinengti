// ============================================================================
// Live mock-provider seams — the real vertical slice wiring.
//
// These replace the round-1 stand-ins in ./mocks.ts. They drive the REAL
// Agent C (search planning + evidence normalization) and Agent D (staged
// analysis + report assembly) code paths, fed by DETERMINISTIC MOCK PROVIDERS
// (no real Bocha / DeepSeek, no network). The state machine (Agent E) consumes
// them through the unchanged EvidencePipeline / ReportProducer interfaces.
//
//   EvidencePipeline:  planSearchQueries (C) → mock Bocha results
//                      → normalizeEvidence (C)  ⇒ canonical EvidenceItem[]
//   ReportProducer:    scenario DeepSeek stage outputs (referencing the REAL
//                      normalized evidence ids) → buildReportFromStageOutputs (D)
//                      ⇒ canonical DiagnosisReport (Zod-validated by D)
//
// SUPPORT-LEVEL (ROUND-3): the old `assessSupport` seam is DELETED. It upgraded
// first-party / competitor own-domain pages to DIRECT_SUPPORT purely from source
// authority — exactly the "authority == semantic support" shortcut that Round-3
// forbids. Evidence now keeps C's conservative CONTEXT_ONLY source default, and
// per-claim semantic support is decided by the ClaimEvidenceVerifier stage in the
// state machine (src/diagnosis/verification), never here. This seam also supplies
// the run's EvidenceCoverage (measurement boundary) so negative/missing claims
// can be bounded to "本次已检查的公开页面中未发现……".
// ============================================================================

import type { WebSearchProvider, WebSearchResultItem } from "../../providers/types";
import type { StructuredCompletionProvider } from "../../providers/types";
import type { EvidenceItem } from "../../contracts";
import { deriveCoverage } from "../../contracts/claim-evidence";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";
import {
  competitorInputWebsite,
  competitorNames,
} from "../../runtime/diagnosis-input";
import { planSearchQueries } from "../search/query-planner";
import { normalizeEvidence } from "../evidence/normalize";
import { resolveCompetitors } from "../competitors/resolve";
import { createMockCompetitorSearch } from "../competitors/mock-search";
import type { CompetitorResolution } from "../competitors/types";
import {
  buildReportFromStageOutputs,
  type ReportIdentity,
} from "../../report/generation";
import type { AiVisibilityInput } from "../analysis/ai-visibility";
import type { CompanyProfileInput } from "../analysis/company-profile";
import type { StageOutputs } from "../../report/generation";
import type {
  EvidencePipeline,
  EvidenceStageContext,
  NormalizedEvidenceResult,
  ReportProducer,
  ReportProducerContext,
  ReportProducerResult,
  StageResult,
} from "./state-machine";

// Host used ONLY to build a mock competitor page in the scenario search
// results below. It is NOT a classification shortcut — whether this page counts
// as competitor evidence now depends entirely on competitor RESOLUTION (Agent I),
// exactly like a real search result would.
const SCENARIO_COMPETITOR_HOST = "competitor-demo.example.net";
const SCENARIO_OBSERVED_HOST = "industry-news.example.org";
const MOCK_MODEL = "deepseek-v4-flash";
const FETCHED_AT = new Date(0).toISOString();

/** Extract a bare host from a request website URL (www-stripped, lowercased). */
function hostOf(website: string): string {
  try {
    const h = new URL(website).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}

/** Derive a display brand from the host when the request did not supply one. */
function brandFromHost(host: string): string {
  const label = host.split(".")[0] ?? host;
  return label ? label : "该企业";
}

function resolvedBrand(input: DiagnosisInput): string {
  const provided = input.brandName?.trim();
  if (provided) return provided;
  return brandFromHost(hostOf(input.website));
}

// ---------------------------------------------------------------------------
// Mock Bocha provider — deterministic scenario results for one company.
// Returns the company's own pages (first-party), one competitor page and one
// third-party mention, regardless of the concrete query string.
// ---------------------------------------------------------------------------

function scenarioResults(website: string): WebSearchResultItem[] {
  const host = hostOf(website) || "example.com";
  const origin = `https://${host}`;
  return [
    {
      title: `${brandFromHost(host)} - 官网首页`,
      url: `${origin}/`,
      snippet: "企业官网首页,介绍主营业务与目标客户。",
      sourceDomain: host,
      fetchedAt: FETCHED_AT,
    },
    {
      title: `${brandFromHost(host)} - 产品中心`,
      url: `${origin}/products`,
      snippet: "产品与服务说明页,列出主要能力与应用场景。",
      sourceDomain: host,
      fetchedAt: FETCHED_AT,
    },
    {
      title: `${brandFromHost(host)} - 关于我们`,
      url: `${origin}/about`,
      snippet: "企业背景介绍页,包含成立情况与所在区域。",
      sourceDomain: host,
      fetchedAt: FETCHED_AT,
    },
    {
      title: "竞品公开信息",
      url: `https://${SCENARIO_COMPETITOR_HOST}/`,
      snippet: "竞品官网公开展示交付周期与验收标准。",
      sourceDomain: SCENARIO_COMPETITOR_HOST,
      fetchedAt: FETCHED_AT,
    },
    {
      title: "行业媒体报道",
      url: `https://${SCENARIO_OBSERVED_HOST}/articles/company`,
      snippet: "第三方媒体对该企业所在行业的观察性报道。",
      sourceDomain: SCENARIO_OBSERVED_HOST,
      fetchedAt: FETCHED_AT,
    },
  ];
}

export function createScenarioBochaProvider(): WebSearchProvider {
  return {
    async search(query, opts) {
      // The website is threaded via the query string prefix "site:<website> ..."
      // set by the pipeline; fall back to a generic host if absent.
      const siteMatch = /site:(\S+)/.exec(query);
      const website = siteMatch?.[1] ?? "https://example.com";
      const limit = opts?.limit ?? 10;
      return { ok: true, results: scenarioResults(website).slice(0, limit) };
    },
  };
}

// ---------------------------------------------------------------------------
// EvidencePipeline — real Agent C planning + normalization over mock results.
// ---------------------------------------------------------------------------

interface SearchData {
  results: WebSearchResultItem[];
  companyDomains: string[];
  /** Confirmed competitor hosts from resolution (was a hard-coded constant). */
  competitorDomains: string[];
  /** Executed query plan — the measurement boundary that coverage is derived from. */
  executedQueries: string[];
  /** Canonical evidence gathered while resolving competitor domains. */
  resolutionEvidence: EvidenceItem[];
  /** Full per-competitor resolution audit (every input, never dropped). */
  resolutions: CompetitorResolution[];
}

export function createLiveEvidencePipeline(
  bocha: WebSearchProvider = createScenarioBochaProvider(),
  competitorSearch: WebSearchProvider = createMockCompetitorSearch(),
): EvidencePipeline {
  return {
    async search(ctx: EvidenceStageContext): Promise<StageResult> {
      const { input } = ctx;
      const host = hostOf(input.website);

      // --- Competitor entity & official-domain resolution (Agent I) ----------
      // Replaces the old hard-coded SCENARIO_COMPETITOR_HOST: every named
      // competitor is resolved to an auditable status; only CONFIRMED domains
      // (USER_CONFIRMED / RESOLVED) become competitor evidence.
      const resolution = await resolveCompetitors(input.competitors, {
        search: competitorSearch,
      });
      const resolutionSearchCalls = resolution.resolutions.filter(
        (r) => r.providedDomain === null,
      ).length;

      // Run Agent C's real query planner over a profile built from the request,
      // feeding it the resolutions so confirmed competitors get domain-scoped
      // comparison queries.
      const planned = planSearchQueries(
        {
          brandName: resolvedBrand(input),
          website: input.website,
          industry: input.industry ?? "",
          productOrService: input.productOrService ?? "",
          targetRegion: input.targetRegion ?? "",
          competitors: competitorNames(input.competitors),
          unresolvedQuestions: [],
        },
        { maxTotal: 12, competitorResolutions: resolution.resolutions },
      );
      // One mock provider call carries the whole scenario; tag the site so the
      // mock returns first-party results on the request's host.
      const res = await bocha.search(`site:${input.website} ${planned[0]?.query ?? ""}`, {
        limit: 10,
      });
      const results = res.ok ? res.results : [];
      const data: SearchData = {
        results,
        companyDomains: host ? [host] : [],
        competitorDomains: resolution.resolvedDomains,
        executedQueries: planned.map((p) => p.query),
        resolutionEvidence: resolution.evidence,
        resolutions: resolution.resolutions,
      };
      const usage = [
        { provider: "bocha", stage: "SEARCHING", callCount: Math.max(1, planned.length) },
      ];
      if (resolutionSearchCalls > 0) {
        usage.push({ provider: "bocha", stage: "SEARCHING", callCount: resolutionSearchCalls });
      }
      return { data, usage };
    },

    async crawl(_ctx, searchResult: StageResult): Promise<StageResult> {
      // No real crawl in the mock slice (the SSRF-guarded crawler is exercised in
      // Agent C's unit tests; fetching live URLs is out of scope here). Forward
      // the search payload unchanged so normalize can consume it.
      const data = searchResult.data as SearchData;
      return {
        data,
        usage: [{ provider: "bocha", stage: "CRAWLING", callCount: data.results.length }],
      };
    },

    async normalize(_ctx, crawlResult: StageResult): Promise<NormalizedEvidenceResult> {
      const data = crawlResult.data as SearchData;
      const base = normalizeEvidence(data.results, {
        companyDomains: data.companyDomains,
        competitorDomains: data.competitorDomains,
      });
      // Merge resolution evidence (competitor official pages) into the set,
      // de-duplicated by id so nothing double-counts.
      const byId = new Map<string, EvidenceItem>();
      for (const e of base) byId.set(e.id, e);
      for (const e of data.resolutionEvidence) {
        if (!byId.has(e.id)) byId.set(e.id, e);
      }
      const evidence = [...byId.values()];
      // Supply the measurement boundary from the executed query plan + the
      // controlled first-party crawl scope; the verifier uses it to bound
      // negative/missing claims (authority-based support is deleted entirely).
      const coverage = deriveCoverage({
        evidence,
        firstPartyDomains: data.companyDomains,
        executedQueries: data.executedQueries,
      });
      return { evidence, coverage };
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario DeepSeek provider — returns per-stage structured output referencing
// the REAL normalized evidence ids. Bound to a specific evidence set + input so
// its claims/dimension signals cite ids that actually exist.
// ---------------------------------------------------------------------------

function byType(evidence: readonly EvidenceItem[], type: EvidenceItem["sourceType"]): EvidenceItem[] {
  return evidence.filter((e) => e.sourceType === type);
}

/** Bare host of a (schema-validated) competitor website URL. */
function competitorHost(website: string): string | null {
  try {
    const h = new URL(website).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return null;
  }
}

/**
 * Pick the confirmed competitor a gap should be attributed to, using ONLY the
 * request input + evidence classification (no hidden resolution state). Prefers
 * a user-supplied website whose host matches a competitor-evidence domain, so
 * the gap is labelled with the right entity.
 */
function pickConfirmedCompetitor(
  input: DiagnosisInput,
  competitorEvidence: readonly EvidenceItem[],
): { name: string; evidenceId: string } | null {
  if (competitorEvidence.length === 0) return null;
  for (const c of input.competitors ?? []) {
    const website = competitorInputWebsite(c);
    if (!website) continue;
    const host = competitorHost(website);
    const ev = host ? competitorEvidence.find((e) => e.sourceDomain === host) : undefined;
    if (ev) return { name: typeof c === "string" ? c : c.name, evidenceId: ev.id };
  }
  const names = competitorNames(input.competitors);
  const first = competitorEvidence[0]!;
  return { name: names[0] ?? first.sourceDomain, evidenceId: first.id };
}

/**
 * Competitor gaps for the scenario claims stage. Emits a gap ONLY when a
 * competitor domain was actually confirmed (COMPETITOR_WEB_EVIDENCE present).
 * Unconfirmed competitors produce NO deterministic gap — see PRODUCT_TRUTH_RULES
 * ("无法确认→不得生成确定性竞品差距").
 */
function scenarioCompetitorGaps(
  evidence: readonly EvidenceItem[],
  input: DiagnosisInput,
): Array<{ competitorName: string; gapStatement: string; evidenceIds: string[] }> {
  const pick = pickConfirmedCompetitor(input, byType(evidence, "COMPETITOR_WEB_EVIDENCE"));
  if (!pick) return [];
  return [
    {
      competitorName: pick.name,
      gapStatement:
        "竞品官网公开展示了交付周期与验收标准,本企业官网暂未提供同类信息",
      evidenceIds: [pick.evidenceId],
    },
  ];
}

function scenarioStageOutput(
  stage: string,
  evidence: readonly EvidenceItem[],
  input: DiagnosisInput,
): unknown {
  const first = byType(evidence, "FIRST_PARTY_EVIDENCE");
  const observed = byType(evidence, "OBSERVED_WEB_EVIDENCE");
  const brand = resolvedBrand(input);
  // Stable id pickers with graceful fallback when a bucket is short.
  const fp = (i: number): string => (first[i] ?? first[0] ?? evidence[0])?.id ?? "";
  const obsId = (observed[0] ?? evidence[0])?.id ?? "";

  switch (stage) {
    case "company_profile":
      return {
        brandName: brand,
        industry: input.industry ?? "通用行业",
        productOrService: input.productOrService ?? "核心产品与服务",
        targetRegion: input.targetRegion ?? "全国",
        competitors: competitorNames(input.competitors),
        unresolvedQuestions: ["官网未明确说明典型交付周期", "缺少可验证的第三方资质佐证"],
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
          evidenceIds: [fp(0), fp(2)],
        },
        websiteCompleteness: {
          criteria: [
            { key: "productInfo", rating: "PRESENT" },
            { key: "companyBackground", rating: "PARTIAL" },
            { key: "contactChannel", rating: "PARTIAL" },
            { key: "processOrPricing", rating: "ABSENT" },
            { key: "caseOrProof", rating: "ABSENT" },
          ],
          evidenceIds: [fp(0), fp(1)],
        },
        customerQuestionCoverage: {
          criteria: [
            { key: "purchaseDecisionQuestions", rating: "ABSENT" },
            { key: "comparisonQuestions", rating: "ABSENT" },
            { key: "deliveryAndAfterSales", rating: "PARTIAL" },
            { key: "structuredFaq", rating: "ABSENT" },
          ],
          evidenceIds: [fp(1)],
        },
        trustEvidence: {
          criteria: [
            { key: "thirdPartyCredentials", rating: "ABSENT" },
            { key: "verifiableCases", rating: "PARTIAL" },
            { key: "mediaOrPublicMentions", rating: "PRESENT" },
            { key: "customerTestimonials", rating: "ABSENT" },
          ],
          evidenceIds: [fp(2)],
        },
      };
    case "ai_visibility":
      return {
        tests: [
          {
            id: "aiv_1",
            questionCategory: "PURCHASE_DECISION",
            question: `${input.industry ?? "该行业"}有哪些可靠的供应商?`,
            answerText: "回答中列举了几家同类供应商,但没有点名这家企业。",
            evidenceIds: [obsId],
          },
          {
            id: "aiv_2",
            questionCategory: "BRAND_DIRECT",
            question: `${brand}主要提供什么产品和服务?`,
            answerText: `回答提到${brand},并大致描述了其主营业务方向。`,
            accuracy: "PARTIAL",
            recommendationStrength: "WEAK",
            evidenceIds: [fp(0)],
          },
          {
            id: "aiv_3",
            questionCategory: "BRAND_DIRECT",
            question: `${brand}的目标客户是谁?`,
            answerText: `回答准确说明了${brand}服务的客户群体与场景。`,
            accuracy: "ACCURATE",
            recommendationStrength: "MODERATE",
            evidenceIds: [fp(2)],
          },
        ],
      };
    case "claims":
      return {
        strengths: [
          {
            statement: "官网首页清晰说明了目标客户与核心产品线",
            businessImpact: "潜在客户能在首屏快速判断是否对口,降低跳出",
            claimType: "DIAGNOSTIC_INFERENCE",
            evidenceIds: [fp(0)],
          },
        ],
        coreIssues: [
          {
            statement: "缺少面向采购决策的常见问题解答内容",
            businessImpact: "高意向客户在比价阶段拿不到关键信息,容易流向信息更全的竞品",
            claimType: "DIAGNOSTIC_INFERENCE",
            fixDirection: "补充围绕交付周期、售后与选型的结构化 FAQ",
            evidenceIds: [fp(1)],
          },
          {
            statement: "第三方可验证的信任证据不足",
            businessImpact: "AI 与客户都难以确认企业资质,削弱推荐意愿",
            claimType: "DIAGNOSTIC_INFERENCE",
            fixDirection: "整理可公开的资质、案例与媒体报道并结构化呈现",
            evidenceIds: [fp(2)],
          },
          {
            statement: "产品页对不同行业适配的说明可能不够具体",
            businessImpact: "跨行业客户难以自我对号,咨询转化受限",
            claimType: "UNVERIFIED_HYPOTHESIS",
            fixDirection: "按典型行业场景拆分产品适配说明",
            evidenceIds: [fp(1)],
          },
        ],
        geoOpportunities: [
          {
            statement: "围绕选型建立权威问答内容",
            businessImpact: "承接高意向搜索与 AI 问答流量",
            claimType: "DIAGNOSTIC_INFERENCE",
            customerQuestion: "该如何选择合适的供应商?",
            contentGap: "官网无系统性的选型指南或对比框架",
            evidenceIds: [fp(1)],
          },
          {
            statement: "沉淀真实交付案例的结构化描述",
            businessImpact: "为 AI 提供可引用的实体事实,提升被准确提及的概率",
            claimType: "DIAGNOSTIC_INFERENCE",
            customerQuestion: "这家供应商有没有类似规模的成功案例?",
            contentGap: "缺少可公开、可验证的案例结构化内容",
            evidenceIds: [fp(2)],
          },
        ],
        // Gated on confirmed competitor evidence — empty when nothing resolved.
        competitorGaps: scenarioCompetitorGaps(evidence, input),
        demonstrationFix: {
          fixType: "FAQ_EXAMPLE",
          currentIssue: "官网缺少面向采购决策的常见问题解答",
          suggestedAssetType: "结构化 FAQ 区块",
          before: "产品页仅罗列参数,未回答客户关心的交付与售后问题",
          after: "新增 FAQ:交付周期 / 售后响应 / 选型建议,每条给出明确、可核验的回答结构",
          whyBetter: "客户与 AI 都能直接提取到关键决策信息,减少歧义",
          customerConfirmationNeeded: "确认真实的交付周期区间与售后承诺口径",
          geoTeamDeliverable: "FAQ 内容结构模板与首批问题清单",
          evidenceIds: [fp(1)],
        },
      };
    default:
      return {};
  }
}

function createScenarioDeepSeekProvider(
  evidence: readonly EvidenceItem[],
  input: DiagnosisInput,
): StructuredCompletionProvider {
  return {
    async completeJson({ stage }) {
      return { ok: true, json: scenarioStageOutput(stage, evidence, input) };
    },
  };
}

// ---------------------------------------------------------------------------
// ReportProducer — real Agent D assembly over scenario DeepSeek stage outputs.
// ---------------------------------------------------------------------------

export function createLiveReportProducer(clock: () => Date = () => new Date()): ReportProducer {
  return {
    async produce(ctx: ReportProducerContext): Promise<ReportProducerResult> {
      // Evidence keeps its conservative source-property support default; per-claim
      // semantic support is decided later by the ClaimEvidenceVerifier stage.
      const evidence = ctx.evidence;
      const deepseek = createScenarioDeepSeekProvider(evidence, ctx.input);

      const stageNames = ["company_profile", "dimension_signals", "ai_visibility", "claims"] as const;
      const out: Record<string, unknown> = {};
      for (const stage of stageNames) {
        const res = await deepseek.completeJson({
          stage,
          systemPrompt: "scenario",
          userPrompt: "scenario",
          maxTokens: 2048,
        });
        if (!res.ok) {
          return { ok: false, error: { code: res.error.code, message: res.error.message } };
        }
        out[stage] = res.json;
      }

      const identity: ReportIdentity = {
        diagnosisId: ctx.diagnosisId,
        publicToken: ctx.publicToken,
        generatedAt: clock().toISOString(),
      };
      const profileInput: CompanyProfileInput = {
        website: ctx.input.website,
        providedBrandName: ctx.input.brandName,
        providedCompetitors: competitorNames(ctx.input.competitors),
      };
      const aiVisibilityInput: AiVisibilityInput = {
        brandName: resolvedBrand(ctx.input),
        modelUsed: MOCK_MODEL,
        testedAt: identity.generatedAt,
      };
      const stageOutputs: StageOutputs = {
        companyProfile: out.company_profile,
        dimensionSignals: out.dimension_signals,
        aiVisibility: out.ai_visibility,
        claims: out.claims,
      };

      const built = buildReportFromStageOutputs({
        identity,
        profileInput,
        aiVisibilityInput,
        evidence,
        stageOutputs,
      });
      if (!built.ok) {
        const message =
          "issues" in built ? built.issues.join("; ") : built.error.message;
        return { ok: false, error: { code: `REPORT_${built.stage.toUpperCase()}_FAILED`, message } };
      }
      return {
        ok: true,
        report: built.report,
        usage: [{ provider: "deepseek", stage: "ANALYZING", callCount: stageNames.length }],
      };
    },
  };
}
