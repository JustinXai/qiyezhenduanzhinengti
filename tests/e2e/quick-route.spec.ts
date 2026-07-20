// ============================================================================
// tests/e2e/quick-route.spec.ts — Round-8 FINAL MVP focused E2E.
//
// Targets the running production preview (set PLAYWRIGHT_BASE_URL=http://localhost:3701
// or rely on webServer auto-start, which uses next dev — instead we point at the
// pre-launched production server via E2E_REPORT_PATH). It does NOT create new
// diagnoses or call providers; it asserts the canonical Quick presentation over
// the existing REAL_PROVIDER_CANONICAL report.
//
//   pnpm exec playwright test tests/e2e/quick-route.spec.ts --reporter=list
// ============================================================================
import { test, expect } from "@playwright/test";

// The Round-8 FINAL MVP preview already exposes the Lejinji REAL_PROVIDER_CANONICAL
// report. Override via env if pointing at a different preview.
const REPORT_PATH =
  process.env.E2E_REPORT_PATH ?? "/report/tok_1e28531d23774261af449977b88d9319";

test.describe("Quick route (production preview)", () => {
  test("report route returns 200 and renders the Quick view", async ({ page }) => {
    const response = await page.goto(REPORT_PATH);
    expect(response?.status(), "report route should be HTTP 200").toBe(200);
    await expect(page.getByTestId("primary-cta")).toBeVisible();
  });

  test("Quick view opens by default with the canonical GEO可见度基础指数 label", async ({ page }) => {
    await page.goto(REPORT_PATH);
    await expect(page.getByTestId("geo-index")).toContainText("GEO可见度基础指数");
    // quick-module-summary is module 1 (always present).
    await expect(page.getByTestId("quick-module-summary")).toBeVisible();
  });

  test("Deep tab is reachable and renders the deep report content", async ({ page }) => {
    await page.goto(REPORT_PATH);
    // The sticky nav has a tab labeled exactly "完整诊断". The Quick view also
    // has a button labeled "查看完整诊断" which opens the same Deep view, so we
    // match the tab label with exact:true.
    await page.getByRole("button", { name: "完整诊断", exact: true }).click();
    // Deep view shows all five dimensions; multiple matches may appear (the
    // breakdown + per-dimension notes), so use .first() to avoid strict mode.
    for (const label of ["企业清晰度", "官网完整度", "客户问题覆盖", "信任证据", "AI 可见度"]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("Evidence tab is expandable", async ({ page }) => {
    await page.goto(REPORT_PATH);
    await page.getByRole("button", { name: "证据", exact: true }).click();
    // The evidence list contains at least one 企业官方来源 badge.
    await expect(page.getByText("企业官方来源").first()).toBeVisible();
  });

  test("production preview has NO Next dev mode indicator", async ({ page }) => {
    await page.goto(REPORT_PATH);
    // next-dev-indicator renders a div with id __next-dev-indicator or a build
    // marker labeled "N". Neither should appear in `next start`.
    const devBadge = await page.locator("#__next-dev-indicator, [data-nextjs-toast]").count();
    expect(devBadge, "production build must not expose dev tools").toBe(0);
  });
});
