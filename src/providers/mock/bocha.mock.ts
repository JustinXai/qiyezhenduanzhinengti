import type { WebSearchProvider, WebSearchResultItem } from "../types";

// Deterministic mock so `pnpm smoke:mock` never touches the real Bocha API.
export function createMockBochaProvider(): WebSearchProvider {
  return {
    async search(query, opts) {
      const limit = opts?.limit ?? 5;
      const results: WebSearchResultItem[] = Array.from({ length: Math.min(limit, 3) }).map(
        (_, i) => ({
          title: `Mock result ${i + 1} for "${query}"`,
          url: `https://example.com/mock-${i + 1}`,
          snippet: `This is deterministic mock snippet ${i + 1} for query: ${query}.`,
          sourceDomain: "example.com",
          fetchedAt: new Date(0).toISOString(),
        }),
      );
      return { ok: true, results };
    },
  };
}
