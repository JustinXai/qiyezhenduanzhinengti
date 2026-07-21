// ============================================================================
// tests/e2e/report.spec.ts — Agent G (qa-ci), Playwright.
//
// TRUE end-to-end assertions for the Quick report page. Agent F's page is now
// wired to Agent E's API, so each test drives the real flow:
//   POST /api/diagnoses (mock providers) → READY → publicToken
//   → GET /report/<publicToken> renders the canonical report via Agent F.
//
// No real Bocha/DeepSeek is called (mock provider seams). The dev server is
// started by playwright.config.ts `webServer`.
// ============================================================================
import { test, expect, type APIRequestContext } from "@playwright/test";
import { BANNED_TERMS } from "../fixtures/banned-terms";

// Round-5.1: modules are keyed + dynamic (empty modules are omitted, numbering
// stays contiguous). The rich e2e mock scenario renders all eight.
const QUICK_MODULE_TESTIDS = ["summary", "ai", "competitor", "issues", "fix", "geo", "roadmap", "cta"].map(
  (k) => `quick-module-${k}`,
);

/** Create a diagnosis through the real API and return its public report path. */
async function createReportPath(request: APIRequestContext): Promise<string> {
  const override = process.env.E2E_REPORT_PATH;
  if (override) return override;

  const res = await request.post("/api/diagnoses", {
    data: {
      website: "https://e2e-demo-company.com",
      brandName: "E2E演示企业",
      industry: "工业自动化设备",
      competitors: ["竞品甲自动化"],
    },
  });
  expect(res.status(), "POST /api/diagnoses should return 201").toBe(201);
  const body = (await res.json()) as { publicToken?: string; status?: string };
  expect(body.status, "diagnosis should reach READY synchronously").toBe("READY");
  expect(body.publicToken, "a public token should be issued").toBeTruthy();
  return `/report/${body.publicToken}`;
}

test.describe("Quick report page (end-to-end)", () => {
  test("renders all Quick modules of the rich scenario", async ({ page, request }) => {
    await page.goto(await createReportPath(request));
    for (const testid of QUICK_MODULE_TESTIDS) {
      await expect(page.getByTestId(testid), `${testid} should be visible`).toBeVisible();
    }
  });

  test("shows the canonical综合分 label GEO可见度基础指数 (not a banned alias)", async ({ page, request }) => {
    await page.goto(await createReportPath(request));
    await expect(page.getByTestId("geo-index")).toContainText("GEO可见度基础指数");
  });

  test("primary + secondary CTA are visible with the frozen copy", async ({ page, request }) => {
    await page.goto(await createReportPath(request));
    await expect(page.getByTestId("primary-cta")).toBeVisible();
    await expect(page.getByTestId("primary-cta")).toContainText("预约报告解读");
    await expect(page.getByTestId("secondary-cta")).toBeVisible();
    await expect(page.getByTestId("secondary-cta")).toContainText("获取企业GEO优化方案");
  });

  test("primary CTA appears within ~1.5 mobile screens (visible early)", async ({ page, request }) => {
    await page.goto(await createReportPath(request));
    const cta = page.getByTestId("primary-cta");
    const box = await cta.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "primary CTA must have a layout box").not.toBeNull();
    if (box && viewport) {
      // REPORT_CONTRACT §1: CTA must be seen within ~1.5 phone screens.
      expect(box.y).toBeLessThan(viewport.height * 1.5);
    }
  });

  test("rendered DOM contains no forbidden copy", async ({ page, request }) => {
    await page.goto(await createReportPath(request));
    const bodyText = (await page.locator("body").innerText()) ?? "";
    const hits = BANNED_TERMS.filter(({ term }) => bodyText.includes(term)).map((b) => b.term);
    expect(hits, `banned copy leaked into DOM: ${hits.join(", ")}`).toEqual([]);
  });
});
