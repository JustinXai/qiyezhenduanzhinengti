import { describe, expect, it } from "vitest";
import { mergeSearchResults, shouldSupplementSearch } from "../../src/diagnosis/search/search-supplement";
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
});
