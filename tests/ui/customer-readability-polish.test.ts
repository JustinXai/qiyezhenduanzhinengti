import { describe, expect, it } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnterpriseReport } from "../../components/report/enterprise-report";
import { buildLimitedCanonicalReport } from "../../src/diagnosis/limited-report/universal-limited-report";
import { toEnterpriseReportViewModel } from "../../src/report/presentation/report-presentation-service";
import type { EvidenceItem } from "../../src/contracts";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const evidence: EvidenceItem[] = [
  {
    id: "ev_1",
    title: "医疗美容服务和预约公开信息",
    sourceDomain: "example.com",
    sourceType: "OBSERVED_WEB_EVIDENCE",
    authorityLevel: "MEDIA",
    supportLevel: "CONTEXT_ONLY",
    acquisitionLevel: "SEARCH_SNIPPET",
    fetchedAt: "2026-07-22T00:00:00.000Z",
    snippet: "赣州 医疗美容 项目 预约 收费 地址 医生 团队 风险 注意事项",
    url: "https://example.com/yuexi",
  },
];

function renderCustomerReport() {
  const report = buildLimitedCanonicalReport({
    diagnosisId: "diag_customer_polish",
    publicToken: "tok_customer_polish",
    input: {
      brandName: "客户可读性测试企业",
      website: "",
      industry: "医疗美容服务",
      productOrService: "医疗美容服务",
      targetRegion: "江西省赣州市",
      customerQuestions: [{ question: "如何预约和了解收费说明？" }],
    },
    evidence,
    searchCompleted: true,
    generatedAt: "2026-07-22T00:00:00.000Z",
  });
  return renderToStaticMarkup(createElement(EnterpriseReport, { vm: toEnterpriseReportViewModel(report) }));
}

describe("customer readability polish report", () => {
  it("renders normalized dimension scores and customer-facing priority labels", () => {
    const html = renderCustomerReport();
    expect(html).toContain("GEO公开信息基础指数");
    expect(html).toContain("基础信源");
    expect(html).toMatch(/基础信源[\s\S]*\d+分/);
    expect(html).toContain("优先处理");
    expect(html).toContain("重点完善");
    expect(html).toContain("持续建设");
    expect(html).not.toContain(">P0<");
    expect(html).not.toContain(">P1<");
    expect(html).not.toContain(">P2<");
  });

  it("keeps cooperation and delivery copy concise", () => {
    const html = renderCustomerReport();
    expect(html).toContain("企业需要配合什么");
    expect(html).toContain("无需一次性准备全部内容");
    expect(html).toContain("星媄数据可以帮助完成什么");
    expect(html).toContain("企业公开信息梳理");
    expect(html).toContain("客户问题内容体系");
    expect(html).toContain("重点页面和内容规划");
    expect(html).toContain("持续诊断与优化");
  });

  it("removes internal states, old brand and model copy from customer HTML", () => {
    const html = renderCustomerReport();
    for (const banned of [
      "LIMITED_PUBLIC_SCAN",
      "FULL_DIAGNOSIS",
      "Evidence Level",
      "Provider",
      "Stage Run",
      "executionMode",
      "publicReportEligible",
      "DeepSeek",
      "deepseek",
      "凡间AI",
      "快速版",
      "完整诊断",
      "查看完整诊断",
    ]) {
      expect(html).not.toContain(banned);
    }
  });
});
