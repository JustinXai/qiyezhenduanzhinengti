import type {
  DiagnosisReport,
  EvidenceItem,
  LimitedReportDataV1,
  SourceCoverageSlotV1,
  PublicInformationSlotStatus,
  VerticalPolicyPackId,
} from "../../contracts";
import { REPORT_CONTRACT_VERSION, SCORE_CONTRACT_VERSION } from "../../contracts";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";

type Policy = {
  id: VerticalPolicyPackId;
  slots: readonly string[];
  prohibitedClaims: readonly string[];
  assets: readonly string[];
};

const COMMON_SLOTS = ["企业主体与官方入口", "产品或服务信息", "信任与证明信息", "客户决策内容", "咨询、预约或合作路径"];
const POLICIES: Record<VerticalPolicyPackId, Policy> = {
  GENERAL_BUSINESS: { id: "GENERAL_BUSINESS", slots: COMMON_SLOTS, prohibitedClaims: ["企业没有公开信息", "全网没有相关信息"], assets: ["企业与服务说明页", "客户常见问题页", "信任与案例资料页"] },
  CONSUMER_BRAND: { id: "CONSUMER_BRAND", slots: [...COMMON_SLOTS, "产品规格与购买说明"], prohibitedClaims: ["市场份额低", "AI不会推荐"], assets: ["品牌与产品说明页", "选购指南与FAQ", "售后与评价说明页"] },
  LOCAL_SERVICE: { id: "LOCAL_SERVICE", slots: [...COMMON_SLOTS, "地址、营业时间和本地入口"], prohibitedClaims: ["本地排名低", "客户无法找到企业"], assets: ["门店或服务地点页", "服务流程与预约页", "常见问题与售后页"] },
  LOCAL_LIFESTYLE_BEAUTY: { id: "LOCAL_LIFESTYLE_BEAUTY", slots: ["门店主体", "地址、营业时间和联系方式", "服务项目", "价格或收费边界", "服务人员和技能信息", "卫生与服务流程", "预约及到店流程", "售后及投诉处理", "案例和用户评价", "地图POI、本地生活及社交账号", "常见问题", "转化入口"], prohibitedClaims: ["没有医疗资质", "服务不安全", "服务人员不专业"], assets: ["门店与服务项目页", "项目和价格说明", "卫生、人员与服务流程说明", "预约、到店及售后说明", "案例与评价内容"] },
  LOCAL_REGULATED_MEDICAL: { id: "LOCAL_REGULATED_MEDICAL", slots: ["企业工商主体", "医疗机构执业许可或官方备案", "医生和专业人员公开信息", "服务项目和适用范围", "风险、注意事项及流程说明", "设备、耗材和品牌信息", "咨询、预约、收费和随访", "案例展示规范", "售后、投诉和纠纷处理", "地图POI及本地平台入口", "官方网站或官方账号", "用户决策内容"], prohibitedClaims: ["不正规", "不安全", "医生不专业", "没有资质", "处罚会影响排名", "AI不会推荐"], assets: ["机构与资质信息页", "医生团队信息页", "项目流程与风险说明", "设备耗材与品牌说明", "预约面诊及收费说明", "随访、售后和投诉渠道"] },
  B2B_INDUSTRIAL: { id: "B2B_INDUSTRIAL", slots: [...COMMON_SLOTS, "交付、采购与合作信息"], prohibitedClaims: ["市场份额低", "竞争对手明显领先"], assets: ["企业与能力说明页", "产品选型与技术FAQ", "交付、采购与合作页", "案例与证明材料页"] },
};

function selectPolicy(industry = "", product = ""): { policy: Policy; resolutionStatus: "RESOLVED" | "NEEDS_CONFIRMATION" } {
  const text = `${industry} ${product}`.toLowerCase();
  if (/医疗|医美|口腔|体检|诊所/.test(text)) return { policy: POLICIES.LOCAL_REGULATED_MEDICAL, resolutionStatus: "RESOLVED" };
  if (/美容|美发|美甲|spa|皮肤护理/.test(text)) return { policy: POLICIES.LOCAL_LIFESTYLE_BEAUTY, resolutionStatus: "NEEDS_CONFIRMATION" };
  if (/工业|制造|设备|软件|供应链|工程/.test(text)) return { policy: POLICIES.B2B_INDUSTRIAL, resolutionStatus: "RESOLVED" };
  if (/品牌|零售|消费|食品|服装/.test(text)) return { policy: POLICIES.CONSUMER_BRAND, resolutionStatus: "RESOLVED" };
  if (/门店|本地|服务/.test(text)) return { policy: POLICIES.LOCAL_SERVICE, resolutionStatus: "RESOLVED" };
  return { policy: POLICIES.GENERAL_BUSINESS, resolutionStatus: "RESOLVED" };
}

function sourceCounts(evidence: readonly EvidenceItem[]) {
  const count = (level: string) => evidence.filter((item) => (item.acquisitionLevel ?? "SEARCH_SNIPPET") === level).length;
  return { total: evidence.length, searchSnippet: count("SEARCH_SNIPPET"), crawledPage: count("CRAWLED_PAGE"), officialPage: count("OFFICIAL_PAGE"), officialRegistry: count("OFFICIAL_REGISTRY") };
}

function slotKeywords(slot: string): string[] {
  const matched = [
    [/主体|企业工商|门店主体/, ["工商", "主体", "公司", "统一社会信用"]],
    [/许可|备案/, ["许可", "备案", "执业"]],
    [/医生|专业人员|服务人员/, ["医生", "医师", "专业人员", "服务人员", "团队"]],
    [/服务项目|服务项目和适用范围|服务项目$/, ["项目", "服务项目", "适用范围"]],
    [/风险|注意事项|流程|卫生/, ["风险", "注意事项", "流程", "卫生"]],
    [/设备|耗材/, ["设备", "耗材", "仪器", "品牌"]],
    [/咨询|预约|收费|随访|到店|转化/, ["咨询", "预约", "收费", "随访", "到店", "联系"]],
    [/案例|评价/, ["案例", "评价", "口碑"]],
    [/投诉|纠纷|售后/, ["投诉", "纠纷", "售后"]],
    [/地图|POI|地址|营业时间/, ["地图", "poi", "地址", "营业时间"]],
    [/官网|官方账号|官方入口/, ["官网", "官方网站", "官方账号", "官方"]],
    [/用户决策|常见问题|客户决策/, ["常见问题", "faq", "决策", "选择"]],
    [/产品或服务|服务项目/, ["产品", "服务", "项目"]],
    [/信任|资质|证明/, ["资质", "认证", "证明", "证书"]],
  ].find(([pattern]) => (pattern as RegExp).test(slot));
  return (matched?.[1] as string[] | undefined) ?? [];
}

function hasEvidenceFor(slot: string, evidence: readonly EvidenceItem[]) {
  const keywords = slotKeywords(slot);
  if (keywords.length === 0) return [];
  return evidence
    .filter((item) => {
      const text = `${item.title} ${item.snippet}`.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    })
    .map((item) => item.id);
}

function matrix(policy: Policy, evidence: readonly EvidenceItem[], searchCompleted: boolean): SourceCoverageSlotV1[] {
  return policy.slots.map((title, index) => {
    const evidenceIds = hasEvidenceFor(title, evidence);
    const official = evidenceIds.some((id) => {
      const item = evidence.find((candidate) => candidate.id === id);
      return item?.acquisitionLevel === "OFFICIAL_PAGE" || item?.acquisitionLevel === "OFFICIAL_REGISTRY";
    });
    const status = evidenceIds.length === 0
      ? (searchCompleted ? "NOT_FOUND_IN_CHECKED_SCOPE" : "NOT_CHECKED")
      : (official ? "FOUND" : "PARTIAL");
    return {
      slotId: `slot_${index + 1}`, title, category: index < 2 ? "企业基础" : "客户决策与信任", status,
      evidenceIds, checkedQueries: searchCompleted ? ["本次公开网络检索"] : [],
      sourceTypes: [...new Set(evidence.filter((item) => evidenceIds.includes(item.id)).map((item) => item.sourceType))],
      findingSummary: status === "FOUND" ? "已发现可核验的公开信息。" : status === "PARTIAL" ? "已发现部分公开信息，仍需结合正式材料确认。" : status === "NOT_FOUND_IN_CHECKED_SCOPE" ? "在本次已检查范围中暂未发现。" : "本次尚未完成核验。",
      missingInformation: status === "FOUND" ? "" : `建议补充可公开核验的${title}材料。`,
      recommendedAction: `整理并发布${title}的正式说明或官方入口。`, confidence: official ? 0.8 : evidenceIds.length ? 0.45 : 0.2,
      requiredForFullDiagnosis: true,
    };
  });
}

const READINESS_DIMENSIONS = [
  ["identity", "企业身份与官方入口", 0.15], ["discovery", "本地与公开可发现性", 0.15],
  ["service", "产品或服务信息清晰度", 0.2], ["trust", "信任、资质与证明信息", 0.2],
  ["questions", "客户决策问题覆盖", 0.2], ["conversion", "咨询、预约或合作路径", 0.1],
] as const;

export function buildUniversalLimitedReport(input: DiagnosisInput, evidence: readonly EvidenceItem[], searchCompleted: boolean): LimitedReportDataV1 {
  const selected = selectPolicy(input.industry, input.productOrService);
  const coverage = matrix(selected.policy, evidence, searchCompleted);
  const evidenceCount = sourceCounts(evidence);
  const dimensions = READINESS_DIMENSIONS.map(([id, title, weight], index) => {
    const relevant = coverage[index % coverage.length];
    const status: PublicInformationSlotStatus = relevant?.status === "FOUND" ? "VERIFIED_PRESENT" : relevant?.status === "PARTIAL" ? "PARTIALLY_PRESENT" : relevant?.status === "NOT_FOUND_IN_CHECKED_SCOPE" ? "VERIFIED_MISSING" : "NOT_CHECKED";
    const score = status === "VERIFIED_PRESENT" ? 100 : status === "PARTIALLY_PRESENT" ? 60 : status === "VERIFIED_MISSING" ? 0 : null;
    return { id, title, weight, status, score };
  });
  const checkedWeight = dimensions.filter((dimension) => dimension.score !== null).reduce((total, dimension) => total + dimension.weight, 0);
  const weighted = dimensions.reduce((total, dimension) => total + (dimension.score ?? 0) * dimension.weight, 0);
  const questions = (input.customerQuestions ?? []).map((item) => item.question).filter((question): question is string => typeof question === "string");
  const assets = selected.policy.assets.slice(0, 6).map((title, index) => ({
    title, linkedQuestion: questions[index] ?? "帮助客户快速确认企业服务与决策信息", suggestedContent: ["明确适用对象和服务边界", "标注资料来源与更新时间", "提供下一步咨询或确认入口"],
    businessValue: "降低客户在公开信息中确认关键事实的成本。", evidenceBoundary: "本建议基于本次公开信息覆盖范围，不构成对企业现状的确定性判断。",
  }));
  return {
    readinessScore: { score: checkedWeight >= 0.4 ? Math.round(weighted / checkedWeight) : null, scoreCoverage: checkedWeight, checkedWeight,
      summary: checkedWeight >= 0.4 ? "该指数用于反映本次公开信息建设基础，不代表AI排名、市场份额或经营表现。" : "扫描范围不足，暂不显示准备度分。", // security-check:allow required public boundary copy
      dimensions, algorithmVersion: "public-information-readiness-score.v1" },
    sourceCoverageMatrix: coverage,
    verticalPolicy: { selectedPack: selected.policy.id, resolutionStatus: selected.resolutionStatus, requiredSlots: [...selected.policy.slots], prohibitedClaims: [...selected.policy.prohibitedClaims] },
    questionCoverage: questions.map((question) => ({ question, answerStatus: "当前公开信息可回答程度有限", missingInformation: "缺少可公开核验的集中说明。", recommendedContent: "建立对应问题的结构化说明与咨询入口。" })),
    contentAssetPlans: assets.length >= 2 ? assets : [...assets, ...POLICIES.GENERAL_BUSINESS.assets.slice(assets.length, 2).map((title) => ({ title, linkedQuestion: "帮助客户快速确认企业服务与决策信息", suggestedContent: ["明确适用对象和服务边界", "标注资料来源与更新时间", "提供下一步咨询或确认入口"], businessValue: "降低客户在公开信息中确认关键事实的成本。", evidenceBoundary: "本建议基于本次公开信息覆盖范围，不构成对企业现状的确定性判断。" }))],
    requestedMaterials: ["官网或官方账号", "资质或主体材料", "产品/服务清单", "团队信息", "流程与价格说明", "案例、评价或售后资料"],
    evidenceCounts: evidenceCount, algorithmVersion: "universal-limited-report.v1",
  };
}

export function buildLimitedCanonicalReport(args: {
  diagnosisId: string;
  publicToken: string;
  input: DiagnosisInput;
  evidence: EvidenceItem[];
  searchCompleted: boolean;
  generatedAt: string;
}): DiagnosisReport {
  const limitedReport = buildUniversalLimitedReport(args.input, args.evidence, args.searchCompleted);
  const insufficient = { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE" as const, confidence: 0, evidenceIds: [] };
  return {
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    reportLanguage: "zh-CN",
    diagnosisId: args.diagnosisId,
    publicToken: args.publicToken,
    generatedAt: args.generatedAt,
    companyProfile: {
      brandName: args.input.brandName ?? "待确认企业",
      website: args.input.website,
      industry: args.input.industry ?? "待确认行业",
      productOrService: args.input.productOrService ?? "待确认服务",
      targetRegion: args.input.targetRegion ?? "待确认地区",
      competitors: [],
      unresolvedQuestions: ["本次仅完成公开信息基础扫描，需补充官方材料后开展完整诊断。"],
    },
    scores: { companyClarity: insufficient, websiteCompleteness: insufficient, customerQuestionCoverage: insufficient, trustEvidence: insufficient, aiVisibility: insufficient, overallScore: null, scoreCoverage: 0 },
    aiVisibilityTests: [], strengths: [], coreIssues: [], competitorGaps: [], geoOpportunities: [], demonstrationFix: null,
    questionCoverageAssessments: [], questionCoverageGaps: [], evidence: args.evidence, limitedReport,
  };
}
