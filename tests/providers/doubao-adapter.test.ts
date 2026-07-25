import { describe, expect, it, vi } from "vitest";
import {
  createDoubaoSearchProvider,
  DOUBAO_WEB_SEARCH_ENDPOINT,
} from "../../src/providers/doubao/doubao-adapter";

describe("Doubao search adapter", () => {
  it("posts the documented web-search request and normalizes results", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        Query: "北京智邦智程科技发展有限公司",
        SearchType: "web",
        Count: 5,
        Filter: { NeedContent: true, NeedUrl: true },
      });
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            results: [
              {
                title: "北京智邦智程科技发展有限公司 LaunchMind AI",
                url: "https://example.com/launchmind",
                content: "项目介绍正文",
                domain: "example.com",
                date: "2026-07-25T00:00:00.000Z",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = createDoubaoSearchProvider({
      apiKey: "test-key",
      apiKeyId: "test-id",
      fetchImpl,
      now: () => "2026-07-25T00:00:00.000Z",
    });

    const result = await provider.search("北京智邦智程科技发展有限公司", { limit: 5 });

    expect(fetchImpl).toHaveBeenCalledWith(
      DOUBAO_WEB_SEARCH_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key",
          "x-api-key": "test-key",
          "x-api-key-id": "test-id",
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      results: [
        {
          title: "北京智邦智程科技发展有限公司 LaunchMind AI",
          url: "https://example.com/launchmind",
          snippet: "项目介绍正文",
          sourceDomain: "example.com",
          fetchedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    });
  });

  it("requires an API key instead of silently calling the endpoint", async () => {
    const fetchImpl = vi.fn();
    const provider = createDoubaoSearchProvider({ apiKey: "", fetchImpl });

    const result = await provider.search("北京智邦智程科技发展有限公司");

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
