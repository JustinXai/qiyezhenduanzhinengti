import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The form imports `useRouter` from `next/navigation`; renderToStaticMarkup
// runs outside the Next.js app-router tree, so we stub the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

// See tests/ui/report-render.test.ts for the React shim rationale.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const { DiagnoseForm } = await import("../../components/diagnose-form");

function renderForm(): string {
  return renderToStaticMarkup(createElement(DiagnoseForm));
}

/** Extract the single element opening tag that owns the given data-testid. */
function elementFor(html: string, testId: string): string | null {
  const marker = `data-testid="${testId}"`;
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  // Find the preceding `<` for this element.
  const start = html.lastIndexOf("<", idx);
  // Find the next `>` that closes the opening tag (the textarea / input have
  // self-closing `/>` in the rendered output, but use plain `>` for safety).
  const end = html.indexOf(">", idx);
  if (start < 0 || end < 0) return null;
  return html.slice(start, end + 1);
}

describe("DiagnoseForm rendering (Round-8 FINAL MVP)", () => {
  const html = renderForm();

  it("keeps only the enterprise name as required and makes other inputs optional", () => {
    expect(html).toContain("企业/品牌名称");
    expect(html).toContain("企业官网");
    expect(html).toContain("所属行业");
    expect(html).toContain("主要产品或服务");
    expect(html).toContain("所在地区");
    expect(html).toContain("客户最常问的问题");
    expect(html).toContain("只填写企业名称即可开始诊断。补充官网、行业和客户问题，可以让报告更加准确。");
    // Capability labels and 1-to-3-minute waiting copy live on the page above
    // the form; the form itself renders the disclaimer line right under the CTA.
    expect(html).toContain("通常需要 1 至 3 分钟");
  });

  it("renders visible simple fields before the collapsed optional advanced area", () => {
    const expectedOrder = [
      "input-brand-name", // 1. 企业/品牌名称 (required)
      "input-website", // 2. 企业官网 (optional)
      "input-industry", // 3. 所属行业 (optional)
      "input-product", // 4. 主要产品或服务 (optional)
      "input-region", // 5. 所在地区 (optional)
      "input-customer-questions", // 6. 客户最常问的问题 (required, textarea)
      "input-competitors", // 7. 主要竞品 (optional, after questions)
      "input-contact-name", // 8. 联系人和手机号 (optional, not in payload)
      "input-contact-phone",
    ];
    let lastIdx = -1;
    for (const id of expectedOrder) {
      const idx = html.indexOf(`data-testid="${id}"`);
      expect(idx, `missing ${id}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("places customerQuestions BEFORE competitors (competitors is not a gate)", () => {
    const qIdx = html.indexOf("input-customer-questions");
    const cIdx = html.indexOf("input-competitors");
    expect(qIdx).toBeGreaterThan(-1);
    expect(cIdx).toBeGreaterThan(qIdx);
  });

  it("uses a textarea for customerQuestions, not an input", () => {
    const tag = elementFor(html, "input-customer-questions") ?? "";
    expect(tag.startsWith("<textarea")).toBe(true);
    expect(html).toContain(
      "选填。客户在选择、报名、采购或合作前最常问什么？每行一个。",
    );
  });

  it("marks only brand as required on the input element", () => {
    expect(elementFor(html, "input-brand-name") ?? "").toMatch(/\brequired/);
    for (const id of ["input-website", "input-industry", "input-product", "input-region", "input-customer-questions"]) {
      expect(elementFor(html, id) ?? "", `${id} should not be required`).not.toMatch(/\brequired/);
    }
  });

  it("does NOT include the GEO可见度诊断报告 wording on the home page", () => {
    expect(html).not.toContain("GEO可见度诊断报告");
  });

  it("renders the primary submit button with the frozen label", () => {
    expect(html).toContain("生成企业诊断报告");
  });

  it("renders the 1-to-3-minute waiting copy", () => {
    expect(html).toContain("通常需要 1 至 3 分钟");
    expect(html).toContain("生成完成后会自动进入报告页");
    expect(html).toContain("不承诺排名或经营结果");
  });

  it("contact fields are not flagged as required (选填 only)", () => {
    for (const id of ["input-contact-name", "input-contact-phone"]) {
      const tag = elementFor(html, id) ?? "";
      expect(tag, `${id} should not be required`).not.toMatch(/\brequired/);
    }
  });

  it("has a 720px-max form card and a neutral background page (not floating blank)", () => {
    expect(html).toMatch(/max-w-\[720px\]/);
    expect(html).toMatch(/rounded-2xl/);
    expect(html).toMatch(/shadow-sm/);
    expect(html).toMatch(/bg-neutral-50/);
  });

  it("keeps advanced customer questions and competitors collapsed under optional title", () => {
    expect(html).toContain('data-testid="advanced-optional"');
    expect(html).toContain("补充更多信息，让报告更准确（选填）");
    expect(html).toContain("为空时系统会自动生成5个典型客户决策问题");
  });
});
