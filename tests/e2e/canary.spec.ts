// ============================================================================
// tests/e2e/canary.spec.ts — Round-3 pre-real-sample canaries, page level.
//
// Each canary crosses the FULL real boundary: POST /api/diagnoses → runtime
// state machine → competitor resolution → evidence → claims →
// CLAIM_EVIDENCE_VERIFICATION → publish guard → storage → GET → /report/[token]
// Quick/Deep/Evidence page. Mock providers only (webServer PROVIDER_MODE=MOCK);
// canary scenarios are selected by controlled server config (CANARY_MODE + a
// reserved host / competitor input), never by ordinary public input.
// ============================================================================
import { test, expect, type APIRequestContext } from "@playwright/test";
import { BANNED_TERMS } from "../fixtures/banned-terms";

const MOBILE_390 = { width: 390, height: 844 };
const VERIFIER_INTERNALS = [
  "justification",
  "verifierVersion",
  "MOCK_DETERMINISTIC",
  "claim-evidence.deterministic",
  "trustGuardVersion",
  "promptVersion",
];

async function create(request: APIRequestContext, input: Record<string, unknown>): Promise<string> {
  const res = await request.post("/api/diagnoses", { data: input });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { publicToken?: string; status?: string };
  expect(body.status).toBe("READY");
  expect(body.publicToken).toBeTruthy();
  return `/report/${body.publicToken}`;
}

async function assertNoLeakOrBannedCopy(bodyText: string) {
  const banned = BANNED_TERMS.filter(({ term }) => bodyText.includes(term)).map((b) => b.term);
  expect(banned, `banned copy in DOM: ${banned.join(", ")}`).toEqual([]);
  for (const s of VERIFIER_INTERNALS) {
    expect(bodyText.includes(s), `verifier internal leaked to DOM: ${s}`).toBe(false);
  }
}

test.describe("Round-3 canaries (page, 390px, MOCK)", () => {
  test.use({ viewport: MOBILE_390 });

  test("Canary A — positive report renders Quick modules, CTA and geo index", async ({ page, request }) => {
    const path = await create(request, {
      website: "https://canary-a-demo.example.com",
      brandName: "金丝雀甲",
      industry: "工业自动化设备",
    });
    await page.goto(path);
    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByTestId(`quick-module-${i}`)).toBeVisible();
    }
    await expect(page.getByTestId("geo-index")).toContainText("GEO可见度基础指数");
    await expect(page.getByTestId("primary-cta")).toContainText("预约报告解读");
    await assertNoLeakOrBannedCopy(await page.locator("body").innerText());
  });

  test("Canary B — About-only: no fabricated 采购验收 core issue, report still renders", async ({ page, request }) => {
    const path = await create(request, {
      website: "https://about-only.canary.test",
      brandName: "金丝雀乙",
    });
    await page.goto(path);
    await expect(page.getByTestId("quick-module-1")).toBeVisible();
    const body = await page.locator("body").innerText();
    // The unbounded negative claim must NOT appear as a customer-facing fact.
    expect(body).not.toContain("缺少面向采购决策的验收说明");
    await assertNoLeakOrBannedCopy(body);
  });

  test("Canary C — ambiguous competitor: restrained competitor module, no deterministic gap", async ({ page, request }) => {
    const path = await create(request, {
      website: "https://canary-c-demo.example.com",
      brandName: "金丝雀丙",
      competitors: ["星辰科技"],
    });
    await page.goto(path);
    const module3 = page.getByTestId("quick-module-3");
    await expect(module3).toBeVisible();
    await expect(module3).toContainText("证据不足");
    await assertNoLeakOrBannedCopy(await page.locator("body").innerText());
  });
});
