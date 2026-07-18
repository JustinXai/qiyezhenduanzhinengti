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

export type CompanyProfileInput = z.infer<typeof CompanyProfile>;

export type QueryCategory =
  | "BRAND_DIRECT"
  | "PURCHASE_DECISION"
  | "COMPETITOR_COMPARISON";

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
}

/** Collapse internal whitespace and trim; returns "" for nullish input. */
function clean(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
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
  }
  for (const question of profile.unresolvedQuestions ?? []) {
    push(question, "PURCHASE_DECISION");
  }

  // --- 竞品对比 (COMPETITOR_COMPARISON) ------------------------------------
  for (const rawCompetitor of profile.competitors ?? []) {
    const competitor = clean(rawCompetitor);
    if (!competitor) continue;
    if (brand) {
      push(`${brand} 和 ${competitor} 对比`, "COMPETITOR_COMPARISON");
    }
    push(`${competitor} 怎么样`, "COMPETITOR_COMPARISON");
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
