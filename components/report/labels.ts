// Display label maps: Canonical enums -> Chinese UI text. Pure lookup tables,
// no logic. Shared by all report components so wording stays consistent.

import type {
  AIVisibilityTest,
  EvidenceSourceType,
  EvidenceSupportLevel,
  MeasurementStatus,
  ScoreDimensionKey,
} from "../../src/contracts";
import { OVERALL_SCORE_LABEL } from "../../src/product/customer-copy";

// These enums are exported from contracts only as Zod values; derive the string
// unions from the AIVisibilityTest shape rather than duplicating them.
type AIVisibilityAccuracy = NonNullable<AIVisibilityTest["accuracy"]>;
type AIVisibilityRecommendationStrength = NonNullable<
  AIVisibilityTest["recommendationStrength"]
>;

/**
 * Frozen name for the composite score (docs/REPORT_CONTRACT.md §1). Re-exported
 * from the single product-copy source (src/product/customer-copy.ts).
 */
export { OVERALL_SCORE_LABEL };

export const DIMENSION_LABELS: Record<ScoreDimensionKey, string> = {
  companyClarity: "企业清晰度",
  websiteCompleteness: "官网完整度",
  customerQuestionCoverage: "客户问题覆盖",
  trustEvidence: "信任证据",
  aiVisibility: "AI 可见度",
};

/** Frozen weights (docs/SCORE_CONTRACT.md) shown for transparency, never recomputed. */
export const DIMENSION_WEIGHT_LABELS: Record<ScoreDimensionKey, string> = {
  companyClarity: "20%",
  websiteCompleteness: "20%",
  customerQuestionCoverage: "25%",
  trustEvidence: "20%",
  aiVisibility: "15%",
};

// Round-5.1 §四/§五 frozen public mappings — RE-EXPORTED from the single
// program source (src/report/presentation/zh-labels.ts). Components must never
// maintain their own translation table.
import {
  ZH_MEASUREMENT_LABEL,
  ZH_SOURCE_TYPE_LABEL,
  ZH_SUPPORT_LABEL,
  zhAuthorityLabel,
  zhSupportLabel,
} from "../../src/report/presentation/zh-labels";

export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = ZH_MEASUREMENT_LABEL;

export const SOURCE_TYPE_LABELS: Record<EvidenceSourceType, string> = ZH_SOURCE_TYPE_LABEL;

// UNSUPPORTED never renders publicly (the presentation service filters those
// items out); zhSupportLabel maps it to the safe fallback for type-completeness.
export const SUPPORT_LEVEL_LABELS: Record<EvidenceSupportLevel, string> = {
  ...ZH_SUPPORT_LABEL,
  UNSUPPORTED: zhSupportLabel("UNSUPPORTED"),
};

export const authorityLabel = zhAuthorityLabel;

export const ACCURACY_LABELS: Record<AIVisibilityAccuracy, string> = {
  ACCURATE: "准确",
  PARTIAL: "部分准确",
  INACCURATE: "不准确",
  NOT_MENTIONED: "未提及",
};

export const RECOMMENDATION_LABELS: Record<AIVisibilityRecommendationStrength, string> = {
  STRONG: "强推荐",
  MODERATE: "中等推荐",
  WEAK: "弱推荐",
  NONE: "无推荐",
};

export const CLAIM_TYPE_LABELS = {
  DIAGNOSTIC_INFERENCE: "诊断推断",
  UNVERIFIED_HYPOTHESIS: "待确认假设",
} as const;

/** Format an ISO timestamp as a plain YYYY-MM-DD date for display. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Round a score for display; null renders as an em dash upstream. */
export function formatScore(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
