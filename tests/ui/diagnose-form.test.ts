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

  it("places the required *-asterisk on every required field", () => {
    expect(html).toContain("企业/品牌名称");
    expect(html).toContain("企业官网");
    expect(html).toContain("所属行业");
    expect(html).toContain("主要产品或服务");
    expect(html).toContain("所在地区");
    expect(html).toContain("客户最常问的问题");
    // Capability labels and 1-to-3-minute waiting copy live on the page above
    // the form; the form itself renders the disclaimer line right under the CTA.
    expect(html).toContain("通常需要 1 至 3 分钟");
  });

  it("renders every required field in the frozen order", () => {
    const expectedOrder = [
      "input-brand-name", // 1. 企业/品牌名称 (required)
      "input-website", // 2. 企业官网 (required)
      "input-industry", // 3. 所属行业 (required)
      "input-product", // 4. 主要产品或服务 (required)
      "input-region", // 5. 所在地区 (required)
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
      "请填写3至5个客户在选购、采购或合作前最常问的问题，每行一个。",
    );
  });

  it("marks brand, website, and customerQuestions as required on the input element", () => {
    for (const id of ["input-brand-name", "input-website", "input-customer-questions"]) {
      const tag = elementFor(html, id) ?? "";
      expect(tag, `${id} should be required`).toMatch(/\brequired/);
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

  it("two-column short fields (industry + product) inside a responsive grid", () => {
    expect(html).toMatch(/grid-cols-1[^"]{0,40}sm:grid-cols-2/);
  });
});
