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
const OFFICIAL_REGISTRY_DOMAINS = ["qcc.com", "tianyancha.com", "qizhidao.com", "qixin.com", "aiqicha.baidu.com"];
const NEGATED_RESPONSE_PATTERN = /(?:暂未|未见|没有|缺少|未发现|无)(?:.{0,8})(?:回应|回复|处理|解决|协商)/;

function clean(value: string | undefined | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function lowerText(item: EvidenceItem): string {
  return `${item.title} ${item.snippet} ${item.sourceDomain}`.toLowerCase();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function hasAffirmativeResponse(text: string): boolean {
  if (NEGATED_RESPONSE_PATTERN.test(text)) return false;
  return /(?:企业|商家|官方).{0,6}(?:回应|回复)|(?:回应|回复).{0,6}(?:企业|商家|官方)|已回复|已回应|已解决|处理完成|双方达成|协商一致/.test(text);
}

function hasNonzeroOfficialRisk(text: string): boolean {
  return /自身风险\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*自身风险|司法案件\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*司法案件|行政处罚\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*行政处罚|被执行(?:人)?\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*被执行(?:人)?|失信(?:被执行人)?\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*失信(?:被执行人)?|限制消费\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*限制消费/.test(text);
}

function sourceCategory(item: EvidenceItem): string {
  const text = lowerText(item);
  const domain = item.sourceDomain.toLowerCase();
  if (text.includes("黑猫") || domain.includes("tousu.sina")) return "黑猫投诉";
  if (text.includes("消费保") || text.includes("消费投诉") || domain.includes("xfb315")) return "消费投诉平台";
  if (hasAffirmativeResponse(text) && /企业回应|商家回复|官方回复|已回复|已回应/.test(text)) return "企业自身回应";
  if (OFFICIAL_REGISTRY_DOMAINS.some((item) => domain.includes(item)) || /工商|备案|统一社会信用|注册资本|商标|司法案件|纳税人/.test(text)) return "官方公开渠道";
  if (/news|xinhuanet|people|chinanews|sina|sohu|163|qq|thepaper/.test(domain) || /新闻|媒体|报道/.test(text)) return "新闻媒体";
  if (/xiaohongshu|zhihu|weibo|douyin|bilibili/.test(domain) || /小红书|知乎|微博|抖音|社交/.test(text)) return "社交平台";
  if (/dianping|meituan|amap|baidu/.test(domain) || /大众点评|美团|地图|本地生活/.test(text)) return "本地生活平台";
  if (/gov|edu|org/.test(domain) || /官方|公开|公示/.test(text)) return "官方公开渠道";
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
  if (hasAffirmativeResponse(text)) return "RESPONDED";
  if (containsAny(text, NEGATIVE_TERMS) || hasNonzeroOfficialRisk(text)) return "UNRESOLVED";
  return "UNKNOWN";
}

function classifySignal(item: EvidenceItem, names: readonly string[], region: string): ReputationSignalV1 | null {
  const text = lowerText(item);
  const match = entityMatch(item, names, region);
  if (match === "LOW" || match === "CONFLICTED") return null;
  const officialRisk = hasNonzeroOfficialRisk(text);
  const negative = containsAny(text, NEGATIVE_TERMS) || officialRisk;
  const positive = containsAny(text, POSITIVE_TERMS);
  const responded = hasAffirmativeResponse(text);
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
    ? policyThemes.find((theme) => text.includes(theme.slice(0, 2))) ?? (officialRisk ? "司法与企业风险提示" : text.includes("退") ? "退费争议" : text.includes("合同") ? "合同条款争议" : text.includes("课程") ? "课程交付争议" : "口碑与投诉风险")
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

export function reputationDeductionFromSignals(negativeSignals: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[]): number {
  const byTheme = new Map<string, ReputationSignalV1[]>();
  for (const signal of negativeSignals) {
    const key = signal.riskTheme || signal.signalType;
    byTheme.set(key, [...(byTheme.get(key) ?? []), signal]);
  }
  const responseThemes = new Set(responses.map((signal) => signal.riskTheme).filter(Boolean));
  let total = 0;
  for (const [theme, items] of Array.from(byTheme.entries()).slice(0, 3)) {
    const hasDirectAuthority = items.some((item) => /法院|人民法院|裁判文书网|wenshu|court\.gov|gov\.cn|监管局|市场监督管理局|行政处罚决定书/.test(`${item.sourceName} ${item.url}`));
    const hasMedia = items.some((item) => item.signalType === "MEDIA_REPORT" || item.sourceCategory === "新闻媒体");
    const hasComplaintSource = items.some((item) => item.signalType === "COMPLAINT" || item.sourceCategory === "黑猫投诉" || item.sourceCategory === "消费投诉平台");
    const uniqueSources = new Set(items.map((item) => `${item.sourceName}:${item.url}`)).size;
    let deduction = 4;
    if (uniqueSources >= 2 && hasComplaintSource) deduction = 7;
    if (hasMedia) deduction = 10;
    if (hasDirectAuthority) deduction = 18;
    if (responseThemes.has(theme)) deduction = Math.max(0, deduction - 2);
    total += deduction;
  }
  return Math.min(30, total);
}

function scoreFromSignals(negativeSignals: readonly ReputationSignalV1[], positives: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[]): number {
  const deduction = reputationDeductionFromSignals(negativeSignals, responses);
  const credit = Math.min(4, positives.length * 1 + responses.length * 2);
  return Math.max(0, Math.min(100, 82 - deduction + credit));
}

function summaryFor(negativeSignals: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[], score: number | null): string {
  if (negativeSignals.length === 0) return "本次公开检索匹配到相关公开信息，暂未发现明确负面风险信号。";
  const responseCopy = responses.length > 0 ? "同时检索到部分回应或处理线索。" : "暂未形成足够清晰的公开回应线索。";
  return `本次公开检索发现${negativeSignals.length}条与投诉、争议或企业风险提示相关的舆情线索，口碑风险评分为${score ?? "未评分"}分。${responseCopy}`;
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
  const deduction = reputationDeductionFromSignals(complaintSignals, responseSignals);
  const riskThemeCount = new Set(complaintSignals.map((item) => item.riskTheme)).size;
  const riskLevel = deduction >= 18 ? "HIGH" : deduction >= 7 || riskThemeCount >= 2 ? "MEDIUM" : "LOW";
  const sourceCoverage = REPUTATION_SOURCE_CATEGORIES.filter((category) =>
    signals.some((signal) => signal.sourceCategory === category),
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
