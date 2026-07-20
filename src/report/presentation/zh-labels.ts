// ============================================================================
// zh-CN public label maps — THE single program source (Round-5.1 §五).
//
// Every surface that renders an internal enum to a customer (presentation
// service, React components, smoke projections, guards, docs-generating code)
// MUST import from here. Maintaining a second translation table anywhere else
// is a contract violation — the ChinesePublicReportGuard and the UI must never
// drift apart.
// ============================================================================

import type {
  EvidenceItem,
  EvidenceSupportLevel,
  MeasurementStatus,
  ScoreDimensionKey,
} from "../../contracts";

/** MEASUREMENT: internal → 公开中文 (frozen §四 mapping). */
export const ZH_MEASUREMENT_LABEL: Record<MeasurementStatus, string> = {
  MEASURED: "实测",
  ESTIMATED: "公开网页估算",
  INSUFFICIENT_EVIDENCE: "证据不足",
  PROVIDER_FAILED: "暂未测得",
};

/**
 * SUPPORT: internal → 公开中文. UNSUPPORTED is intentionally ABSENT — it must
 * never surface publicly (the presentation service filters those items).
 */
export const ZH_SUPPORT_LABEL: Record<Exclude<EvidenceSupportLevel, "UNSUPPORTED">, string> = {
  DIRECT_SUPPORT: "直接支持",
  PARTIAL_SUPPORT: "部分支持",
  CONTEXT_ONLY: "背景参考",
};

export const ZH_SOURCE_TYPE_LABEL: Record<EvidenceItem["sourceType"], string> = {
  FIRST_PARTY_EVIDENCE: "企业官方来源",
  OBSERVED_WEB_EVIDENCE: "公开网络来源",
  COMPETITOR_WEB_EVIDENCE: "竞品官方来源",
};

/** Evidence content language → customer-facing origin note. */
export const ZH_LANGUAGE_LABEL: Record<"zh" | "other", string> = {
  zh: "中文来源",
  other: "英文官方补充",
};

/** Internal authority levels (OWNED/MEDIA) → Chinese public labels. */
export const ZH_AUTHORITY_LABEL: Record<string, string> = {
  OWNED: "企业自有",
  MEDIA: "第三方媒体",
};

export function zhAuthorityLabel(level: string): string {
  return ZH_AUTHORITY_LABEL[level] ?? "公开来源";
}

export const ZH_DIMENSION_LABEL: Record<ScoreDimensionKey, string> = {
  companyClarity: "企业清晰度",
  websiteCompleteness: "官网完整度",
  customerQuestionCoverage: "客户问题覆盖",
  trustEvidence: "信任证据",
  aiVisibility: "AI 可见度",
};

/** Support label with the UNSUPPORTED-safe fallback (never renders "未支持"). */
export function zhSupportLabel(level: EvidenceSupportLevel): string {
  return level === "UNSUPPORTED" ? ZH_SUPPORT_LABEL.CONTEXT_ONLY : ZH_SUPPORT_LABEL[level];
}

// ---------------------------------------------------------------------------
// Round-7: PublicInformationOpportunity 标签映射
// 来源于 docs/product/ROUND7_QUICK_FIRST_SME_CONVERSION.md
// ---------------------------------------------------------------------------

/** PublicInformationOpportunity 覆盖状态 → 公开中文标签 */
export const ZH_PUBLIC_INFO_COVERAGE_LABEL: Record<
  "PARTIALLY_SUPPORTED" | "UNANSWERED",
  string
> = {
  PARTIALLY_SUPPORTED: "部分覆盖",
  UNANSWERED: "未覆盖",
};

/**
 * Round-7 首屏固定模块标题
 * 源自 docs/product/ROUND7_QUICK_FIRST_SME_CONVERSION.md §四
 */
export const QUICK_FIRST_SCREEN_MODULE = {
  /** 一句话诊断结论 */
  headline: "一句话诊断结论",
  /** 综合分 */
  score: "GEO基础诊断指数",
  /** 测量构成 */
  composition: "实测/公开网页估算构成",
  /** 最重要的公开信息完善机会 */
  topOpportunity: "最重要的公开信息完善机会",
  /** 主 CTA */
  primaryCta: "预约报告解读",
} as const;

/**
 * Round-7.1A Quick 模块标题（用于后续模块）
 * 动态显示，空模块隐藏
 */
export const QUICK_MODULE_TITLES = {
  /** 客户决策问题覆盖 */
  questionCoverage: "客户决策问题覆盖",
  /** 条件性竞品观察 */
  competitorObservation: "条件性竞品观察",
  /** 核心问题 */
  coreIssues: "核心问题",
  /** GEO 机会 */
  geoOpportunities: "GEO 机会",
  /** 优先完善方向 */
  priorityDirections: "优先完善方向",
  /** 建议推进路径 */
  roadmap: "建议推进路径",
  /** 下一步 */
  nextSteps: "下一步",
} as const;

/**
 * Round-7.1A: 客户问题覆盖状态中文标签
 */
export const COVERAGE_STATUS_LABEL: Record<string, string> = {
  FULLY_SUPPORTED: "充分覆盖",
  PARTIALLY_SUPPORTED: "部分覆盖",
  UNANSWERED: "待补充",
};
