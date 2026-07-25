import type { WebSearchResultItem } from "../../providers/types";

export interface SearchSupplementOptions {
  minResultCount?: number;
  minQueryHits?: number;
}

export interface SearchRelevanceContext {
  brandName?: string;
  websiteHost?: string;
  industry?: string;
  productOrService?: string;
  competitors?: readonly string[];
  competitorDomains?: readonly string[];
}

function normalizeQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

function normalizeEntityTokens(value: string | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/(有限责任公司|股份有限公司|有限公司|科技发展|科技|发展|北京|上海|广州|深圳|中国)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function resultText(item: WebSearchResultItem): string {
  return `${item.title} ${item.snippet} ${item.url} ${item.sourceDomain}`.toLowerCase();
}

function queryHitCount(query: string, results: readonly WebSearchResultItem[]): number {
  const tokens = normalizeQueryTokens(query);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const item of results) {
    const text = resultText(item);
    if (tokens.some((token) => text.includes(token))) {
      hits += 1;
    }
  }
  return hits;
}

export function shouldSupplementSearch(
  query: string,
  results: readonly WebSearchResultItem[],
  options: SearchSupplementOptions = {},
): boolean {
  const minResultCount = options.minResultCount ?? 2;
  const minQueryHits = options.minQueryHits ?? 2;
  if (results.length === 0) return true;
  if (results.length < minResultCount) return true;
  return queryHitCount(query, results) < minQueryHits;
}

export function mergeSearchResults(
  primary: readonly WebSearchResultItem[],
  secondary: readonly WebSearchResultItem[],
): WebSearchResultItem[] {
  const seen = new Set<string>();
  const merged: WebSearchResultItem[] = [];
  for (const item of [...primary, ...secondary]) {
    const key = item.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function canonicalHost(host: string | undefined): string {
  let h = (host ?? "").trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

function hostOf(url: string): string {
  try {
    return canonicalHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function hostMatches(host: string, domain: string): boolean {
  const h = canonicalHost(host);
  const d = canonicalHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function isSearchResultRelevantToDiagnosis(
  item: WebSearchResultItem,
  ctx: SearchRelevanceContext,
): boolean {
  const host = hostOf(item.url) || canonicalHost(item.sourceDomain);
  if (ctx.websiteHost && hostMatches(host, ctx.websiteHost)) return true;
  for (const domain of ctx.competitorDomains ?? []) {
    if (hostMatches(host, domain)) return true;
  }

  const text = resultText(item);
  const brand = (ctx.brandName ?? "").trim().toLowerCase();
  if (brand.length >= 4 && text.includes(brand)) return true;

  const entityTokens = [
    ...normalizeEntityTokens(ctx.brandName),
    ...normalizeEntityTokens(ctx.productOrService),
    ...normalizeEntityTokens(ctx.industry),
    ...(ctx.competitors ?? []).flatMap((name) => normalizeEntityTokens(name)),
  ];
  const uniqueTokens = [...new Set(entityTokens)];
  if (uniqueTokens.length === 0) return true;

  const hits = uniqueTokens.filter((token) => text.includes(token)).length;
  return hits >= 2;
}

export function filterSearchResultsForDiagnosis(
  items: readonly WebSearchResultItem[],
  ctx: SearchRelevanceContext,
): WebSearchResultItem[] {
  return items.filter((item) => isSearchResultRelevantToDiagnosis(item, ctx));
}
