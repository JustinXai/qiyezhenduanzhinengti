// ============================================================================
// tests/e2e/report.spec.ts — Agent G (qa-ci), Playwright.
//
// End-to-end assertions for the Quick report page. Agent F's report page is NOT
// wired into cursor/rebuild-qa-ci yet, so every browser test here is
// INTEGRATION-GATED: skipped unless RUN_INTEGRATION_E2E=1. This keeps
// `pnpm test:e2e` green (0 failures) on this branch while documenting the exact
// integration seam Agent F must satisfy for these to flip on.
//
// INTEGRATION SEAM CONTRACT (what Agent F must expose for these to pass):
//   route:   GET <E2E_REPORT_PATH>  (default /report/<publicToken>) renders Quick view
//   testids: data-testid="quick-module-1" … "quick-module-8"  (the 8 fixed modules)
//            data-testid="primary-cta"    -> 预约报告解读
//            data-testid="secondary-cta"  -> 获取企业GEO优化方案
//            data-testid="geo-index"      -> GEO可见度基础指数 value/label
//   In DIAGNOSIS_SMOKE_MODE the page must serve the canonical SAMPLE report so
//   these content assertions are deterministic.
// ============================================================================
import { test, expect } from "@playwright/test";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import { BANNED_TERMS } from "../fixtures/banned-terms";

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_E2E === "1";
const REPORT_PATH =
  process.env.E2E_REPORT_PATH ?? `/report/${SAMPLE_DIAGNOSIS_REPORT.publicToken}`;

const SKIP_REASON =
  "INTEGRATION-GATED: Agent F report page not wired into cursor/rebuild-qa-ci yet. " +
  "Set RUN_INTEGRATION_E2E=1 (and E2E_REPORT_PATH if the route differs) after integration.";

const QUICK_MODULE_TESTIDS = Array.from({ length: 8 }, (_, i) => `quick-module-${i + 1}`);

test.describe("Quick report page [INTEGRATION-GATED]", () => {
  test.beforeEach(() => {
    // Runtime conditional skip — leaves tests visible in `--list` as the
    // documented integration contract, but never fails while the page is absent.
    test.skip(!INTEGRATION_ENABLED, SKIP_REASON);
  });

  test("renders all 8 fixed Quick modules", async ({ page }) => {
    await page.goto(REPORT_PATH);
    for (const testid of QUICK_MODULE_TESTIDS) {
      await expect(page.getByTestId(testid), `${testid} should be visible`).toBeVisible();
    }
  });

  test("shows the canonical综合分 label GEO可见度基础指数 (not a banned alias)", async ({ page }) => {
    await page.goto(REPORT_PATH);
    await expect(page.getByTestId("geo-index")).toContainText("GEO可见度基础指数");
  });

  test("primary + secondary CTA are visible with the frozen copy", async ({ page }) => {
    await page.goto(REPORT_PATH);
    await expect(page.getByTestId("primary-cta")).toBeVisible();
    await expect(page.getByTestId("primary-cta")).toContainText("预约报告解读");
    await expect(page.getByTestId("secondary-cta")).toBeVisible();
    await expect(page.getByTestId("secondary-cta")).toContainText("获取企业GEO优化方案");
  });

  test("primary CTA appears within ~1.5 mobile screens (visible early)", async ({ page }) => {
    await page.goto(REPORT_PATH);
    const cta = page.getByTestId("primary-cta");
    const box = await cta.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "primary CTA must have a layout box").not.toBeNull();
    if (box && viewport) {
      // REPORT_CONTRACT §1: CTA must be seen within ~1.5 phone screens.
      expect(box.y).toBeLessThan(viewport.height * 1.5);
    }
  });

  test("rendered DOM contains no forbidden copy", async ({ page }) => {
    await page.goto(REPORT_PATH);
    const bodyText = (await page.locator("body").innerText()) ?? "";
    const hits = BANNED_TERMS.filter(({ term }) => bodyText.includes(term)).map((b) => b.term);
    expect(hits, `banned copy leaked into DOM: ${hits.join(", ")}`).toEqual([]);
  });
});
