import { describe, expect, it } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnterpriseReport } from "../../components/report/enterprise-report";
import { buildLimitedCanonicalReport } from "../../src/diagnosis/limited-report/universal-limited-report";
import { toEnterpriseReportViewModel } from "../../src/report/presentation/report-presentation-service";
import type { EvidenceItem, ReputationAndPublicOpinionSnapshotV1 } from "../../src/contracts";
import { buildSampleReport } from "../../src/fixtures/sample-report";

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

function renderCustomerReportWithReputation(snapshot: ReputationAndPublicOpinionSnapshotV1) {
  const verifiedEvidence = evidence.map((item) => ({
    ...item,
    sourceType: "FIRST_PARTY_EVIDENCE" as const,
    acquisitionLevel: "CRAWLED_PAGE" as const,
  }));
  const report = buildLimitedCanonicalReport({
    diagnosisId: "diag_customer_rep",
    publicToken: "tok_customer_rep",
    input: {
      brandName: "舆情展示测试企业",
      website: "",
      industry: "教育培训",
      productOrService: "考研培训",
      targetRegion: "四川省成都市",
      customerQuestions: [{ question: "退费和课程服务如何保障？" }],
    },
    evidence: verifiedEvidence,
    searchCompleted: true,
    generatedAt: "2026-07-22T00:00:00.000Z",
  });
  report.limitedReport!.mvpReport!.reputation = snapshot;
  return renderToStaticMarkup(createElement(EnterpriseReport, { vm: toEnterpriseReportViewModel(report) }));
}

function reputationSnapshot(): ReputationAndPublicOpinionSnapshotV1 {
  return {
    diagnosisId: "diag_customer_rep",
    companyName: "舆情展示测试企业",
    knownBrandNames: ["舆情展示测试企业"],
    region: "成都",
    searchedQueries: Array.from({ length: 8 }, (_, index) => `query_${index + 1}`),
    sourceCoverage: ["黑猫投诉", "新闻媒体", "企业自身回应"],
    reputationSignals: [
      {
        signalId: "rep_negative",
        signalType: "COMPLAINT",
        sentiment: "NEGATIVE",
        sourceCategory: "黑猫投诉",
        sourceName: "tousu.sina.com.cn",
        title: "舆情展示测试企业一个非常非常非常非常非常非常非常非常非常非常长的公开投诉标题",
        snippet: "用户反映舆情展示测试企业退费争议，相关内容属于投诉者陈述，本次暂未核实争议事实的最终处理结果。",
        url: "https://tousu.sina.com.cn/complaint/example",
        entityMatch: "HIGH",
        resolutionStatus: "UNRESOLVED",
        riskTheme: "退费争议",
        evidenceId: "ev_negative",
        observedAt: "2026-07-20T00:00:00.000Z",
      },
      {
        signalId: "rep_response",
        signalType: "COMPANY_RESPONSE",
        sentiment: "NEUTRAL",
        sourceCategory: "企业自身回应",
        sourceName: "official.example.com",
        title: "企业公开回应说明",
        snippet: "公开信息中出现企业回应或处理说明。",
        url: "https://official.example.com/response",
        entityMatch: "HIGH",
        resolutionStatus: "RESPONDED",
        riskTheme: "常规公开评价",
        evidenceId: "ev_response",
        observedAt: "2026-07-21T00:00:00.000Z",
      },
      {
        signalId: "rep_news",
        signalType: "MEDIA_REPORT",
        sentiment: "NEUTRAL",
        sourceCategory: "新闻媒体",
        sourceName: "news.example.com",
        title: "媒体公开报道",
        snippet: "媒体公开报道中出现企业相关背景信息。",
        url: "https://news.example.com/article",
        entityMatch: "HIGH",
        resolutionStatus: "UNKNOWN",
        riskTheme: "常规公开评价",
        evidenceId: "ev_news",
        observedAt: "2026-07-19T00:00:00.000Z",
      },
    ],
    complaintSignals: [],
    positiveSignals: [],
    neutralSignals: [],
    responseSignals: [],
    riskThemes: ["退费争议"],
    overallReputationScore: 62,
    reputationHealthScore: 62,
    reputationNeutralBase: 65,
    positiveReputationBonus: 0,
    preNegativeReputationScore: 65,
    evidenceConfidence: "HIGH",
    searchCoverageConfidence: "HIGH",
    entityRelationConfidence: "HIGH",
    factualSpecificityConfidence: "MEDIUM",
    customerVisibilityConfidence: "HIGH",
    riskLevel: "MEDIUM",
    summary: "legacy",
    evidenceIds: ["ev_negative", "ev_response", "ev_news", "ev_4", "ev_5", "ev_6", "ev_7"],
    generatedAt: "2026-07-22T00:00:00.000Z",
    version: "reputation-public-opinion-snapshot.v1",
  };
}

describe("customer readability polish report", () => {
  it("turns insufficient-evidence scans into a GEO service start page, not a report", () => {
    const html = renderCustomerReport();
    expect(html).toContain("企业GEO建设启动建议");
    expect(html).toContain("风险警示");
    expect(html).toContain("资料缺失型");
    expect(html).toContain("公开信息成交阻力指数");
    expect(html).toContain("高阻力");
    expect(html).toContain("85/100");
    expect(html).toContain("这不是企业经营评分");
    expect(html).toContain("数字越高");
    expect(html).toContain("暂不生成诊断报告");
    expect(html).toContain("需要先补齐可被客户和AI引用的公开资料基础");
    expect(html).toContain("数字化和网络化基础还没有形成");
    expect(html).toContain("这属于哪一种GEO成交风险");
    expect(html).toContain("信任阻力待核实型");
    expect(html).toContain("可见度不足型");
    expect(html).toContain("GEO成交准备度缺口");
    expect(html).toContain("AI可见度曝光");
    expect(html).toContain("舆情与信任阻力");
    expect(html).toContain("客户决策阻力");
    expect(html).toContain("咨询转化路径");
    expect(html).toContain("text-rose-800");
    expect(html).toContain("text-rose-950");
    expect(html).toContain("首期应搭配服务");
    expect(html).toContain("报告要回答客户为什么现在需要买GEO服务");
    expect(html).toContain("首期GEO服务应该先做什么");
    expect(html).toContain("30/60/90天GEO建设计划");
    expect(html).toContain("0-30天");
    expect(html).toContain("31-60天");
    expect(html).toContain("61-90天");
    expect(html).toContain("预约GEO建设沟通");
    expect(html).not.toContain("综合诊断指数");
    expect(html).not.toContain("评分结构");
    expect(html).not.toContain("证据附件");
    expect(html).not.toContain("★★★★★");
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

  it("renders reputation evidence counts, MEDIUM explanation and representative evidence", () => {
    const html = renderCustomerReportWithReputation({
      ...reputationSnapshot(),
      complaintSignals: [reputationSnapshot().reputationSignals[0]!],
      neutralSignals: [reputationSnapshot().reputationSignals[1]!, reputationSnapshot().reputationSignals[2]!],
      responseSignals: [reputationSnapshot().reputationSignals[1]!],
    });
    expect(html).toContain("查看舆情依据（7 条）");
    expect(html).toContain("<details class=");
    expect(html).not.toContain("<details open");
    expect(html).toContain("风险等级 中");
    expect(html).toContain("客户可见负面舆情");
    expect(html).toContain("风险等级为中");
    expect(html).toContain("主要舆情情况");
    expect(html).toContain("退费争议");
    expect(html).toContain("中性基础：65分");
    expect(html).toContain("高决策影响：-5分");
    expect(html).toContain("事实具体性 MEDIUM");
    expect(html).toContain("企业回应");
    expect(html).toContain("查看原文链接");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("未发现舆情");
    expect(html).not.toContain("未发现负面");
    expect(html).not.toContain("没有投诉");
  });

  it("renders education reports without medical or manufacturing wording", () => {
    const report = buildLimitedCanonicalReport({
      diagnosisId: "diag_customer_edu",
      publicToken: "tok_customer_edu",
      input: {
        brandName: "成都万学海文教育科技有限公司",
        website: "",
        industry: "教育培训",
        productOrService: "考研培训课程",
        targetRegion: "四川省成都市",
      },
      evidence,
      searchCompleted: true,
      generatedAt: "2026-07-22T00:00:00.000Z",
    });
    const html = renderToStaticMarkup(createElement(EnterpriseReport, { vm: toEnterpriseReportViewModel(report) }));
    expect(html).toContain("课程与服务体系");
    expect(html).toContain("师资与教学服务");
    expect(html).toContain("收费、报名和退费 FAQ");
    expect(html).toContain("课程和班型清单");
    for (const banned of ["面诊", "治疗效果", "随访", "禁忌", "品质工艺", "规格选购", "购买和合作入口", "产品体系"]) {
      expect(html).not.toContain(banned);
    }
  });

  it("keeps GEO sales-readiness blocks in formal enterprise reports", () => {
    const html = renderToStaticMarkup(
      createElement(EnterpriseReport, { vm: toEnterpriseReportViewModel(buildSampleReport()) }),
    );
    expect(html).toContain("GEO成交准备度");
    expect(html).toContain("AI可见度曝光");
    expect(html).toContain("舆情与信任阻力");
    expect(html).toContain("客户决策阻力");
    expect(html).toContain("竞争与转化路径");
    expect(html).toContain("首期应搭配服务");
    expect(html).toContain("报告要回答客户为什么现在需要买GEO服务");
  });
});
