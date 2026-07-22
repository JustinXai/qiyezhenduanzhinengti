import type { DiagnosisInput } from "../../runtime/diagnosis-input";

export type ReputationVerticalKey = "EDUCATION" | "GENERAL";

export interface ReputationVerticalPolicy {
  key: ReputationVerticalKey;
  label: string;
  queryTerms: readonly string[];
  riskThemes: readonly string[];
}

export const REPUTATION_SOURCE_CATEGORIES = [
  "黑猫投诉",
  "消费投诉平台",
  "新闻媒体",
  "社交平台",
  "本地生活平台",
  "官方公开渠道",
  "企业自身回应",
] as const;

const COMMON_REPUTATION_TERMS = [
  "评价",
  "口碑",
  "投诉",
  "退款",
  "虚假宣传",
  "霸王条款",
  "消费纠纷",
  "黑猫投诉",
  "消费保",
  "媒体报道",
  "用户评价",
] as const;

export const REPUTATION_VERTICAL_POLICIES: Record<ReputationVerticalKey, ReputationVerticalPolicy> = {
  EDUCATION: {
    key: "EDUCATION",
    label: "教育培训",
    queryTerms: ["退费", "课程缩水", "合同争议", "教学质量", "虚假宣传"],
    riskThemes: ["退费争议", "合同条款争议", "课程交付争议", "教学服务争议", "宣传一致性争议"],
  },
  GENERAL: {
    key: "GENERAL",
    label: "通用企业",
    queryTerms: ["售后", "合同争议", "服务质量", "用户评价", "企业回应"],
    riskThemes: ["服务质量争议", "售后处理争议", "合同条款争议", "宣传一致性争议"],
  },
};

function clean(value: string | undefined | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function selectReputationPolicy(input: Pick<DiagnosisInput, "brandName" | "industry" | "productOrService">): ReputationVerticalPolicy {
  const text = `${input.brandName ?? ""} ${input.industry ?? ""} ${input.productOrService ?? ""}`;
  if (/教育|培训|考研|升学|课程|学校|万学|海文/i.test(text)) return REPUTATION_VERTICAL_POLICIES.EDUCATION;
  return REPUTATION_VERTICAL_POLICIES.GENERAL;
}

export function knownBrandNames(input: Pick<DiagnosisInput, "brandName">): string[] {
  const full = clean(input.brandName);
  if (!full) return [];
  const short = full
    .replace(/(有限责任公司|股份有限公司|有限公司|集团|公司)$/u, "")
    .replace(/^(成都|北京|上海|广州|深圳|重庆|四川|中国)/u, "")
    .trim();
  return Array.from(new Set([full, short].filter((item) => item.length >= 2)));
}

export function buildReputationQueries(input: Pick<DiagnosisInput, "brandName" | "industry" | "productOrService" | "targetRegion">, maxTotal = 8): string[] {
  const names = knownBrandNames(input);
  const company = names[0] ?? clean(input.brandName);
  if (!company) return [];
  const short = names[1] ?? company;
  const region = clean(input.targetRegion);
  const policy = selectReputationPolicy(input);
  const queries = [
    `${company} 评价 口碑 投诉`,
    `${company} 退款 虚假宣传 霸王条款`,
    `${company} 黑猫投诉 消费保`,
    `${company} 消费纠纷 新闻 媒体报道`,
    `${company} 用户评价 企业回应`,
    `${short} ${region} 投诉`.trim(),
    `${company} ${policy.queryTerms.slice(0, 3).join(" ")}`,
    `${short} ${policy.queryTerms.slice(3).join(" ")} 口碑`.trim(),
    ...COMMON_REPUTATION_TERMS.slice(0, 2).map((term) => `${company} ${term}`),
  ];
  const seen = new Set<string>();
  return queries
    .map(clean)
    .filter((query) => query.length > 0 && !seen.has(query) && seen.add(query))
    .slice(0, maxTotal);
}
