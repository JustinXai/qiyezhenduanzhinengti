// ============================================================================
// Evidence language detection, source tiering and dedup (Round-5.1 §六).
//
// Deterministic, pure functions applied AFTER normalization and BEFORE the
// evidence set is frozen into the canonical report:
//   - language: "zh" when the CJK share of title+snippet crosses a threshold.
//   - sourceTier: A 企业中文官方 · B 企业/竞品全球官方 · C 中文媒体/机构 ·
//     D 电商平台 · E 社区/问答/测评.
//   - dedup: same-domain + normalized-title merge; per-marketplace and
//     per-community domain caps (≤2 high-value items each). Official (A/B)
//     pages are NEVER evicted by lower-tier volume.
//
// The functions report before/after stats so the run summary can show the
// distribution (§六 统计) without any provider call.
// ============================================================================

import type { EvidenceItem, EvidenceSourceTier } from "../../contracts";

/** Well-known Chinese marketplace domains (tier D; capped at 2 items each). */
export const MARKETPLACE_DOMAINS = [
  "jd.com",
  "tmall.com",
  "taobao.com",
  "pinduoduo.com",
  "suning.com",
  "1688.com",
] as const;

/** Well-known Chinese community / Q&A / review domains (tier E; capped at 2). */
export const COMMUNITY_DOMAINS = [
  "zhihu.com",
  "baidu.com",
  "tieba.baidu.com",
  "bilibili.com",
  "xiaohongshu.com",
  "weibo.com",
  "douyin.com",
  "36kr.com/user", // user posts, not editorial
  "55bbs.com",
  "chinaz.com",
] as const;

const CJK_RE = /[一-鿿㐀-䶿]/g;

/** "zh" when ≥15% of the meaningful characters are CJK. */
export function detectLanguage(text: string): "zh" | "other" {
  const meaningful = text.replace(/\s+/g, "");
  if (meaningful.length === 0) return "other";
  const cjk = (meaningful.match(CJK_RE) ?? []).length;
  return cjk / meaningful.length >= 0.15 ? "zh" : "other";
}

function domainMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`) || h.includes(d);
}

export function isMarketplaceDomain(host: string): boolean {
  return MARKETPLACE_DOMAINS.some((d) => domainMatches(host, d));
}

export function isCommunityDomain(host: string): boolean {
  return COMMUNITY_DOMAINS.some((d) => domainMatches(host, d));
}

/** Deterministic tier per §六. */
export function classifyTier(item: EvidenceItem, language: "zh" | "other"): EvidenceSourceTier {
  if (item.sourceType === "FIRST_PARTY_EVIDENCE") {
    return language === "zh" ? "A" : "B";
  }
  if (item.sourceType === "COMPETITOR_WEB_EVIDENCE") {
    // Competitor official pages sit alongside the company's global official tier.
    return "B";
  }
  if (isMarketplaceDomain(item.sourceDomain)) return "D";
  if (isCommunityDomain(item.sourceDomain)) return "E";
  // Remaining observed sources: Chinese media/industry/institution bucket when
  // the content is Chinese; non-Chinese third-party lands with community-grade
  // priority (it must never outrank Chinese official/media sources).
  return language === "zh" ? "C" : "E";
}

/** Normalized title for near-duplicate merging (lowercase, no punctuation/space). */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .slice(0, 60);
}

export interface EvidenceCurationStats {
  before: number;
  after: number;
  duplicatesMerged: number;
  cappedByDomain: number;
  byTier: Record<EvidenceSourceTier, number>;
  chineseCount: number;
  englishOfficialFallbackCount: number;
}

export interface CuratedEvidence {
  evidence: EvidenceItem[];
  stats: EvidenceCurationStats;
}

const DOMAIN_CAP = 2;

/**
 * Annotate language+tier, merge near-duplicates, and cap marketplace/community
 * domains at 2 high-value items each. Order: input order preserved except that
 * annotated tiers never reorder items (stable, deterministic). Official pages
 * (tier A/B) are exempt from domain caps and never dropped by them.
 */
export function curateEvidence(items: readonly EvidenceItem[]): CuratedEvidence {
  const annotated = items.map((item) => {
    const language = detectLanguage(`${item.title} ${item.snippet}`);
    return { ...item, language, sourceTier: classifyTier(item, language) };
  });

  const seenTitleByDomain = new Set<string>();
  const domainCounts = new Map<string, number>();
  const kept: EvidenceItem[] = [];
  let duplicatesMerged = 0;
  let cappedByDomain = 0;

  for (const item of annotated) {
    const titleKey = `${item.sourceDomain}::${normalizeTitle(item.title)}`;
    if (normalizeTitle(item.title).length > 0 && seenTitleByDomain.has(titleKey)) {
      duplicatesMerged += 1; // same-domain near-identical title → merged away
      continue;
    }
    const capped =
      item.sourceTier === "D" || item.sourceTier === "E"
        ? (domainCounts.get(item.sourceDomain) ?? 0) >= DOMAIN_CAP
        : false;
    if (capped) {
      cappedByDomain += 1;
      continue;
    }
    seenTitleByDomain.add(titleKey);
    domainCounts.set(item.sourceDomain, (domainCounts.get(item.sourceDomain) ?? 0) + 1);
    kept.push(item);
  }

  const byTier: Record<EvidenceSourceTier, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let chineseCount = 0;
  let englishOfficialFallbackCount = 0;
  for (const item of kept) {
    byTier[item.sourceTier as EvidenceSourceTier] += 1;
    if (item.language === "zh") chineseCount += 1;
    if (item.sourceTier === "B" && item.language !== "zh") englishOfficialFallbackCount += 1;
  }

  return {
    evidence: kept,
    stats: {
      before: items.length,
      after: kept.length,
      duplicatesMerged,
      cappedByDomain,
      byTier,
      chineseCount,
      englishOfficialFallbackCount,
    },
  };
}
