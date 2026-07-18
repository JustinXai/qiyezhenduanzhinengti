// ============================================================================
// REAL provider seams (Round-5, technical company canary).
//
// Wires the OFFICIAL system modules — Bocha adapter, guarded crawler, competitor
// resolver, query planner, evidence normalization, stage prompts, DeepSeek
// adapter, report assembly — into the unchanged EvidencePipeline/ReportProducer
// interfaces of the state machine. NO diagnosis logic is duplicated here; this
// file is wiring + the frozen canary budget rail.
//
// Budget profile TECHNICAL_COMPANY_CANARY_V1 (frozen):
//   Bocha    expected ≤10, HARD 12, retries 0
//   DeepSeek expected ≤6,  HARD 8,  retries 0
//   Crawl    ≤12 pages total, ≤8 per domain, ≤4 across competitor domains
//   Wallclock 15 minutes
// Any hard-cap breach throws BudgetExceededError (code BUDGET_EXCEEDED): the
// stage fails, the pipeline stops, budgets are NEVER auto-raised.
// ============================================================================

import * as cheerio from "cheerio";
import type { EvidenceItem } from "../../contracts";
import { deriveCoverage } from "../../contracts/claim-evidence";
import type {
  StructuredCompletionProvider,
  WebSearchProvider,
  WebSearchResultItem,
} from "../../providers/types";
import { createBochaProvider } from "../../providers/bocha/bocha-adapter";
import {
  createDeepSeekProvider,
  deepSeekConfigFromEnv,
} from "../../providers/deepseek/deepseek-adapter";
import {
  createGuardedCrawler,
  type GuardedCrawler,
} from "../../security/crawler/guarded-crawler";
import { planSearchQueries } from "../search/query-planner";
import { normalizeEvidence } from "../evidence/normalize";
import { curateEvidence } from "../evidence/tiering";
import { resolveCompetitors } from "../competitors/resolve";
import type { CompetitorResolution } from "../competitors/types";
import {
  buildReportFromStageOutputs,
  type ReportIdentity,
  type StageOutputs,
} from "../../report/generation";
import {
  buildAiVisibilityPrompt,
  buildClaimsPrompt,
  buildCompanyProfilePrompt,
  buildDimensionSignalsPrompt,
  defaultProbes,
} from "../analysis/stage-prompts";
import {
  AiVisibilityStageOutput,
  ClaimsStageOutput,
  CompanyProfileStageOutput,
  DimensionSignalsStageOutput,
} from "../analysis/stage-schemas";
import { parseStageJson } from "../../providers/deepseek/stage-schema";
import type { CompanyProfileInput } from "../analysis/company-profile";
import type { AiVisibilityInput } from "../analysis/ai-visibility";
import { competitorNames, type DiagnosisInput } from "../../runtime/diagnosis-input";
import type {
  EvidencePipeline,
  EvidenceStageContext,
  NormalizedEvidenceResult,
  ProviderUsageSample,
  ReportProducer,
  ReportProducerContext,
  ReportProducerResult,
  StageResult,
} from "./state-machine";

// ---------------------------------------------------------------------------
// Frozen canary budget profile.
// ---------------------------------------------------------------------------

export const TECHNICAL_COMPANY_CANARY_V1 = {
  name: "TECHNICAL_COMPANY_CANARY_V1",
  bocha: { expectedMax: 10, hardMax: 12, retries: 0 },
  deepseek: { expectedMax: 6, hardMax: 8, retries: 0 },
  crawl: { maxPagesTotal: 12, maxPagesPerDomain: 8, maxCompetitorPages: 4 },
  wallClockMs: 15 * 60 * 1000,
  /** Planned main search queries (excl. competitor resolution) per run. */
  maxPlannedQueries: 8,
  /** Results requested per Bocha query. */
  perQueryLimit: 5,
} as const;

export type CanaryBudgetProfile = typeof TECHNICAL_COMPANY_CANARY_V1;

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED";
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Mutable per-run counters guarded by the frozen profile. */
export class CanaryBudgetTracker {
  readonly profile: CanaryBudgetProfile;
  bochaCalls = 0;
  deepseekCalls = 0;
  crawledPages = 0;
  private readonly pagesPerDomain = new Map<string, number>();
  competitorPages = 0;
  private readonly startedAt: number;
  private readonly now: () => number;

  constructor(profile: CanaryBudgetProfile = TECHNICAL_COMPANY_CANARY_V1, now: () => number = Date.now) {
    this.profile = profile;
    this.now = now;
    this.startedAt = now();
  }

  assertWallClock(): void {
    if (this.now() - this.startedAt > this.profile.wallClockMs) {
      throw new BudgetExceededError(`wall clock exceeded ${this.profile.wallClockMs}ms`);
    }
  }

  chargeBocha(): void {
    this.assertWallClock();
    if (this.bochaCalls >= this.profile.bocha.hardMax) {
      throw new BudgetExceededError(`bocha hard cap ${this.profile.bocha.hardMax} reached`);
    }
    this.bochaCalls += 1;
  }

  chargeDeepSeek(): void {
    this.assertWallClock();
    if (this.deepseekCalls >= this.profile.deepseek.hardMax) {
      throw new BudgetExceededError(`deepseek hard cap ${this.profile.deepseek.hardMax} reached`);
    }
    this.deepseekCalls += 1;
  }

  /** Returns false (skip, no charge) when a page must not be crawled; throws never. */
  tryChargeCrawl(domain: string, isCompetitor: boolean): boolean {
    this.assertWallClock();
    if (this.crawledPages >= this.profile.crawl.maxPagesTotal) return false;
    const perDomain = this.pagesPerDomain.get(domain) ?? 0;
    if (perDomain >= this.profile.crawl.maxPagesPerDomain) return false;
    if (isCompetitor && this.competitorPages >= this.profile.crawl.maxCompetitorPages) return false;
    this.crawledPages += 1;
    this.pagesPerDomain.set(domain, perDomain + 1);
    if (isCompetitor) this.competitorPages += 1;
    return true;
  }
}

/** Budget-guarded WebSearchProvider: every call charges the tracker FIRST. */
export function budgetedSearchProvider(
  inner: WebSearchProvider,
  tracker: CanaryBudgetTracker,
): WebSearchProvider {
  return {
    async search(query, opts) {
      tracker.chargeBocha(); // throws at the hard cap — the call never leaves
      return inner.search(query, opts);
    },
  };
}

/** Budget-guarded StructuredCompletionProvider. */
export function budgetedCompletionProvider(
  inner: StructuredCompletionProvider,
  tracker: CanaryBudgetTracker,
): StructuredCompletionProvider {
  return {
    async completeJson(input) {
      tracker.chargeDeepSeek();
      return inner.completeJson(input);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}

function resolvedBrand(input: DiagnosisInput): string {
  const provided = input.brandName?.trim();
  if (provided) return provided;
  const label = hostOf(input.website).split(".")[0] ?? "";
  return label || "该企业";
}

/** Extract a bounded, readable text summary from a crawled HTML body. */
export function extractPageSummary(html: string, maxChars = 400): { title: string; text: string } {
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 160);
    const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
    const body = $("body").text().replace(/\s+/g, " ").trim();
    const text = [description, h1, body].filter(Boolean).join(" | ").slice(0, maxChars);
    return { title, text };
  } catch {
    return { title: "", text: "" };
  }
}

interface RealSearchData {
  results: WebSearchResultItem[];
  companyDomains: string[];
  competitorDomains: string[];
  executedQueries: string[];
  resolutionEvidence: EvidenceItem[];
  resolutions: CompetitorResolution[];
  searchFailures: number;
}

// ---------------------------------------------------------------------------
// Real EvidencePipeline.
// ---------------------------------------------------------------------------

export interface RealEvidencePipelineDeps {
  bocha: WebSearchProvider;
  crawler: GuardedCrawler;
  tracker: CanaryBudgetTracker;
  now?: () => string;
}

export function createRealEvidencePipeline(deps: RealEvidencePipelineDeps): EvidencePipeline {
  const now = deps.now ?? (() => new Date().toISOString());
  const bocha = budgetedSearchProvider(deps.bocha, deps.tracker);
  const profile = deps.tracker.profile;

  return {
    async search(ctx: EvidenceStageContext): Promise<StageResult> {
      const { input } = ctx;
      const host = hostOf(input.website);
      const usage: ProviderUsageSample[] = [];

      // --- Competitor resolution: one REAL search per name-only competitor. ---
      const resolution = await resolveCompetitors(input.competitors, {
        search: bocha,
        searchLimit: profile.perQueryLimit,
      });
      const resolutionCalls = resolution.resolutions.filter((r) => r.providedDomain === null).length;
      if (resolutionCalls > 0) {
        usage.push({ provider: "bocha", stage: "SEARCHING", callCount: resolutionCalls });
      }

      // --- Planned queries over the REAL provider (capped, no retries). --------
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
        { maxTotal: profile.maxPlannedQueries, competitorResolutions: resolution.resolutions },
      );

      const seen = new Set<string>();
      const results: WebSearchResultItem[] = [];
      const executedQueries: string[] = [];
      let searchFailures = 0;
      for (const pq of planned) {
        const res = await bocha.search(pq.query, { limit: profile.perQueryLimit });
        if (res.ok) {
          executedQueries.push(pq.query);
          usage.push({ provider: "bocha", stage: "SEARCHING", callCount: 1 });
          for (const item of res.results) {
            const key = item.url.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              results.push(item);
            }
          }
        } else {
          searchFailures += 1;
          usage.push({
            provider: "bocha",
            stage: "SEARCHING",
            callCount: 1,
            errorCode: res.error.code,
          });
        }
      }

      if (executedQueries.length === 0 && results.length === 0) {
        throw new Error(
          `SEARCH_INSUFFICIENT: all ${planned.length} planned queries failed (${searchFailures} failures)`,
        );
      }

      const data: RealSearchData = {
        results,
        companyDomains: host ? [host] : [],
        competitorDomains: resolution.resolvedDomains,
        executedQueries,
        resolutionEvidence: resolution.evidence,
        resolutions: resolution.resolutions,
        searchFailures,
      };
      return { data, usage };
    },

    async crawl(ctx, searchResult: StageResult): Promise<StageResult> {
      const data = searchResult.data as RealSearchData;
      const tracker = deps.tracker;
      const usage: ProviderUsageSample[] = [];
      const competitorSet = new Set(data.competitorDomains);
      const isFirstParty = (d: string) => data.companyDomains.includes(d);

      // Crawl order: the company homepage first, then first-party pages from
      // search, then confirmed-competitor pages. Observed third-party pages are
      // NOT crawled — their search title/snippet already carries the signal and
      // pages beyond the company/competitor scope stay out of the crawl boundary.
      const targets: Array<{ url: string; domain: string; competitor: boolean }> = [];
      const seenUrl = new Set<string>();
      const push = (url: string) => {
        const domain = hostOf(url);
        if (!domain) return;
        const key = url.toLowerCase();
        if (seenUrl.has(key)) return;
        seenUrl.add(key);
        const competitor = competitorSet.has(domain);
        if (!isFirstParty(domain) && !competitor) return;
        targets.push({ url, domain, competitor });
      };
      push(ctx.input.website);
      for (const r of data.results) if (isFirstParty(hostOf(r.url))) push(r.url);
      for (const r of [...data.results, ...data.resolutionEvidence.map((e) => ({ url: e.url }))]) {
        if (competitorSet.has(hostOf(r.url))) push(r.url);
      }

      const crawled = new Map<string, { title: string; text: string; fetchedAt: string }>();
      let attempted = 0;
      let rejected = 0;
      for (const t of targets) {
        if (!tracker.tryChargeCrawl(t.domain, t.competitor)) continue; // caps: skip, never breach
        attempted += 1;
        const outcome = await deps.crawler.crawl(t.url);
        if (outcome.ok) {
          const summary = extractPageSummary(outcome.body);
          crawled.set(t.url.toLowerCase(), { ...summary, fetchedAt: now() });
        } else {
          rejected += 1;
          usage.push({
            provider: "crawler",
            stage: "CRAWLING",
            callCount: 1,
            errorCode: outcome.reason,
          });
        }
      }
      if (attempted > rejected) {
        usage.push({ provider: "crawler", stage: "CRAWLING", callCount: attempted - rejected });
      }

      // Enrich search results with crawled content; add the homepage as a
      // first-party result when the search set did not already include it.
      const enriched: WebSearchResultItem[] = data.results.map((r) => {
        const hit = crawled.get(r.url.toLowerCase());
        if (!hit) return r;
        return {
          ...r,
          title: r.title || hit.title,
          snippet: hit.text || r.snippet,
          fetchedAt: hit.fetchedAt,
        };
      });
      const homeKey = ctx.input.website.toLowerCase();
      const homeHit = crawled.get(homeKey);
      if (homeHit && !enriched.some((r) => r.url.toLowerCase() === homeKey)) {
        enriched.push({
          title: homeHit.title || `${resolvedBrand(ctx.input)} 官网首页`,
          url: ctx.input.website,
          snippet: homeHit.text,
          sourceDomain: hostOf(ctx.input.website),
          fetchedAt: homeHit.fetchedAt,
        });
      }

      return { data: { ...data, results: enriched }, usage };
    },

    async normalize(_ctx, crawlResult: StageResult): Promise<NormalizedEvidenceResult> {
      const data = crawlResult.data as RealSearchData;
      const base = normalizeEvidence(data.results, {
        companyDomains: data.companyDomains,
        competitorDomains: data.competitorDomains,
      });
      const byId = new Map<string, EvidenceItem>();
      for (const e of base) byId.set(e.id, e);
      for (const e of data.resolutionEvidence) if (!byId.has(e.id)) byId.set(e.id, e);
      // Round-5.1 §六: language + sourceTier annotation, near-duplicate merge and
      // marketplace/community domain caps — official pages are never evicted.
      const curated = curateEvidence([...byId.values()]);
      const evidence = curated.evidence;
      const coverage = deriveCoverage({
        evidence,
        firstPartyDomains: data.companyDomains,
        executedQueries: data.executedQueries,
      });
      // The per-item language/sourceTier annotations flow into the canonical
      // report, so distribution stats stay derivable downstream without a
      // side-channel (curated.stats is also unit-tested directly).
      return { evidence, coverage };
    },
  };
}

// ---------------------------------------------------------------------------
// Real ReportProducer — four staged DeepSeek structured completions.
// ---------------------------------------------------------------------------

export interface RealReportProducerDeps {
  deepseek: StructuredCompletionProvider;
  tracker: CanaryBudgetTracker;
  model: string;
  clock?: () => Date;
}

export function createRealReportProducer(deps: RealReportProducerDeps): ReportProducer {
  const clock = deps.clock ?? (() => new Date());
  const deepseek = budgetedCompletionProvider(deps.deepseek, deps.tracker);

  return {
    async produce(ctx: ReportProducerContext): Promise<ReportProducerResult> {
      const { input, evidence } = ctx;
      const usage: ProviderUsageSample[] = [];
      const competitorDomains = [
        ...new Set(
          evidence.filter((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE").map((e) => e.sourceDomain),
        ),
      ];

      // Per-stage strict schemas: a shape mismatch stops the run IMMEDIATELY so
      // later paid stages are never spent on an already-failed analysis.
      const stages = [
        { name: "company_profile", prompt: buildCompanyProfilePrompt(input, evidence), schema: CompanyProfileStageOutput },
        { name: "dimension_signals", prompt: buildDimensionSignalsPrompt(input, evidence), schema: DimensionSignalsStageOutput },
        { name: "ai_visibility", prompt: buildAiVisibilityPrompt(input, defaultProbes(input)), schema: AiVisibilityStageOutput },
        { name: "claims", prompt: buildClaimsPrompt(input, evidence, competitorDomains), schema: ClaimsStageOutput },
      ] as const;

      const out: Record<string, unknown> = {};
      for (const { name, prompt, schema } of stages) {
        const res = await deepseek.completeJson({
          stage: name,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          maxTokens: prompt.maxTokens,
        });
        usage.push({
          provider: "deepseek",
          stage: "ANALYZING",
          callCount: 1,
          errorCode: res.ok ? null : res.error.code,
        });
        if (!res.ok) {
          return { ok: false, error: { code: res.error.code, message: res.error.message } };
        }
        const parsed = parseStageJson(name, schema as never, res.json);
        if (!parsed.ok) {
          return {
            ok: false,
            error: { code: `REPORT_${name.toUpperCase()}_FAILED`, message: parsed.error.message },
          };
        }
        out[name] = res.json;
      }

      const identity: ReportIdentity = {
        diagnosisId: ctx.diagnosisId,
        publicToken: ctx.publicToken,
        generatedAt: clock().toISOString(),
      };
      const profileInput: CompanyProfileInput = {
        website: input.website,
        providedBrandName: input.brandName,
        providedCompetitors: competitorNames(input.competitors),
      };
      const aiVisibilityInput: AiVisibilityInput = {
        brandName: resolvedBrand(input),
        modelUsed: deps.model,
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
        const message = "issues" in built ? built.issues.join("; ") : built.error.message;
        return {
          ok: false,
          error: { code: `REPORT_${built.stage.toUpperCase()}_FAILED`, message },
        };
      }
      return { ok: true, report: built.report, usage };
    },
  };
}

// ---------------------------------------------------------------------------
// Env wiring — the ONLY place real network clients are constructed.
// ---------------------------------------------------------------------------

export interface RealSeams {
  evidence: EvidencePipeline;
  producer: ReportProducer;
  tracker: CanaryBudgetTracker;
}

/** Build the real seams from server env. Retries are 0 by profile, always. */
export function createRealSeams(env: NodeJS.ProcessEnv = process.env): RealSeams {
  const tracker = new CanaryBudgetTracker(TECHNICAL_COMPANY_CANARY_V1);
  const bocha = createBochaProvider({
    apiKey: env.BOCHA_API_KEY,
    maxRetries: TECHNICAL_COMPANY_CANARY_V1.bocha.retries,
  });
  const dsConfig = deepSeekConfigFromEnv(env);
  const deepseek = createDeepSeekProvider(dsConfig, { fetch: globalThis.fetch });
  const crawler = createGuardedCrawler();
  return {
    evidence: createRealEvidencePipeline({ bocha, crawler, tracker }),
    producer: createRealReportProducer({
      deepseek,
      tracker,
      model: dsConfig.model ?? "deepseek-v4-flash",
    }),
    tracker,
  };
}
