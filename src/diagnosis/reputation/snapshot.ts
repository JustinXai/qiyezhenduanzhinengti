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
type EvidenceConfidence = NonNullable<ReputationAndPublicOpinionSnapshotV1["evidenceConfidence"]>;
type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ReputationPenaltyBreakdown {
  baseScore: number;
  reputationNeutralBase: number;
  positiveReputationBonus: number;
  preNegativeReputationScore: number;
  validCustomerVisibleNegativeCount: number;
  invalidOrWeakSignalCount: number;
  independentNegativeSourceCount: number;
  concreteNegativeThemes: string[];
  baseNegativePenalty: number;
  repeatedSourcePenalty: number;
  noResponsePenalty: number;
  customerDecisionImpactPenalty: number;
  authoritySeverityPenalty: number;
  totalPenalty: number;
  scoreCap: number | null;
  evidenceConfidence: EvidenceConfidence;
  searchCoverageConfidence: ConfidenceLevel;
  entityRelationConfidence: ConfidenceLevel;
  nameMatchConfidence: ConfidenceLevel;
  underlyingEntityConfidence: ConfidenceLevel;
  eventAttributionConfidence: ConfidenceLevel;
  factualSpecificityConfidence: ConfidenceLevel;
  customerVisibilityConfidence: ConfidenceLevel;
  underlyingNegativeEventCount: number;
  customerVisibleEntryCount: number;
  independentOriginalSourceCount: number;
}

const NEGATIVE_TERMS = ["投诉", "退费", "退款", "虚假宣传", "霸王条款", "纠纷", "合同", "课程缩水", "教学质量", "欺骗", "差评", "维权"];
const POSITIVE_TERMS = ["好评", "满意", "推荐", "靠谱", "优质", "认可", "口碑好"];
const OFFICIAL_REGISTRY_DOMAINS = ["qcc.com", "tianyancha.com", "qizhidao.com", "qixin.com", "aiqicha.baidu.com"];
const NEGATED_RESPONSE_PATTERN = /(?:暂未|未见|没有|缺少|未发现|无)(?:.{0,8})(?:回应|回复|处理|解决|协商)/;
const NEUTRAL_REPUTATION_BASE_SCORE = 65;

function clean(value: string | undefined | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function lowerText(item: EvidenceItem): string {
  return `${item.title} ${item.snippet} ${item.sourceDomain}`.toLowerCase();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAffirmativeResponse(text: string): boolean {
  if (NEGATED_RESPONSE_PATTERN.test(text)) return false;
  return /(?:企业|商家|官方).{0,6}(?:回应|回复)|(?:回应|回复).{0,6}(?:企业|商家|官方)|已回复|已回应|已解决|处理完成|双方达成|协商一致/.test(text);
}

function hasNonzeroOfficialRisk(text: string): boolean {
  return /自身风险\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*自身风险|司法案件\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*司法案件|行政处罚\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*行政处罚|被执行(?:人)?\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*被执行(?:人)?|失信(?:被执行人)?\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*失信(?:被执行人)?|限制消费\s*[1-9]\d*\s*条|[1-9]\d*\s*条\s*限制消费/.test(text);
}

function hasConcreteNegativeIssue(text: string): boolean {
  return hasNonzeroOfficialRisk(text) || containsAny(text, NEGATIVE_TERMS);
}

function hasKnownName(text: string, names: readonly string[]): boolean {
  return names.some((name) => name.length >= 2 && text.includes(name.toLowerCase()));
}

function hasNearbyNegativeTerm(text: string, names: readonly string[], maxDistance = 48): boolean {
  const nameIndexes = names
    .filter((name) => name.length >= 2)
    .flatMap((name) => indexesOf(text, name.toLowerCase()));
  if (nameIndexes.length === 0) return false;
  const negativeIndexes = NEGATIVE_TERMS.flatMap((term) => indexesOf(text, term.toLowerCase()));
  return nameIndexes.some((nameIndex) =>
    negativeIndexes.some((termIndex) =>
      Math.abs(nameIndex - termIndex) <= maxDistance && !hasRecommendationBoundaryBetween(text, nameIndex, termIndex),
    ),
  );
}

function hasRecommendationBoundaryBetween(text: string, firstIndex: number, secondIndex: number): boolean {
  const start = Math.min(firstIndex, secondIndex);
  const end = Math.max(firstIndex, secondIndex);
  const between = text.slice(start, end);
  return /推荐阅读|相关推荐|相关阅读|相关链接|热门文章|上一篇|下一篇|延伸阅读|页面推荐/.test(between);
}

function indexesOf(text: string, needle: string): number[] {
  const indexes: number[] = [];
  if (!needle) return indexes;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index < 0) break;
    indexes.push(index);
    start = index + needle.length;
  }
  return indexes;
}

function isComplaintSource(item: EvidenceItem): boolean {
  const text = lowerText(item);
  return /黑猫|消费保|消费投诉|投诉详情|tousu\.sina|xfb315/.test(text);
}

function hasThirdPartyComparisonNegativeContext(text: string, names: readonly string[]): boolean {
  if (!hasKnownName(text, names)) return false;
  const previousProviderNegative =
    /(?:之前|此前|原来|曾经).{0,18}(?:跑了|去过|找了|咨询过|在).{0,18}(?:两家|几家|多家|别家|其他|外面|地方).{0,50}(?:被骗|套路|留印|留疤|不适|增生|踩坑)/.test(text)
    || /(?:怕|担心).{0,12}(?:被骗|被套路|留印|留疤|洗不干净)/.test(text);
  const targetPositive =
    /(?:这家|该企业|该机构|该诊所|诊所|机构).{0,50}(?:实在|靠谱|满意|正规|透明|不推销|不夸大|客观|隐私|资质公示|体验很好|扫码核对|资质)/.test(text)
    || names.some((name) => new RegExp(`${escapeRegExp(name.toLowerCase())}.{0,50}(?:实在|靠谱|满意|正规|透明|不推销|不夸大|客观|隐私|资质公示|体验很好|扫码核对|资质)`).test(text));
  return previousProviderNegative && targetPositive;
}

function hasEntityScopedNegativeIssue(item: EvidenceItem, names: readonly string[]): boolean {
  const title = clean(item.title).toLowerCase();
  const text = lowerText(item);
  const officialRisk = hasNonzeroOfficialRisk(text);
  if (officialRisk) {
    return hasKnownName(text, names)
      && (hasKnownName(title, names) || hasNearbyNegativeTerm(text, names, 80) || OFFICIAL_REGISTRY_DOMAINS.some((domain) => item.sourceDomain.toLowerCase().includes(domain)));
  }
  if (!containsAny(text, NEGATIVE_TERMS)) return false;
  if (!isComplaintSource(item) && !containsAny(title, NEGATIVE_TERMS) && hasThirdPartyComparisonNegativeContext(text, names)) return false;
  if (hasNearbyNegativeTerm(text, names)) return true;
  return hasKnownName(title, names) && (containsAny(title, NEGATIVE_TERMS) || isComplaintSource(item));
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
  if (hasConcreteNegativeIssue(text)) return "UNRESOLVED";
  return "UNKNOWN";
}

function classifySignal(item: EvidenceItem, names: readonly string[], region: string): ReputationSignalV1 | null {
  const text = lowerText(item);
  const match = entityMatch(item, names, region);
  if (match === "LOW" || match === "CONFLICTED") return null;
  const officialRisk = hasNonzeroOfficialRisk(text);
  const negative = hasEntityScopedNegativeIssue(item, names);
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
    ? policyThemes.find((theme) => text.includes(theme.slice(0, 2))) ?? (officialRisk ? "司法案件与公开企业风险信息" : text.includes("退") ? "退费争议" : text.includes("合同") ? "合同条款争议" : text.includes("课程") ? "课程交付争议" : "口碑与投诉风险")
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
    underlyingEventKey: negative ? eventKeyFromText(text, riskTheme) : undefined,
    originalSource: negative && /法院|人民法院|court\.gov|gov\.cn|监管|行政处罚决定书|裁判文书网|wenshu/.test(`${item.sourceDomain} ${item.url}`) ? item.sourceDomain : undefined,
    aggregatorSource: negative ? aggregatorSourceName(item.sourceDomain, item.url) : undefined,
  };
}

function hasSignalEntityScopedNegativeIssue(signal: ReputationSignalV1, names: readonly string[]): boolean {
  if (names.length === 0) return true;
  const title = clean(signal.title).toLowerCase();
  const text = `${signal.title} ${signal.snippet} ${signal.sourceName} ${signal.url}`.toLowerCase();
  const officialRisk = hasNonzeroOfficialRisk(text);
  if (officialRisk) {
    return hasKnownName(text, names)
      && (hasKnownName(title, names) || hasNearbyNegativeTerm(text, names, 80) || isAggregatorSource(signal));
  }
  if (!containsAny(text, NEGATIVE_TERMS)) return false;
  if (hasNearbyNegativeTerm(text, names)) return true;
  return hasKnownName(title, names) && (containsAny(title, NEGATIVE_TERMS) || /黑猫|消费保|消费投诉|投诉详情|tousu\.sina|xfb315/.test(text));
}

function isCustomerVisibleNegative(signal: ReputationSignalV1, names: readonly string[] = []): boolean {
  const text = `${signal.title} ${signal.snippet}`;
  const visibleNegative = (signal.sentiment === "NEGATIVE" || signal.sentiment === "MIXED")
    && (signal.entityMatch === "HIGH" || signal.entityMatch === "MEDIUM")
    && /^https?:\/\//.test(signal.url);
  if (!visibleNegative) return false;
  return hasConcreteNegativeIssue(text) && hasSignalEntityScopedNegativeIssue(signal, names);
}

function independentSourceKey(signal: ReputationSignalV1): string {
  const host = (() => {
    try {
      return new URL(signal.url).hostname.replace(/^www\./, "");
    } catch {
      return signal.sourceName.replace(/^www\./, "");
    }
  })();
  if (/qcc|企查查/.test(`${host} ${signal.sourceName}`)) return "qcc";
  if (/qixin|启信宝/.test(`${host} ${signal.sourceName}`)) return "qixin";
  if (/tianyancha|天眼查/.test(`${host} ${signal.sourceName}`)) return "tianyancha";
  return host || signal.sourceName || signal.url;
}

function hasDirectAuthorityRisk(signals: readonly ReputationSignalV1[]): boolean {
  return signals.some((item) => /法院|人民法院|裁判文书网|wenshu|court\.gov|gov\.cn|监管局|市场监督管理局|行政处罚决定书|被执行人信息/.test(`${item.sourceName} ${item.url}`));
}

function isAggregatorSource(signal: ReputationSignalV1): boolean {
  return /qcc|企查查|qixin|启信宝|tianyancha|天眼查|aiqicha|爱企查/.test(`${signal.sourceName} ${signal.url}`);
}

function aggregatorSourceName(sourceName: string, url: string): string | undefined {
  if (/qcc|企查查/.test(`${sourceName} ${url}`)) return "企查查";
  if (/qixin|启信宝/.test(`${sourceName} ${url}`)) return "启信宝";
  if (/tianyancha|天眼查/.test(`${sourceName} ${url}`)) return "天眼查";
  if (/aiqicha|爱企查/.test(`${sourceName} ${url}`)) return "爱企查";
  return undefined;
}

function eventKeyFromText(text: string, riskTheme: string): string {
  const caseNo = text.match(/[（(]?\d{4}[）)]?[\u4e00-\u9fa5]{0,8}(?:民初|民终|执|行初|刑初|裁|知民)[\u4e00-\u9fa5\d号第-]{2,}/)?.[0];
  if (caseNo) return `case:${caseNo}`;
  if (/司法案件|裁判文书|立案信息|开庭公告|自身风险|经营风险/.test(text)) return `aggregated:${riskTheme}`;
  return `theme:${riskTheme}`;
}

function underlyingEventKey(signal: ReputationSignalV1): string {
  return signal.underlyingEventKey ?? eventKeyFromText(`${signal.title} ${signal.snippet}`, signal.riskTheme);
}

function hasHighDecisionImpact(signals: readonly ReputationSignalV1[]): boolean {
  return signals.some((signal) =>
    /正规|付款|退款|退费|合同|履约|服务|司法|经营风险|报名|合作|课程|执行/.test(`${signal.riskTheme} ${signal.title} ${signal.snippet}`),
  );
}

function positiveReputationBonus(signals: readonly ReputationSignalV1[]): number {
  const independentPositiveThemes = new Set<string>();
  for (const signal of signals) {
    const text = `${signal.title} ${signal.snippet}`;
    const isTrustBuilding = signal.sentiment === "POSITIVE"
      && signal.signalType === "POSITIVE_REVIEW"
      && (signal.entityMatch === "HIGH" || signal.entityMatch === "MEDIUM")
      && !/(官网|官方网站|公司简介|企业介绍|工商|注册资本|统一社会信用|存续|小微企业)/.test(text)
      && /^https?:\/\//.test(signal.url);
    if (isTrustBuilding) {
      independentPositiveThemes.add(`${independentSourceKey(signal)}:${signal.riskTheme || signal.signalType}`);
    }
  }
  return Math.min(20, independentPositiveThemes.size * 4);
}

function evidenceConfidenceFor(signals: readonly ReputationSignalV1[], sourceCoverage: readonly string[]): EvidenceConfidence {
  const uniqueSources = new Set(signals.map(independentSourceKey)).size;
  if (signals.length >= 5 && (uniqueSources >= 2 || sourceCoverage.length >= 2)) return "HIGH";
  if (signals.length >= 2 || sourceCoverage.length >= 1) return "MEDIUM";
  return "LOW";
}

function searchCoverageConfidenceFor(signals: readonly ReputationSignalV1[], sourceCoverage: readonly string[], searchedQueryCount = 0): ConfidenceLevel {
  const uniqueSources = new Set(signals.map(independentSourceKey)).size;
  if (signals.length >= 5 && (sourceCoverage.length >= 2 || uniqueSources >= 2) && searchedQueryCount >= 4) return "HIGH";
  if (signals.length >= 2 || sourceCoverage.length >= 1 || searchedQueryCount >= 2) return "MEDIUM";
  return "LOW";
}

function entityRelationConfidenceFor(signals: readonly ReputationSignalV1[]): ConfidenceLevel {
  if (signals.length === 0) return "LOW";
  const highCount = signals.filter((signal) => signal.entityMatch === "HIGH").length;
  if (highCount === signals.length || highCount >= 2) return "HIGH";
  if (signals.some((signal) => signal.entityMatch === "HIGH" || signal.entityMatch === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

function nameMatchConfidenceFor(signals: readonly ReputationSignalV1[]): ConfidenceLevel {
  return entityRelationConfidenceFor(signals);
}

function underlyingEntityConfidenceFor(signals: readonly ReputationSignalV1[]): ConfidenceLevel {
  if (signals.length === 0) return "LOW";
  const nameConfidence = nameMatchConfidenceFor(signals);
  if (nameConfidence === "LOW") return "LOW";
  return signals.some(isAggregatorSource) ? "MEDIUM" : nameConfidence;
}

function eventAttributionConfidenceFor(negativeSignals: readonly ReputationSignalV1[]): ConfidenceLevel {
  if (negativeSignals.length === 0) return "LOW";
  if (hasDirectAuthorityRisk(negativeSignals)) return "HIGH";
  if (negativeSignals.some(isAggregatorSource)) return "MEDIUM";
  return negativeSignals.some((signal) => signal.entityMatch === "HIGH") ? "MEDIUM" : "LOW";
}

function factualSpecificityConfidenceFor(negativeSignals: readonly ReputationSignalV1[]): ConfidenceLevel {
  if (negativeSignals.length === 0) return "LOW";
  const detailed = negativeSignals.filter((signal) => /案号|判决|裁定|执行标的|行政处罚决定书|投诉编号|订单|合同编号|已解决|处理结果/.test(`${signal.title} ${signal.snippet}`)).length;
  if (detailed >= 2 || hasDirectAuthorityRisk(negativeSignals)) return "HIGH";
  if (negativeSignals.some((signal) => hasConcreteNegativeIssue(`${signal.title} ${signal.snippet}`))) return "MEDIUM";
  return "LOW";
}

function customerVisibilityConfidenceFor(signals: readonly ReputationSignalV1[]): ConfidenceLevel {
  if (signals.length === 0) return "LOW";
  const visibleCount = signals.filter((signal) => /^https?:\/\//.test(signal.url) && (signal.entityMatch === "HIGH" || signal.entityMatch === "MEDIUM")).length;
  if (visibleCount >= 3) return "HIGH";
  if (visibleCount > 0) return "MEDIUM";
  return "LOW";
}

export function reputationPenaltyBreakdown(
  negativeSignals: readonly ReputationSignalV1[],
  responses: readonly ReputationSignalV1[],
  allSignals: readonly ReputationSignalV1[] = negativeSignals,
  sourceCoverage: readonly string[] = [],
  baseScore = NEUTRAL_REPUTATION_BASE_SCORE,
  searchedQueryCount = 0,
  knownNames: readonly string[] = [],
): ReputationPenaltyBreakdown {
  const validSignals = negativeSignals.filter((signal) => isCustomerVisibleNegative(signal, knownNames));
  const byTheme = new Map<string, ReputationSignalV1[]>();
  const bySource = new Map<string, ReputationSignalV1[]>();
  for (const signal of validSignals) {
    const key = signal.riskTheme || signal.signalType;
    byTheme.set(key, [...(byTheme.get(key) ?? []), signal]);
    const sourceKey = independentSourceKey(signal);
    bySource.set(sourceKey, [...(bySource.get(sourceKey) ?? []), signal]);
  }
  const concreteNegativeThemes = Array.from(byTheme.keys()).slice(0, 3);
  const independentNegativeSourceCount = bySource.size;
  const validCustomerVisibleNegativeCount = validSignals.length;
  const underlyingNegativeEventCount = new Set(validSignals.map(underlyingEventKey)).size;
  const customerVisibleEntryCount = validCustomerVisibleNegativeCount;
  const independentOriginalSourceCount = new Set(validSignals.map((signal) => signal.originalSource).filter(Boolean)).size;
  const baseNegativePenalty = validCustomerVisibleNegativeCount > 0 ? 20 : 0;
  const repeatedSourcePenalty = independentNegativeSourceCount >= 2 ? 5 : 0;
  const noResponsePenalty = validCustomerVisibleNegativeCount > 0 && responses.length === 0 ? 5 : 0;
  const customerDecisionImpactPenalty = validCustomerVisibleNegativeCount > 0 && hasHighDecisionImpact(validSignals) ? 5 : 0;
  const directAuthority = hasDirectAuthorityRisk(validSignals);
  const authoritySeverityPenalty = directAuthority ? 10 : 0;
  const bonus = positiveReputationBonus(allSignals);
  const preNegativeReputationScore = Math.min(100, baseScore + bonus);
  const totalPenalty = validCustomerVisibleNegativeCount > 0
    ? Math.min(45, Math.max(20, baseNegativePenalty + repeatedSourcePenalty + noResponsePenalty + customerDecisionImpactPenalty + authoritySeverityPenalty))
    : 0;
  const scoreCap = directAuthority
    ? 45
    : independentNegativeSourceCount >= 2 && responses.length === 0
      ? 44
      : validCustomerVisibleNegativeCount > 0
        ? 45
        : null;
  return {
    baseScore,
    reputationNeutralBase: baseScore,
    positiveReputationBonus: bonus,
    preNegativeReputationScore,
    validCustomerVisibleNegativeCount,
    invalidOrWeakSignalCount: Math.max(0, negativeSignals.length - validCustomerVisibleNegativeCount),
    independentNegativeSourceCount,
    concreteNegativeThemes,
    baseNegativePenalty,
    repeatedSourcePenalty,
    noResponsePenalty,
    customerDecisionImpactPenalty,
    authoritySeverityPenalty,
    totalPenalty,
    scoreCap,
    evidenceConfidence: evidenceConfidenceFor(allSignals, sourceCoverage),
    searchCoverageConfidence: searchCoverageConfidenceFor(allSignals, sourceCoverage, searchedQueryCount),
    entityRelationConfidence: entityRelationConfidenceFor(validSignals.length > 0 ? validSignals : allSignals),
    nameMatchConfidence: nameMatchConfidenceFor(validSignals.length > 0 ? validSignals : allSignals),
    underlyingEntityConfidence: underlyingEntityConfidenceFor(validSignals.length > 0 ? validSignals : allSignals),
    eventAttributionConfidence: eventAttributionConfidenceFor(validSignals),
    factualSpecificityConfidence: factualSpecificityConfidenceFor(validSignals),
    customerVisibilityConfidence: customerVisibilityConfidenceFor(validSignals.length > 0 ? validSignals : allSignals),
    underlyingNegativeEventCount,
    customerVisibleEntryCount,
    independentOriginalSourceCount,
  };
}

export function reputationDeductionFromSignals(negativeSignals: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[]): number {
  return reputationPenaltyBreakdown(negativeSignals, responses).totalPenalty;
}

function riskLevelFromPenalty(score: number, breakdown: ReputationPenaltyBreakdown): ReputationAndPublicOpinionSnapshotV1["riskLevel"] {
  if (breakdown.validCustomerVisibleNegativeCount === 0) return "LOW";
  if (breakdown.independentNegativeSourceCount >= 2 && breakdown.noResponsePenalty > 0) return "HIGH";
  if (score <= 44 || breakdown.authoritySeverityPenalty >= 10 || breakdown.customerDecisionImpactPenalty > 0) return "HIGH";
  return "MEDIUM";
}

function scoreFromSignals(negativeSignals: readonly ReputationSignalV1[], positives: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[], allSignals: readonly ReputationSignalV1[], sourceCoverage: readonly string[], knownNames: readonly string[]): number {
  const breakdown = reputationPenaltyBreakdown(negativeSignals, responses, allSignals, sourceCoverage, NEUTRAL_REPUTATION_BASE_SCORE, 0, knownNames);
  void positives;
  const raw = breakdown.preNegativeReputationScore - breakdown.totalPenalty;
  const capped = breakdown.scoreCap === null ? raw : Math.min(raw, breakdown.scoreCap);
  return Math.max(0, Math.min(100, capped));
}

function summaryFor(negativeSignals: readonly ReputationSignalV1[], responses: readonly ReputationSignalV1[], score: number | null, breakdown?: ReputationPenaltyBreakdown): string {
  if (negativeSignals.length === 0) return "本次公开检索匹配到相关公开信息，暂未发现明确负面风险信号。";
  const responseCopy = responses.length > 0 ? "同时检索到部分回应或处理线索。" : "暂未形成足够清晰的公开回应线索。";
  const themeCopy = breakdown?.concreteNegativeThemes.slice(0, 2).join("、") || "公开风险信息";
  const entryCopy = breakdown
    ? `其中${breakdown.customerVisibleEntryCount}个客户可见入口可被普通搜索触达，当前归并为${breakdown.underlyingNegativeEventCount}类底层风险线索，${breakdown.independentOriginalSourceCount > 0 ? `可追溯到${breakdown.independentOriginalSourceCount}个原始来源` : "尚未追溯到原始司法或官方详情"}`
    : "相关事实仍需进一步核实";
  return `本次公开检索发现${negativeSignals.length}条客户可见风险信息，主要涉及${themeCopy}。${entryCopy}。现有公开摘要尚不足以确认具体案件性质、责任关系和处理结果；由于客户搜索企业正规性时可能直接看到这些信息，且${responseCopy}口碑风险评分为${score ?? "未评分"}分。`;
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
  const sourceCoverage = REPUTATION_SOURCE_CATEGORIES.filter((category) =>
    signals.some((signal) => signal.sourceCategory === category),
  );
  const score = scoreFromSignals(complaintSignals, positiveSignals, responseSignals, signals, sourceCoverage, names);
  const breakdown = reputationPenaltyBreakdown(complaintSignals, responseSignals, signals, sourceCoverage, NEUTRAL_REPUTATION_BASE_SCORE, input.searchedQueries.length, names);
  const riskLevel = riskLevelFromPenalty(score, breakdown);
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
    reputationHealthScore: score,
    reputationNeutralBase: breakdown.reputationNeutralBase,
    positiveReputationBonus: breakdown.positiveReputationBonus,
    preNegativeReputationScore: breakdown.preNegativeReputationScore,
    evidenceConfidence: breakdown.evidenceConfidence,
    searchCoverageConfidence: breakdown.searchCoverageConfidence,
    entityRelationConfidence: breakdown.entityRelationConfidence,
    nameMatchConfidence: breakdown.nameMatchConfidence,
    underlyingEntityConfidence: breakdown.underlyingEntityConfidence,
    eventAttributionConfidence: breakdown.eventAttributionConfidence,
    factualSpecificityConfidence: breakdown.factualSpecificityConfidence,
    customerVisibilityConfidence: breakdown.customerVisibilityConfidence,
    underlyingNegativeEventCount: breakdown.underlyingNegativeEventCount,
    customerVisibleEntryCount: breakdown.customerVisibleEntryCount,
    independentOriginalSourceCount: breakdown.independentOriginalSourceCount,
    riskLevel,
    summary: summaryFor(complaintSignals, responseSignals, score, breakdown),
    evidenceIds: Array.from(new Set(signals.map((item) => item.evidenceId))),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    version: "reputation-public-opinion-snapshot.v1",
  };
}
