import type {
  EvidenceItem,
  ReputationAndPublicOpinionSnapshotV1,
  ReputationSignalV1,
} from "../../contracts";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";
import {
  REPUTATION_SOURCE_CATEGORIES,
  knownBrandNames,
  selectReputationPolicy,
} from "./policy";

type SignalType = ReputationSignalV1["signalType"];
type Sentiment = ReputationSignalV1["sentiment"];
type ResolutionStatus = ReputationSignalV1["resolutionStatus"];
type EntityMatch = ReputationSignalV1["entityMatch"];

const NEGATIVE_TERMS = ["投诉", "退费", "退款", "虚假宣传", "霸王条款", "纠纷", "合同", "课程缩水", "教学质量", "欺骗", "差评", "维权"];
const POSITIVE_TERMS = ["好评", "满意", "推荐", "靠谱", "优质", "认可", "口碑好"];
const RESPONSE_TERMS = ["回应", "回复", "处理", "已回复", "已完成", "企业回应", "协商"];

function clean(value: string | undefined | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function lowerText(item: EvidenceItem): string {
  return `${item.title} ${item.snippet} ${item.sourceDomain}`.toLowerCase();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function sourceCategory(item: EvidenceItem): string {
  const text = lowerText(item);
  const domain = item.sourceDomain.toLowerCase();
  if (text.includes("黑猫") || domain.includes("tousu.sina")) return "黑猫投诉";
  if (text.includes("消费保") || text.includes("消费投诉") || domain.includes("xfb315")) return "消费投诉平台";
  if (/news|xinhuanet|people|chinanews|sina|sohu|163|qq|thepaper/.test(domain) || /新闻|媒体|报道/.test(text)) return "新闻媒体";
  if (/xiaohongshu|zhihu|weibo|douyin|bilibili/.test(domain) || /小红书|知乎|微博|抖音|社交/.test(text)) return "社交平台";
  if (/dianping|meituan|amap|baidu/.test(domain) || /大众点评|美团|地图|本地生活/.test(text)) return "本地生活平台";
  if (/gov|edu|org/.test(domain) || /官方|公开|公示/.test(text)) return "官方公开渠道";
  if (/官网|官方网站|公众号|回复|回应/.test(text)) return "企业自身回应";
  return "新闻媒体";
}

function entityMatch(item: EvidenceItem, names: readonly string[], region: string): EntityMatch {
  const text = `${item.title} ${item.snippet}`;
  const strong = names.some((name) => name.length >= 4 && text.includes(name));
  if (strong) return "HIGH";
  const mediumName = names.some((name) => name.length >= 2 && text.includes(name));
  if (mediumName && (!region || text.includes(region) || item.sourceDomain)) return "MEDIUM";
  if (/另一家|无关|招聘|股票|地址不同/.test(text)) return "CONFLICTED";
  return "LOW";
}

function resolutionStatus(text: string): ResolutionStatus {
  if (/已完成|已解决|双方达成|处理完成/.test(text)) return "RESOLVED";
  if (containsAny(text, RESPONSE_TERMS)) return "RESPONDED";
  if (containsAny(text, NEGATIVE_TERMS)) return "UNRESOLVED";
  return "UNKNOWN";
}

function classifySignal(item: EvidenceItem, names: readonly string[], region: string): ReputationSignalV1 | null {
  const text = lowerText(item);
  const match = entityMatch(item, names, region);
  if (match === "LOW" || match === "CONFLICTED") return null;
  const negative = containsAny(text, NEGATIVE_TERMS);
  const positive = containsAny(text, POSITIVE_TERMS);
  const responded = containsAny(text, RESPONSE_TERMS);
  let signalType: SignalType = "NEUTRAL_MENTION";
  let sentiment: Sentiment = "NEUTRAL";
  if (negative) {
    signalType = /投诉|黑猫|消费保/.test(text) ? "COMPLAINT" : "NEGATIVE_REVIEW";
    sentiment = positive ? "MIXED" : "NEGATIVE";
  } else if (responded) {
    signalType = "COMPANY_RESPONSE";
    sentiment = "NEUTRAL";
  } else if (positive) {
    signalType = "POSITIVE_REVIEW";
    sentiment = "POSITIVE";
  } else if (/新闻|媒体|报道/.test(text)) {
    signalType = "MEDIA_REPORT";
  }
  const policyThemes = selectReputationPolicy({ brandName: names[0], industry: "", productOrService: "" }).riskThemes;
  const riskTheme = negative
    ? policyThemes.find((theme) => text.includes(theme.slice(0, 2))) ?? (text.includes("退") ? "退费争议" : text.includes("合同") ? "合同条款争议" : text.includes("课程") ? "课程交付争议" : "口碑与投诉风险")
    : "常规公开评价";
  return {
    signalId: `rep_${item.id}`,
    signalType,
    sentiment,
    sourceCategory: sourceCategory(item),
    sourceName: item.sourceDomain,
    title: clean(item.title),
    snippet: clean(item.snippet),
    url: item.url,
    entityMatch: match,
    resolutionStatus: resolutionStatus(text),
    riskTheme,
    evidenceId: item.id,
    observedAt: item.fetchedAt,
  };
}

function scoreFromSignals(complaints: readonly ReputationSignalV1[], positives: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[]): number {
  const unresolved = complaints.filter((item) => item.resolutionStatus === "UNRESOLVED").length;
  const penalty = complaints.length * 12 + unresolved * 8;
  const credit = Math.min(12, positives.length * 3 + responses.length * 4);
  return Math.max(0, Math.min(100, 78 - penalty + credit));
}

function summaryFor(complaints: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[], score: number | null): string {
  if (complaints.length === 0) return "本次公开检索暂未发现明显集中的负面舆情。";
  const responseCopy = responses.length > 0 ? "同时检索到部分回应或处理线索。" : "暂未形成足够清晰的公开回应线索。";
  return `本次公开检索发现${complaints.length}条与投诉、退款或争议相关的舆情线索，口碑风险评分为${score ?? "未评分"}分。${responseCopy}`;
}

export function buildReputationSnapshot(input: {
  diagnosisId: string;
  diagnosisInput: DiagnosisInput;
  evidence: readonly EvidenceItem[];
  searchedQueries: readonly string[];
  generatedAt?: string;
}): ReputationAndPublicOpinionSnapshotV1 {
  const names = knownBrandNames(input.diagnosisInput);
  const companyName = names[0] ?? input.diagnosisInput.brandName ?? "待确认企业";
  const region = clean(input.diagnosisInput.targetRegion) || "待确认地区";
  const signals = input.evidence
    .map((item) => classifySignal(item, names, region))
    .filter((item): item is ReputationSignalV1 => item !== null);
  const complaintSignals = signals.filter((item) => item.sentiment === "NEGATIVE" || item.sentiment === "MIXED");
  const positiveSignals = signals.filter((item) => item.sentiment === "POSITIVE");
  const neutralSignals = signals.filter((item) => item.sentiment === "NEUTRAL");
  const responseSignals = signals.filter((item) => item.signalType === "COMPANY_RESPONSE" || item.resolutionStatus === "RESPONDED" || item.resolutionStatus === "RESOLVED");
  const score = scoreFromSignals(complaintSignals, positiveSignals, responseSignals);
  const riskLevel = complaintSignals.length >= 3 ? "HIGH" : complaintSignals.length >= 1 ? "MEDIUM" : "LOW";
  const sourceCoverage = REPUTATION_SOURCE_CATEGORIES.filter((category) =>
    signals.some((signal) => signal.sourceCategory === category) ||
    input.searchedQueries.some((query) => query.includes(category.replace("平台", ""))),
  );
  return {
    diagnosisId: input.diagnosisId,
    companyName,
    knownBrandNames: names,
    region,
    searchedQueries: [...input.searchedQueries],
    sourceCoverage,
    reputationSignals: signals,
    complaintSignals,
    positiveSignals,
    neutralSignals,
    riskThemes: Array.from(new Set(complaintSignals.map((item) => item.riskTheme))).slice(0, 5),
    responseSignals,
    overallReputationScore: score,
    riskLevel,
    summary: summaryFor(complaintSignals, responseSignals, score),
    evidenceIds: Array.from(new Set(signals.map((item) => item.evidenceId))),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    version: "reputation-public-opinion-snapshot.v1",
  };
}
