import type {
  ReputationAndPublicOpinionSnapshotV1,
  ReputationSignalV1,
} from "../../contracts";

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
  summary: string;
  riskReasons: string[];
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
}): string {
  if (input.matchedEvidenceCount === 0) {
    return "本次公开检索暂未匹配到与企业或品牌相关的舆情证据；这不等于现实中不存在舆情，建议后续持续复查。";
  }
  if (input.negativeSignalCount > 0 && input.riskLevel === "LOW") {
    const responseCopy = input.responseSignalCount > 0
      ? "部分公开争议已出现企业回应或处理信息，这有助于降低信息不对称，但仍建议建立统一的公开回应入口。"
      : "暂未看到足够集中的企业公开回应入口，建议补充统一、可核验的回应机制。";
    return `公开渠道已发现与品牌服务、客户反馈或企业回应相关的舆情信息，并包含部分投诉或争议信号；当前证据数量、集中程度或严重程度暂未形成明显高风险聚集，因此综合风险等级评估为低风险。${responseCopy}`;
  }
  if (input.negativeSignalCount > 0) {
    const responseCopy = input.responseSignalCount > 0 ? "同时也检索到企业回应或处理信息。" : "暂未检索到足够清晰的企业公开回应入口。";
    return `本次检索发现部分投诉或争议信息，建议企业持续关注相关问题，并补充公开、统一、可核验的回应机制。${responseCopy}`;
  }
  return "本次公开检索匹配到与企业或品牌相关的舆情和公开信息，暂未发现明确负面风险信号；这不等于网络上没有舆情，后续仍应持续复查。";
}

function riskReasons(input: {
  matchedEvidenceCount: number;
  negativeSignalCount: number;
  responseSignalCount: number;
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
    reasons.push(`其中${input.negativeSignalCount}条属于投诉、退款或争议相关信号。`);
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
  if (input.mediaCount > 0 || input.officialCount > 0) {
    reasons.push(`证据中包含${input.mediaCount}条新闻媒体线索和${input.officialCount}条官方公开渠道线索。`);
  }
  return reasons.slice(0, 4);
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
    summary: "本次公开检索暂未匹配到相关证据；这不等于现实中不存在舆情，建议后续持续复查。",
    riskReasons: ["缺少可用于展示的舆情证据。"],
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
  const complaintCount = sourceCategoryCount(signals, "黑猫投诉") + sourceCategoryCount(signals, "消费投诉平台");
  const mediaCount = sourceCategoryCount(signals, "新闻媒体");
  const officialCount = sourceCategoryCount(signals, "官方公开渠道");
  const companyResponseCount = sourceCategoryCount(signals, "企业自身回应") + responseSignalCount;
  const matchedEvidenceCount = snapshot.evidenceIds.length;
  const summary = summaryFor({
    matchedEvidenceCount,
    negativeSignalCount,
    responseSignalCount,
    riskLevel: snapshot.riskLevel,
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
    summary,
    riskReasons: riskReasons({
      matchedEvidenceCount,
      negativeSignalCount,
      responseSignalCount,
      mediaCount,
      officialCount,
      riskThemes: snapshot.riskThemes,
      riskLevel: snapshot.riskLevel,
    }),
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
