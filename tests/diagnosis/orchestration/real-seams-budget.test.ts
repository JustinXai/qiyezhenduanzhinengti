import { describe, expect, it, vi } from "vitest";
import {
  CanaryBudgetTracker,
  createRealEvidencePipeline,
} from "../../../src/diagnosis/orchestration/real-seams";
import type { GuardedCrawler } from "../../../src/security/crawler/guarded-crawler";
import type { WebSearchProvider, WebSearchResultItem } from "../../../src/providers/types";

describe("Round-6 crawl budget audit", () => {
  it("caps first-party pages across domains, not once per domain", () => {
    const tracker = new CanaryBudgetTracker();
    for (let index = 0; index < 12; index += 1) {
      const charged = tracker.tryChargeCrawl(`first-${index}.example.com`, false);
      expect(charged).toBe(index < 8);
    }
    expect(tracker.snapshot()).toMatchObject({
      firstPartyPageCount: 8,
      competitorPageCount: 0,
      totalCrawlPageCount: 8,
    });
  });

  it("persists non-overlapping first-party and competitor usage stage counts", async () => {
    const tracker = new CanaryBudgetTracker();
    const crawl = vi.fn<GuardedCrawler["crawl"]>(async (url) => ({
      ok: true,
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      body: "<html><body>公开内容</body></html>",
      redirectChain: [],
    }));
    const crawler: GuardedCrawler = { crawl };
    const bocha: WebSearchProvider = {
      async search() {
        return { ok: true, results: [] };
      },
    };
    const pipeline = createRealEvidencePipeline({ bocha, crawler, tracker });
    const firstPartyDomains = Array.from({ length: 9 }, (_, index) => `first-${index}.example.com`);
    const competitorDomain = "competitor.example.net";
    const results: WebSearchResultItem[] = [
      ...firstPartyDomains.map((domain, index) => ({
        title: `first ${index}`,
        url: `https://${domain}/page`,
        snippet: "first party",
        sourceDomain: domain,
        fetchedAt: "2026-07-19T12:00:00.000Z",
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        title: `competitor ${index}`,
        url: `https://${competitorDomain}/page-${index}`,
        snippet: "competitor",
        sourceDomain: competitorDomain,
        fetchedAt: "2026-07-19T12:00:00.000Z",
      })),
    ];

    const result = await pipeline.crawl(
      {
        diagnosisId: "diag_1",
        input: { website: `https://${firstPartyDomains[0]}/page` },
      },
      {
        data: {
          results,
          companyDomains: firstPartyDomains,
          competitorDomains: [competitorDomain],
          executedQueries: ["q1"],
          resolutionEvidence: [],
          resolutions: [],
          searchFailures: 0,
        },
      },
    );

    const summaries = (result.usage ?? []).filter((item) => (item.callCount ?? 0) > 0);
    expect(summaries).toEqual([
      {
        provider: "crawler",
        stage: "CRAWLING_FIRST_PARTY",
        callCount: 8,
      },
      {
        provider: "crawler",
        stage: "CRAWLING_COMPETITOR",
        callCount: 4,
      },
    ]);
    expect(summaries.reduce((sum, item) => sum + (item.callCount ?? 0), 0)).toBe(12);
    expect(crawl).toHaveBeenCalledTimes(12);
    expect(tracker.snapshot()).toMatchObject({
      firstPartyPageCount: 8,
      competitorPageCount: 4,
      totalCrawlPageCount: 12,
    });
  });
});
