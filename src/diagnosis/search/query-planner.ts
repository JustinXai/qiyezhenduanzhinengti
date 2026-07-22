// ============================================================================
// Query planner (Agent C) — deterministic search-query generation.
//
// Turns a canonical `CompanyProfile` into an ordered, de-duplicated list of
// web-search queries grouped into three intents:
//   - BRAND_DIRECT          品牌直查
//   - PURCHASE_DECISION     购买决策
//   - COMPETITOR_COMPARISON 竞品对比
//
// Pure & deterministic: the same profile always yields the exact same list in
// the same order. No randomness, no clock, no I/O. Orchestration (Agent E) may
// cap the list with `maxTotal`; the cap is applied after ordering + dedupe so
// it stays deterministic.
//
// Category string literals intentionally mirror the canonical
// `AIVisibilityQuestionCategory` enum values in src/contracts/index.ts so the
// seam with downstream AI-visibility tests stays wire-aligned. This module
// imports the contract type read-only and never mutates it.
// ============================================================================

import type { z } from "zod";
import type { CompanyProfile } from "../../contracts";
import type { CompetitorResolution } from "../competitors/types";
import { buildReputationQueries } from "../reputation/policy";

export type CompanyProfileInput = z.infer<typeof CompanyProfile>;

export type QueryCategory =
  | "BRAND_DIRECT"
  | "REPUTATION_REVIEW"
  | "PURCHASE_DECISION"
  | "COMPETITOR_COMPARISON"
  // Dedicated intent for identifying a competitor's OFFICIAL domain. Only
  // emitted by the domain-resolution helpers below — never mixed into the
  // default `planSearchQueries` output, so the main plan's ordering stays the
  // three canonical intents.
  | "COMPETITOR_DOMAIN_RESOLUTION";

export interface PlannedQuery {
  /** The literal search string sent to the web-search provider. */
  query: string;
  /** Intent bucket this query belongs to. */
  category: QueryCategory;
}

export interface QueryPlanOptions {
  /**
   * Optional deterministic cap on the total number of queries. Applied after
   * ordering + de-duplication, so slicing never reorders results. When unset,
   * every planned query is returned.
   */
  maxTotal?: number;
  /**
   * Competitor domain resolutions (Agent I). When supplied, competitor-
   * comparison queries for a CONFIRMED competitor (USER_CONFIRMED / RESOLVED)
   * are additionally scoped to its official domain (`site:<domain> ...`), so
   * the search pulls the competitor's own pages instead of relying on the
   * name alone. Absent this option, behaviour is byte-identical to before.
   */
  competitorResolutions?: readonly CompetitorResolution[];
}

/** Collapse internal whitespace and trim; returns "" for nullish input. */
function clean(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Official-domain resolution queries (Agent I).
//
// These phrase the search used to DISCOVER a competitor's official website. We
// only ever ask the search provider to point us at the site — we never derive a
// host by concatenating the name with ".com" (that fabrication is banned; the
// resolver trusts real search evidence only). See src/diagnosis/competitors/.
// ---------------------------------------------------------------------------

/**
 * Frozen Round-5.1 evidence-language policy: Chinese queries are the primary
 * evidence source; English queries exist ONLY for official-identity
 * confirmation and official-fact fallback (never as the main evidence base).
 */
export const ZH_CN_QUERY_POLICY = "ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK" as const;

/** True when a competitor name is pure ASCII (an international brand form). */
function isAsciiName(name: string): boolean {
  return /^[\x20-\x7e]+$/.test(name);
}

/** Pure: the official-domain-resolution query strings for one competitor name. */
export function buildCompetitorDomainQueries(name: string): string[] {
  const n = clean(name);
  if (!n) return [];
  // International (ASCII) brands resolve best through their English official
  // site; Chinese search often surfaces marketplaces instead of the brand's
  // own domain (Round-5 canary: GoPro unresolved via "GoPro 官网").
  if (isAsciiName(n)) {
    return [`${n} official website`, `${n} 官网`, `${n} 官方网站`];
  }
  return [`${n} 官网`, `${n} 官方网站`, `${n} official site`];
}

/**
 * Pure: planned COMPETITOR_DOMAIN_RESOLUTION queries for a list of competitor
 * names. Order-preserving, de-duplicated, blank names skipped.
 */
export function planCompetitorDomainResolutionQueries(
  names: readonly string[],
): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];
  for (const name of names) {
    for (const q of buildCompetitorDomainQueries(name)) {
      if (seen.has(q)) continue;
      seen.add(q);
      out.push({ query: q, category: "COMPETITOR_DOMAIN_RESOLUTION" });
    }
  }
  return out;
}

/**
 * Plan the deterministic search-query set for a company profile.
 *
 * Ordering is stable: brand-direct queries first, then purchase-decision, then
 * competitor-comparison (competitors in profile order). Duplicates (after
 * whitespace normalization) are dropped, keeping the first occurrence.
 */
export function planSearchQueries(
  profile: CompanyProfileInput,
  options: QueryPlanOptions = {},
): PlannedQuery[] {
  const brand = clean(profile.brandName);
  const industry = clean(profile.industry);
  const productOrService = clean(profile.productOrService);
  const region = clean(profile.targetRegion);

  const planned: PlannedQuery[] = [];
  const push = (query: string, category: QueryCategory): void => {
    const q = clean(query);
    if (q.length > 0) planned.push({ query: q, category });
  };

  // --- 品牌直查 (BRAND_DIRECT) ---------------------------------------------
  if (brand) {
    push(brand, "BRAND_DIRECT");
    push(`${brand} 官网`, "BRAND_DIRECT");
    push(`${brand} 怎么样 口碑 评价`, "BRAND_DIRECT");
    if (productOrService) {
      push(`${brand} ${productOrService}`, "BRAND_DIRECT");
    }
    for (const query of buildReputationQueries({
      brandName: brand,
      industry,
      productOrService,
      targetRegion: region,
    }, 4)) {
      push(query, "REPUTATION_REVIEW");
    }
  }

  // --- 信任证据 / 渠道 / 社区 (Round-5.1 §五 中文桶 6/8/9) -------------------
  // Chinese trust, marketplace and community buckets so the domestic web is the
  // PRIMARY evidence source (ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK).
  if (brand) {
    push(`${brand} 案例 资质 认证`, "BRAND_DIRECT");
    push(`${brand} 旗舰店`, "BRAND_DIRECT");
    push(`${brand} 知乎 评测`, "BRAND_DIRECT");
    push(`${brand} 售后 服务 保障`, "BRAND_DIRECT");
    push(`${brand} 渠道 经销 合作`, "BRAND_DIRECT");
  }
  if (productOrService) {
    push(`${productOrService} 使用场景`, "PURCHASE_DECISION");
  }

  // --- 购买决策 (PURCHASE_DECISION) ----------------------------------------
  if (region && industry) {
    push(`${region} ${industry} 供应商 推荐`, "PURCHASE_DECISION");
  } else if (industry) {
    push(`${industry} 供应商 推荐`, "PURCHASE_DECISION");
  }
  if (productOrService) {
    push(`${productOrService} 如何选择`, "PURCHASE_DECISION");
  }
  if (industry) {
    push(`${industry} 选型 对比 注意事项`, "PURCHASE_DECISION");
    push(`${industry} 行业 媒体 报道`, "PURCHASE_DECISION");
  }
  for (const question of profile.unresolvedQuestions ?? []) {
    push(question, "PURCHASE_DECISION");
  }

  // --- 竞品对比 (COMPETITOR_COMPARISON) ------------------------------------
  // Index resolutions by cleaned name so we can scope queries to a competitor's
  // confirmed official domain when one is known.
  const resolvedDomainByName = new Map<string, string>();
  for (const r of options.competitorResolutions ?? []) {
    const key = clean(r.name);
    if (key && r.resolvedDomain && !resolvedDomainByName.has(key)) {
      resolvedDomainByName.set(key, r.resolvedDomain);
    }
  }
  for (const rawCompetitor of profile.competitors ?? []) {
    const competitor = clean(rawCompetitor);
    if (!competitor) continue;
    if (brand) {
      push(`${brand} 和 ${competitor} 对比`, "COMPETITOR_COMPARISON");
    }
    push(`${competitor} 怎么样`, "COMPETITOR_COMPARISON");
    // When we have a confirmed official domain, also pull the competitor's own
    // pages directly. Only added when resolutions are supplied, so the default
    // plan is unchanged.
    const domain = resolvedDomainByName.get(competitor);
    if (domain) {
      push(`site:${domain}`, "COMPETITOR_COMPARISON");
    }
  }

  // --- Order-preserving de-duplication (key = category + query) ------------
  const seen = new Set<string>();
  const deduped: PlannedQuery[] = [];
  for (const item of planned) {
    const key = `${item.category}::${item.query}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (typeof options.maxTotal === "number" && options.maxTotal >= 0) {
    return deduped.slice(0, options.maxTotal);
  }
  return deduped;
}
