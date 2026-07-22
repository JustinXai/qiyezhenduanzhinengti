import type {
  ReputationAndPublicOpinionSnapshotV1,
  ReputationSignalV1,
} from "../../contracts";
import { reputationPenaltyBreakdown } from "./snapshot";

export interface ReputationEvidenceSummary {
  title: string;
  source: string;
  date: string | null;
  evidenceType: string;
  summary: string;
  url: string;
  sentiment: ReputationSignalV1["sentiment"];
  signalType: ReputationSignalV1["signalType"];
  sourceCategory: string;
  resolutionStatus: ReputationSignalV1["resolutionStatus"];
}

export interface ReputationReportSummary {
  score: number | null;
  riskLevel: ReputationAndPublicOpinionSnapshotV1["riskLevel"];
  searchedQueryCount: number;
  matchedEvidenceCount: number;
  complaintCount: number;
  mediaCount: number;
  officialCount: number;
  companyResponseCount: number;
  negativeSignalCount: number;
  positiveSignalCount: number;
  neutralSignalCount: number;
  responseSignalCount: number;
  reputationDeduction: number;
  evidenceConfidence: "LOW" | "MEDIUM" | "HIGH";
  searchCoverageConfidence: "LOW" | "MEDIUM" | "HIGH";
  entityRelationConfidence: "LOW" | "MEDIUM" | "HIGH";
  factualSpecificityConfidence: "LOW" | "MEDIUM" | "HIGH";
  customerVisibilityConfidence: "LOW" | "MEDIUM" | "HIGH";
  reputationNeutralBase: number;
  positiveReputationBonus: number;
  preNegativeReputationScore: number;
  validCustomerVisibleNegativeCount: number;
  independentNegativeSourceCount: number;
  summary: string;
  deductionExplanation: string;
  riskReasons: string[];
  issueThemes: Array<{ theme: string; count: number; summary: string }>;
  representativeEvidence: ReputationEvidenceSummary[];
  categoryRows: Array<{ label: string; count: number }>;
  guardViolations: string[];
}

const NO_EVIDENCE_BANNED = ["未发现舆情", "没有相关舆情", "未发现公开信息", "没有任何投诉或争议"];
const NEGATIVE_BANNED = ["未发现负面", "口碑不存在风险", "没有投诉", "公开渠道全部正面"];

function sourceCategoryCount(signals: readonly ReputationSignalV1[], category: string): number {
  return signals.filter((signal) => signal.sourceCategory === category).length;
}

function dateOnly(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function evidenceTypeLabel(signal: ReputationSignalV1): string {
  if (signal.signalType === "COMPLAINT") return "投诉或争议信号";
  if (signal.signalType === "NEGATIVE_REVIEW") return "负面评价线索";
  if (signal.signalType === "COMPANY_RESPONSE") return "企业回应或处理线索";
  if (signal.signalType === "MEDIA_REPORT") return "媒体或公开报道";
  if (signal.signalType === "POSITIVE_REVIEW") return "正向评价线索";
  return "中性公开信息";
}

function safeSummary(signal: ReputationSignalV1): string {
  const text = signal.snippet.trim() || signal.title.trim();
  if (!text) return "该条公开证据提供了与企业或品牌相关的背景信息。";
  if (signal.signalType === "COMPLAINT" || signal.signalType === "NEGATIVE_REVIEW") {
    if (/司法|自身风险|被执行|处罚|案件/.test(`${signal.title} ${signal.snippet}`)) {
      return `公开信息中出现企业风险提示：${text}`;
    }
    return `有用户在公开平台反映：${text}`;
  }
  if (signal.signalType === "COMPANY_RESPONSE") {
    return `公开信息中出现企业回应或处理相关线索：${text}`;
  }
  return text;
}

function signalWeight(signal: ReputationSignalV1): number {
  let weight = 0;
  if (signal.sentiment === "NEGATIVE" || signal.sentiment === "MIXED") weight += 80;
  if (signal.signalType === "COMPANY_RESPONSE" || signal.resolutionStatus === "RESPONDED" || signal.resolutionStatus === "RESOLVED") weight += 60;
  if (signal.signalType === "MEDIA_REPORT") weight += 40;
  if (signal.sourceCategory === "官方公开渠道") weight += 25;
  if (signal.sentiment === "POSITIVE") weight += 20;
  return weight;
}

function representativeSignals(signals: readonly ReputationSignalV1[]): ReputationSignalV1[] {
  const selected: ReputationSignalV1[] = [];
  const pushFirst = (predicate: (signal: ReputationSignalV1) => boolean) => {
    const item = signals.find((signal) => predicate(signal) && !selected.some((x) => x.evidenceId === signal.evidenceId));
    if (item) selected.push(item);
  };
  pushFirst((signal) => signal.sentiment === "NEGATIVE" || signal.sentiment === "MIXED");
  pushFirst((signal) => signal.signalType === "COMPANY_RESPONSE" || signal.resolutionStatus === "RESPONDED" || signal.resolutionStatus === "RESOLVED");
  pushFirst((signal) => signal.signalType === "MEDIA_REPORT" || signal.sourceCategory === "新闻媒体");
  pushFirst((signal) => signal.sourceCategory === "官方公开渠道");
  return [
    ...selected,
    ...signals
      .filter((signal) => !selected.some((x) => x.evidenceId === signal.evidenceId))
      .sort((a, b) => signalWeight(b) - signalWeight(a) || b.observedAt.localeCompare(a.observedAt)),
  ].slice(0, Math.min(3, signals.length));
}

function summaryFor(input: {
  matchedEvidenceCount: number;
  negativeSignalCount: number;
  responseSignalCount: number;
  riskLevel: ReputationReportSummary["riskLevel"];
  issueThemes: readonly { theme: string; count: number }[];
  independentNegativeSourceCount: number;
  reputationDeduction: number;
  neutralBase: number;
}): string {
  if (input.matchedEvidenceCount === 0) {
    return "本次公开检索暂未匹配到与企业或品牌相关的舆情证据；这不等于现实中不存在舆情，建议后续持续复查。";
  }
  if (input.negativeSignalCount > 0) {
    const themes = input.issueThemes.map((item) => item.theme).slice(0, 3).join("、") || "公开争议";
    const sourceCopy = input.independentNegativeSourceCount >= 2 ? "多个公开来源重复呈现" : "单一公开来源呈现";
    const responseCopy = input.responseSignalCount > 0 ? "已有部分公开回应" : "暂未发现集中、清晰的企业公开回应";
    return `本项从中性口碑基准${input.neutralBase}分开始计算。本次公开检索发现客户可见负面舆情，主要涉及${themes}，${sourceCopy}。${responseCopy}，因此舆情健康分扣除${input.reputationDeduction}分，风险等级为${riskLevelLabel(input.riskLevel)}。`;
  }
  return `本次公开检索匹配到与企业或品牌相关的公开信息，暂未发现明确负面风险信号；这不等于网络上没有舆情，综合风险等级为${riskLevelLabel(input.riskLevel)}。`;
}

function riskReasons(input: {
  matchedEvidenceCount: number;
  negativeSignalCount: number;
  responseSignalCount: number;
  reputationDeduction: number;
  mediaCount: number;
  officialCount: number;
  riskThemes: readonly string[];
  riskLevel: ReputationReportSummary["riskLevel"];
}): string[] {
  if (input.matchedEvidenceCount === 0) {
    return ["未匹配到相关证据，风险等级只能按检索范围审慎判断。"];
  }
  const reasons: string[] = [`本次匹配到${input.matchedEvidenceCount}条相关公开证据。`];
  if (input.negativeSignalCount > 0) {
    reasons.push(`其中${input.negativeSignalCount}条属于投诉、争议或企业风险提示相关信号。`);
  } else {
    reasons.push("当前匹配证据未形成明确负面信号。");
  }
  if (input.riskThemes.length > 0) {
    reasons.push(`风险主题集中在${input.riskThemes.slice(0, 2).join("、")}。`);
  } else {
    reasons.push("风险主题未出现重复聚集。");
  }
  if (input.responseSignalCount > 0) {
    reasons.push(`发现${input.responseSignalCount}条企业回应或处理相关线索。`);
  }
  if (input.reputationDeduction > 0) {
    reasons.push(`舆情扣分为${input.reputationDeduction}分，按客户咨询、报名、购买和合作决策影响计算。`);
  }
  if (input.mediaCount > 0 || input.officialCount > 0) {
    reasons.push(`证据中包含${input.mediaCount}条新闻媒体线索和${input.officialCount}条官方公开渠道线索。`);
  }
  return reasons.slice(0, 4);
}

function riskLevelLabel(level: ReputationReportSummary["riskLevel"]): string {
  if (level === "HIGH") return "高";
  if (level === "MEDIUM") return "中";
  if (level === "LOW") return "低";
  return "未知";
}

function issueThemes(signals: readonly ReputationSignalV1[]): Array<{ theme: string; count: number; summary: string }> {
  const byTheme = new Map<string, ReputationSignalV1[]>();
  for (const signal of signals) {
    const theme = signal.riskTheme || "公开舆情";
    byTheme.set(theme, [...(byTheme.get(theme) ?? []), signal]);
  }
  return Array.from(byTheme.entries()).slice(0, 3).map(([theme, items]) => ({
    theme,
    count: items.length,
    summary: /司法|企业风险/.test(theme)
      ? "多个公开企业信息页面出现与该主体相关的司法或经营风险提示，具体案件事实、主体关系和当前处理状态仍需进一步核实。"
      : "主要涉及用户反馈、服务体验或合同收费相关争议，当前仍需核实处理结果和企业说明。",
  }));
}

function deductionExplanation(
  deduction: number,
  themes: readonly { theme: string; count: number }[],
  breakdown: ReturnType<typeof reputationPenaltyBreakdown>,
): string {
  if (deduction <= 0) return "本项未因明确负面舆情扣分。";
  const names = themes.map((item) => item.theme).slice(0, 2).join("、") || "公开舆情风险";
  const lines = [
    `中性基础：${breakdown.reputationNeutralBase}分`,
    `有效负面影响：-${breakdown.baseNegativePenalty}分`,
    `多个来源重复：-${breakdown.repeatedSourcePenalty}分`,
    `缺少公开回应：-${breakdown.noResponsePenalty}分`,
    `高决策影响：-${breakdown.customerDecisionImpactPenalty}分`,
  ];
  if (breakdown.authoritySeverityPenalty > 0) lines.push(`权威确认严重度：-${breakdown.authoritySeverityPenalty}分`);
  return `本项从中性口碑基准开始计算。因发现客户可见的${names}，本次口碑健康分受到明显扣减。${lines.join("；")}。`;
}

export function buildReputationReportSummary(snapshot: ReputationAndPublicOpinionSnapshotV1 | undefined): ReputationReportSummary {
  const empty: ReputationReportSummary = {
    score: null,
    riskLevel: "UNKNOWN",
    searchedQueryCount: 0,
    matchedEvidenceCount: 0,
    complaintCount: 0,
    mediaCount: 0,
    officialCount: 0,
    companyResponseCount: 0,
    negativeSignalCount: 0,
    positiveSignalCount: 0,
    neutralSignalCount: 0,
    responseSignalCount: 0,
    reputationDeduction: 0,
    evidenceConfidence: "LOW",
    searchCoverageConfidence: "LOW",
    entityRelationConfidence: "LOW",
    factualSpecificityConfidence: "LOW",
    customerVisibilityConfidence: "LOW",
    reputationNeutralBase: 65,
    positiveReputationBonus: 0,
    preNegativeReputationScore: 65,
    validCustomerVisibleNegativeCount: 0,
    independentNegativeSourceCount: 0,
    summary: "本次公开检索暂未匹配到相关证据；这不等于现实中不存在舆情，建议后续持续复查。",
    deductionExplanation: "本项未因明确负面舆情扣分。",
    riskReasons: ["缺少可用于展示的舆情证据。"],
    issueThemes: [],
    representativeEvidence: [],
    categoryRows: [],
    guardViolations: [],
  };
  if (!snapshot) return empty;

  const signals = snapshot.reputationSignals;
  const negativeSignalCount = snapshot.complaintSignals.length;
  const positiveSignalCount = snapshot.positiveSignals.length;
  const neutralSignalCount = snapshot.neutralSignals.length;
  const responseSignalCount = snapshot.responseSignals.length;
  const breakdown = reputationPenaltyBreakdown(snapshot.complaintSignals, snapshot.responseSignals, signals, snapshot.sourceCoverage, snapshot.reputationNeutralBase ?? 65, snapshot.searchedQueries.length);
  const reputationDeduction = breakdown.totalPenalty;
  const complaintCount = sourceCategoryCount(signals, "黑猫投诉") + sourceCategoryCount(signals, "消费投诉平台");
  const mediaCount = sourceCategoryCount(signals, "新闻媒体");
  const officialCount = sourceCategoryCount(signals, "官方公开渠道");
  const companyResponseCount = responseSignalCount;
  const matchedEvidenceCount = snapshot.evidenceIds.length;
  const themes = issueThemes(snapshot.complaintSignals);
  const summary = summaryFor({
    matchedEvidenceCount,
    negativeSignalCount,
    responseSignalCount,
    riskLevel: snapshot.riskLevel,
    issueThemes: themes,
    independentNegativeSourceCount: breakdown.independentNegativeSourceCount,
    reputationDeduction,
    neutralBase: breakdown.reputationNeutralBase,
  });
  const categoryRows = [
    { label: "投诉平台", count: complaintCount },
    { label: "新闻媒体", count: mediaCount },
    { label: "官方公开渠道", count: officialCount },
    { label: "企业回应", count: companyResponseCount },
  ].filter((row) => row.count > 0 || matchedEvidenceCount > 0);
  const representativeEvidence = representativeSignals(signals).map((signal) => ({
    title: signal.title || "未命名公开证据",
    source: signal.sourceName || signal.sourceCategory || "公开来源",
    date: dateOnly(signal.observedAt),
    evidenceType: evidenceTypeLabel(signal),
    summary: safeSummary(signal),
    url: signal.url,
    sentiment: signal.sentiment,
    signalType: signal.signalType,
    sourceCategory: signal.sourceCategory,
    resolutionStatus: signal.resolutionStatus,
  }));
  const result: ReputationReportSummary = {
    score: snapshot.overallReputationScore,
    riskLevel: snapshot.riskLevel,
    searchedQueryCount: snapshot.searchedQueries.length,
    matchedEvidenceCount,
    complaintCount,
    mediaCount,
    officialCount,
    companyResponseCount,
    negativeSignalCount,
    positiveSignalCount,
    neutralSignalCount,
    responseSignalCount,
    reputationDeduction,
    evidenceConfidence: snapshot.evidenceConfidence ?? breakdown.evidenceConfidence,
    searchCoverageConfidence: snapshot.searchCoverageConfidence ?? breakdown.searchCoverageConfidence,
    entityRelationConfidence: snapshot.entityRelationConfidence ?? breakdown.entityRelationConfidence,
    factualSpecificityConfidence: snapshot.factualSpecificityConfidence ?? breakdown.factualSpecificityConfidence,
    customerVisibilityConfidence: snapshot.customerVisibilityConfidence ?? breakdown.customerVisibilityConfidence,
    reputationNeutralBase: snapshot.reputationNeutralBase ?? breakdown.reputationNeutralBase,
    positiveReputationBonus: snapshot.positiveReputationBonus ?? breakdown.positiveReputationBonus,
    preNegativeReputationScore: snapshot.preNegativeReputationScore ?? breakdown.preNegativeReputationScore,
    validCustomerVisibleNegativeCount: breakdown.validCustomerVisibleNegativeCount,
    independentNegativeSourceCount: breakdown.independentNegativeSourceCount,
    summary,
    deductionExplanation: deductionExplanation(reputationDeduction, themes, breakdown),
    riskReasons: riskReasons({
      matchedEvidenceCount,
      negativeSignalCount,
      responseSignalCount,
      reputationDeduction,
      mediaCount,
      officialCount,
      riskThemes: snapshot.riskThemes,
      riskLevel: snapshot.riskLevel,
    }),
    issueThemes: themes,
    representativeEvidence,
    categoryRows,
    guardViolations: [],
  };
  result.guardViolations = reputationGuardViolations(result);
  return result;
}

export function reputationGuardViolations(summary: ReputationReportSummary): string[] {
  const text = [
    summary.summary,
    ...summary.riskReasons,
    ...summary.representativeEvidence.map((item) => item.summary),
  ].join("\n");
  const violations: string[] = [];
  if (summary.matchedEvidenceCount > 0) {
    for (const banned of NO_EVIDENCE_BANNED) {
      if (text.includes(banned)) violations.push(`MATCHED_EVIDENCE_BANNED:${banned}`);
    }
  }
  if (summary.negativeSignalCount > 0) {
    for (const banned of NEGATIVE_BANNED) {
      if (text.includes(banned)) violations.push(`NEGATIVE_SIGNAL_BANNED:${banned}`);
    }
  }
  return violations;
}
