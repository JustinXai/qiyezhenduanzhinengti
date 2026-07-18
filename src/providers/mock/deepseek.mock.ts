import type { StructuredCompletionProvider } from "../types";

// Deterministic mock so `pnpm smoke:mock` never touches the real DeepSeek API.
export function createMockDeepSeekProvider(): StructuredCompletionProvider {
  return {
    async completeJson({ stage }) {
      return {
        ok: true,
        json: {
          stage,
          mock: true,
          note: "Replace with real fixture per stage in Agent D's tests/providers fixtures.",
        },
      };
    },
  };
}
