import { describe, expect, it } from "vitest";
import {
  buildReputationReportSummary,
  reputationGuardViolations,
  type ReputationReportSummary,
} from "../../src/diagnosis/reputation/report-summary";
import type { ReputationAndPublicOpinionSnapshotV1, ReputationSignalV1 } from "../../src/contracts";

function signal(overrides: Partial<ReputationSignalV1> = {}): ReputationSignalV1 {
  return {
    signalId: "rep_ev_1",
    signalType: "NEUTRAL_MENTION",
    sentiment: "NEUTRAL",
    sourceCategory: "新闻媒体",
    sourceName: "example.com",
    title: "公开信息标题",
    snippet: "公开信息摘要",
    url: "https://example.com/a",
    entityMatch: "HIGH",
    resolutionStatus: "UNKNOWN",
    riskTheme: "常规公开评价",
    evidenceId: "ev_1",
    observedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<ReputationAndPublicOpinionSnapshotV1> = {}): ReputationAndPublicOpinionSnapshotV1 {
  const signals = overrides.reputationSignals ?? [signal()];
  return {
    diagnosisId: "diag_rep",
    companyName: "测试企业",
    knownBrandNames: ["测试企业"],
    region: "成都",
    searchedQueries: Array.from({ length: 8 }, (_, index) => `query_${index + 1}`),
    sourceCoverage: [],
    reputationSignals: signals,
    complaintSignals: signals.filter((item) => item.sentiment === "NEGATIVE" || item.sentiment === "MIXED"),
    positiveSignals: signals.filter((item) => item.sentiment === "POSITIVE"),
    neutralSignals: signals.filter((item) => item.sentiment === "NEUTRAL"),
    riskThemes: signals.filter((item) => item.sentiment === "NEGATIVE" || item.sentiment === "MIXED").map((item) => item.riskTheme),
    responseSignals: signals.filter((item) => item.signalType === "COMPANY_RESPONSE" || item.resolutionStatus === "RESPONDED" || item.resolutionStatus === "RESOLVED"),
    overallReputationScore: 82,
    riskLevel: "LOW",
    summary: "legacy summary",
    evidenceIds: signals.map((item) => item.evidenceId),
    generatedAt: "2026-07-22T00:00:00.000Z",
    version: "reputation-public-opinion-snapshot.v1",
    ...overrides,
  };
}

describe("reputation report summary", () => {
  it("case 1: LOW risk with complaint and response still surfaces evidence and risk", () => {
    const negative = signal({
      signalId: "rep_ev_neg",
      evidenceId: "ev_neg",
      signalType: "COMPLAINT",
      sentiment: "NEGATIVE",
      sourceCategory: "黑猫投诉",
      title: "测试企业公开投诉",
      snippet: "用户反映退费与合同争议，本次暂未核实争议事实的最终处理结果。",
      riskTheme: "退费争议",
      url: "https://tousu.sina.com.cn/complaint/example",
    });
    const response = signal({
      signalId: "rep_ev_response",
      evidenceId: "ev_response",
      signalType: "COMPANY_RESPONSE",
      sourceCategory: "企业自身回应",
      sourceName: "official.example.com",
      title: "测试企业公开回应",
      snippet: "公开信息中出现企业回应或处理说明。",
      resolutionStatus: "RESPONDED",
      url: "https://official.example.com/response",
    });
    const neutral = signal({ signalId: "rep_ev_news", evidenceId: "ev_news", sourceCategory: "新闻媒体", signalType: "MEDIA_REPORT" });
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [negative, response, neutral, signal({ evidenceId: "ev_4" }), signal({ evidenceId: "ev_5" }), signal({ evidenceId: "ev_6" }), signal({ evidenceId: "ev_7" })],
      complaintSignals: [negative],
      responseSignals: [response],
      neutralSignals: [response, neutral],
      evidenceIds: ["ev_neg", "ev_response", "ev_news", "ev_4", "ev_5", "ev_6", "ev_7"],
      riskLevel: "LOW",
    }));
    expect(summary.searchedQueryCount).toBe(8);
    expect(summary.matchedEvidenceCount).toBe(7);
    expect(summary.negativeSignalCount).toBe(1);
    expect(summary.companyResponseCount).toBeGreaterThan(0);
    expect(summary.reputationDeduction).toBe(4);
    expect(summary.issueThemes[0]?.theme).toBe("退费争议");
    expect(summary.deductionExplanation).toContain("扣除 4 分");
    expect(summary.summary).toContain("负面舆情线索");
    expect(summary.summary).toContain("风险等级为低");
    expect(summary.summary).not.toContain("未发现舆情");
    expect(summary.summary).not.toContain("未发现负面");
    expect(summary.representativeEvidence.map((item) => item.evidenceType)).toContain("投诉或争议信号");
    expect(summary.representativeEvidence.map((item) => item.evidenceType)).toContain("企业回应或处理线索");
    expect(summary.guardViolations).toEqual([]);
  });

  it("classifies official enterprise risk hints as one bounded issue theme", () => {
    const risk = signal({
      signalId: "rep_ev_qixin",
      evidenceId: "ev_qixin",
      signalType: "NEGATIVE_REVIEW",
      sentiment: "NEGATIVE",
      sourceCategory: "官方公开渠道",
      sourceName: "qixin.com",
      title: "测试企业_投资融资 - 启信宝",
      snippet: "自身风险 3条 司法案件 启信分 608分，相关事实需进一步核验。",
      riskTheme: "司法与企业风险提示",
      url: "https://www.qixin.com/company/example",
    });
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [risk, signal({ evidenceId: "ev_registry", sourceCategory: "官方公开渠道" })],
      complaintSignals: [risk],
      responseSignals: [],
      riskThemes: ["司法与企业风险提示"],
      evidenceIds: ["ev_qixin", "ev_registry"],
      overallReputationScore: 78,
      riskLevel: "LOW",
    }));

    expect(summary.negativeSignalCount).toBe(1);
    expect(summary.companyResponseCount).toBe(0);
    expect(summary.reputationDeduction).toBe(4);
    expect(summary.issueThemes).toEqual([
      expect.objectContaining({ theme: "司法与企业风险提示", count: 1 }),
    ]);
    expect(summary.summary).toContain("需进一步核实具体事实");
    expect(summary.representativeEvidence[0]?.summary).toContain("企业风险提示");
    expect(summary.guardViolations).toEqual([]);
  });

  it("case 2: neutral or positive evidence does not claim there is no reputation data", () => {
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [
        signal({ evidenceId: "ev_neutral", sentiment: "NEUTRAL", signalType: "MEDIA_REPORT" }),
        signal({ evidenceId: "ev_positive", sentiment: "POSITIVE", signalType: "POSITIVE_REVIEW", sourceCategory: "社交平台" }),
      ],
      evidenceIds: ["ev_neutral", "ev_positive"],
      positiveSignals: [signal({ evidenceId: "ev_positive", sentiment: "POSITIVE", signalType: "POSITIVE_REVIEW" })],
    }));
    expect(summary.summary).toContain("暂未发现明确负面风险信号");
    expect(summary.summary).toContain("不等于网络上没有舆情");
    expect(summary.summary).not.toContain("没有相关舆情");
  });

  it("case 3: no matched evidence stays bounded without excellent-reputation claims", () => {
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [],
      complaintSignals: [],
      positiveSignals: [],
      neutralSignals: [],
      responseSignals: [],
      evidenceIds: [],
      riskLevel: "UNKNOWN",
      overallReputationScore: null,
    }));
    expect(summary.matchedEvidenceCount).toBe(0);
    expect(summary.summary).toContain("暂未匹配到与企业或品牌相关的舆情证据");
    expect(summary.summary).toContain("不等于现实中不存在舆情");
    expect(summary.summary).not.toContain("口碑优秀");
  });

  it("case 4: response signals do not erase original disputes", () => {
    const negative = signal({ evidenceId: "ev_neg", signalType: "COMPLAINT", sentiment: "NEGATIVE", sourceCategory: "黑猫投诉", riskTheme: "合同争议" });
    const response = signal({ evidenceId: "ev_resp", signalType: "COMPANY_RESPONSE", sourceCategory: "企业自身回应", resolutionStatus: "RESPONDED" });
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [negative, response],
      complaintSignals: [negative],
      responseSignals: [response],
      evidenceIds: ["ev_neg", "ev_resp"],
      riskThemes: ["合同争议"],
      riskLevel: "LOW",
    }));
    const rendered = [summary.summary, ...summary.riskReasons, ...summary.representativeEvidence.map((item) => item.summary)].join("\n");
    expect(rendered).toContain("投诉、争议");
    expect(rendered).toContain("企业回应");
    expect(summary.representativeEvidence).toHaveLength(2);
  });

  it("case 5: representative evidence has safe fallbacks", () => {
    const summary = buildReputationReportSummary(snapshot({
      reputationSignals: [signal({ title: "", snippet: "", observedAt: "", sourceName: "", url: "https://example.com/fallback" })],
      evidenceIds: ["ev_1"],
    }));
    expect(summary.representativeEvidence[0]).toMatchObject({
      title: "未命名公开证据",
      source: "新闻媒体",
      date: null,
      summary: "该条公开证据提供了与企业或品牌相关的背景信息。",
      url: "https://example.com/fallback",
    });
  });

  it("guards forbid zero-evidence wording when evidence exists", () => {
    const summary: ReputationReportSummary = {
      ...buildReputationReportSummary(snapshot()),
      summary: "未发现舆情，也没有投诉。",
      matchedEvidenceCount: 1,
      negativeSignalCount: 1,
    };
    expect(reputationGuardViolations(summary)).toContain("MATCHED_EVIDENCE_BANNED:未发现舆情");
    expect(reputationGuardViolations(summary)).toContain("NEGATIVE_SIGNAL_BANNED:没有投诉");
  });
});
