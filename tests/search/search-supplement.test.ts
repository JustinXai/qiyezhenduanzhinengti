import { describe, expect, it } from "vitest";
import {
  filterSearchResultsForDiagnosis,
  mergeSearchResults,
  shouldSupplementSearch,
} from "../../src/diagnosis/search/search-supplement";
import type { WebSearchResultItem } from "../../src/providers/types";

function item(overrides: Partial<WebSearchResultItem>): WebSearchResultItem {
  return {
    title: "默认结果",
    url: "https://example.com/default",
    snippet: "默认摘要",
    sourceDomain: "example.com",
    fetchedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("search supplement trigger", () => {
  it("asks for supplemental search when primary results do not match the query", () => {
    expect(
      shouldSupplementSearch("北京智邦智程科技发展有限公司 LaunchMind AI", [
        item({ title: "北京智邦国际软件技术有限公司", url: "https://wrong.example.com" }),
        item({ title: "产成品交付流程", url: "https://generic.example.com" }),
      ]),
    ).toBe(true);
  });

  it("keeps primary results when enough items match the query", () => {
    expect(
      shouldSupplementSearch("北京智邦智程科技发展有限公司 LaunchMind AI", [
        item({
          title: "北京智邦智程科技发展有限公司 LaunchMind AI 项目介绍",
          url: "https://brand.example.com/a",
        }),
        item({
          title: "北京智邦智程科技发展有限公司 团队与交付说明",
          url: "https://brand.example.com/b",
        }),
      ]),
    ).toBe(false);
  });

  it("merges supplemental results without duplicating URLs", () => {
    const merged = mergeSearchResults(
      [item({ title: "A", url: "https://brand.example.com/a" })],
      [
        item({ title: "A duplicate", url: "https://brand.example.com/a" }),
        item({ title: "B", url: "https://brand.example.com/b" }),
      ],
    );
    expect(merged.map((entry) => entry.url)).toEqual([
      "https://brand.example.com/a",
      "https://brand.example.com/b",
    ]);
  });

  it("filters same-name companies and generic documents from the evidence pool", () => {
    const filtered = filterSearchResultsForDiagnosis(
      [
        item({
          title: "北京智邦智程科技发展有限公司 LaunchMind AI 项目介绍",
          url: "https://www.iu-talents.com/launchmind",
        }),
        item({
          title: "北京智邦国际软件技术有限公司",
          url: "https://www.zbintel.com/",
          snippet: "企业管理软件",
        }),
        item({
          title: "货物交付流程",
          url: "https://generic.example.com/delivery",
          snippet: "订单确认和交付流程参考",
        }),
      ],
      {
        brandName: "北京智邦智程科技发展有限公司",
        websiteHost: "iu-talents.com",
        industry: "青少年职业与创业教育",
        productOrService: "LaunchMind AI 职业和创业教育",
      },
    );

    expect(filtered.map((entry) => entry.url)).toEqual(["https://www.iu-talents.com/launchmind"]);
  });
});
