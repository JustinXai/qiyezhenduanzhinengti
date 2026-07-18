// ============================================================================
// Deterministic MOCK competitor-domain search (Agent I).
//
// Stands in for a real Bocha web search when identifying a competitor's official
// domain. Zero network, fully deterministic — the same query always yields the
// same results. It only "knows" the fixtured entities below; an unknown name
// yields no results (→ the resolver honestly reports NOT_FOUND). It NEVER
// fabricates "<name>.com"; that is the whole point of resolving from evidence.
//
// Consistent with the existing in-src scenario providers in ./live-seams.ts
// (createScenarioBochaProvider / createScenarioDeepSeekProvider).
// ============================================================================

import type { WebSearchProvider, WebSearchResultItem } from "../../providers/types";

const FETCHED_AT = new Date(0).toISOString();

function item(partial: Omit<WebSearchResultItem, "fetchedAt">): WebSearchResultItem {
  return { ...partial, fetchedAt: FETCHED_AT };
}

export interface MockCompetitorEntry {
  /** Name matched case-insensitively as a substring of the query. */
  match: string;
  results: WebSearchResultItem[];
}

/**
 * Scenario dataset covering every resolution status the search path can reach:
 *   - GoPro / 大疆 DJI / Moka / SAP SuccessFactors → RESOLVED (single official)
 *   - 星辰科技                                       → AMBIGUOUS (two officials)
 *   - 云雀未知企业                                    → NOT_FOUND (no official markers)
 * (USER_CONFIRMED / INVALID_DOMAIN are driven by user-supplied websites, not
 * search, so they need no dataset entry.)
 */
export const SCENARIO_COMPETITOR_DATASET: MockCompetitorEntry[] = [
  {
    match: "GoPro",
    results: [
      item({
        title: "GoPro 官方网站 | Official Site",
        url: "https://gopro.com/zh/cn/",
        snippet: "GoPro 官网,选购 HERO 系列运动相机、配件与订阅服务。",
        sourceDomain: "gopro.com",
      }),
      item({
        title: "GoPro 运动相机 - 京东自营",
        url: "https://item.jd.example.com/gopro",
        snippet: "京东自营 GoPro 运动相机,正品保障。",
        sourceDomain: "jd.example.com",
      }),
    ],
  },
  {
    match: "大疆 DJI",
    results: [
      item({
        title: "大疆 DJI 官方网站 - 无人机与影像设备",
        url: "https://www.dji.com/cn",
        snippet: "大疆官网,提供无人机、手持影像及行业应用解决方案。",
        sourceDomain: "dji.com",
      }),
      item({
        title: "大疆发布新一代航拍无人机 - 科技媒体",
        url: "https://36kr.example.com/p/dji-launch",
        snippet: "媒体报道大疆最新产品发布会。",
        sourceDomain: "36kr.example.com",
      }),
    ],
  },
  {
    match: "Moka",
    results: [
      item({
        title: "Moka 智能化招聘管理系统 官网",
        url: "https://www.mokahr.com/",
        snippet: "Moka 官方网站,一体化智能招聘与人才管理平台。",
        sourceDomain: "mokahr.com",
      }),
      item({
        title: "Moka HR 用户评价 - 测评社区",
        url: "https://reviews.example.org/moka",
        snippet: "第三方社区对 Moka 的使用评价汇总。",
        sourceDomain: "reviews.example.org",
      }),
    ],
  },
  {
    match: "SAP SuccessFactors",
    results: [
      item({
        title: "SAP SuccessFactors 官方网站 - 人力资本管理",
        url: "https://www.sap.com/china/products/hcm.html",
        snippet: "SAP SuccessFactors 官网,云端人力资本管理套件。",
        sourceDomain: "sap.com",
      }),
      item({
        title: "SuccessFactors 百科词条",
        url: "https://encyclopedia.example.org/successfactors",
        snippet: "关于 SuccessFactors 的背景资料。",
        sourceDomain: "encyclopedia.example.org",
      }),
    ],
  },
  {
    // Same-name firms -> two distinct official candidates -> AMBIGUOUS.
    match: "星辰科技",
    results: [
      item({
        title: "星辰科技 官网 - 上海星辰智能",
        url: "https://www.xingchen-sh.example.com/",
        snippet: "上海星辰科技官方网站,工业智能装备。",
        sourceDomain: "xingchen-sh.example.com",
      }),
      item({
        title: "星辰科技官方网站 - 北京星辰网络",
        url: "https://www.xingchen-bj.example.net/",
        snippet: "北京星辰科技官方站点,企业软件服务。",
        sourceDomain: "xingchen-bj.example.net",
      }),
    ],
  },
  {
    // Only listings/forums, no official markers -> NOT_FOUND.
    match: "云雀未知企业",
    results: [
      item({
        title: "云雀未知企业 - 工商信息查询",
        url: "https://www.qcc.example.com/firm/123",
        snippet: "企业工商注册信息查询结果。",
        sourceDomain: "qcc.example.com",
      }),
      item({
        title: "有人了解云雀未知企业吗 - 论坛讨论",
        url: "https://bbs.example.org/t/456",
        snippet: "网友对该企业的零散讨论。",
        sourceDomain: "bbs.example.org",
      }),
    ],
  },
];

/**
 * Build a deterministic mock competitor search provider from a dataset. The
 * longest matching entry name (case-insensitive substring of the query) wins,
 * so "SAP SuccessFactors" is preferred over a hypothetical "SAP" entry.
 */
export function createMockCompetitorSearch(
  entries: readonly MockCompetitorEntry[] = SCENARIO_COMPETITOR_DATASET,
): WebSearchProvider {
  return {
    async search(query, opts) {
      const q = query.toLowerCase();
      let best: MockCompetitorEntry | null = null;
      for (const entry of entries) {
        if (q.includes(entry.match.toLowerCase())) {
          if (!best || entry.match.length > best.match.length) best = entry;
        }
      }
      const limit = opts?.limit ?? 10;
      return { ok: true, results: (best?.results ?? []).slice(0, limit) };
    },
  };
}
