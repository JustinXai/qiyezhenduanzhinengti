import type { WebSearchResultItem } from "../../providers/types";

export interface SearchSupplementOptions {
  minResultCount?: number;
  minQueryHits?: number;
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
