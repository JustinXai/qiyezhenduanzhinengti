// Baseline placeholder. Agent G (qa-ci) replaces this with the full mock
// vertical-slice smoke run described in docs/DELIVERY_BOARD.md.
// Must never call real Bocha/DeepSeek endpoints.
import { createMockBochaProvider } from "../src/providers/mock/bocha.mock";
import { createMockDeepSeekProvider } from "../src/providers/mock/deepseek.mock";

async function main() {
  const bocha = createMockBochaProvider();
  const deepseek = createMockDeepSeekProvider();

  const search = await bocha.search("baseline smoke query", { limit: 3 });
  if (!search.ok) throw new Error("mock bocha search failed");

  const completion = await deepseek.completeJson({
    stage: "smoke",
    systemPrompt: "smoke",
    userPrompt: "smoke",
    maxTokens: 256,
  });
  if (!completion.ok) throw new Error("mock deepseek completion failed");

  console.log("[smoke:mock] baseline OK —", search.results.length, "mock results");
}

main().catch((err) => {
  console.error("[smoke:mock] FAILED", err);
  process.exit(1);
});
