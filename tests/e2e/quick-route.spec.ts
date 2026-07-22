import { test, expect, type APIRequestContext } from "@playwright/test";

async function createLimitedReport(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/diagnoses", {
    data: {
      brandName: "E2E公开信息扫描企业",
      industry: "医疗美容服务",
      productOrService: "医疗美容服务",
      customerQuestions: [{ question: "如何预约和了解收费说明？" }],
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { status: string; publicToken: string };
  expect(body.status).toBe("READY_LIMITED");
  return `/report/${body.publicToken}`;
}

test.describe("limited report route", () => {
  test("renders the single enriched report without analysis tabs or model copy", async ({ page, request }) => {
    await page.goto(await createLimitedReport(request));
    await expect(page.getByRole("heading", { name: "企业公开信息基础扫描" })).toBeVisible();
    await expect(page.getByText("公开信息准备度指数")).toBeVisible();
    await expect(page.getByText("公开来源覆盖矩阵")).toBeVisible();
    await expect(page.getByText("重点内容资产方案")).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("快速版");
    expect(text).not.toContain("完整诊断");
    expect(text).not.toContain("deepseek");
    expect(text).not.toContain("凡间AI");
  });
});
