// Stage: programmatic scoring of the four non-AI dimensions.
//
// docs/SCORE_CONTRACT.md + docs/PRODUCT_TRUTH_RULES.md: the LLM must NOT emit the
// numeric score. DeepSeek only rates a fixed rubric of criteria PRESENT / PARTIAL /
// ABSENT per dimension; the 0–100 score, measurementStatus and confidence are all
// derived here by deterministic formula from those ratings + the referenced
// evidence quality. `aiVisibility` is scored separately (see ai-visibility.ts).

import type { EvidenceItem, ScoreDimension } from "../../contracts";
import type { QuestionCoverageGap } from "../../contracts";
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import {
  clamp,
  indexEvidence,
  resolveEvidenceIds,
  round2,
  type EvidenceIndex,
} from "./evidence-index";
import {
  DimensionSignalsStageOutput,
  type CriterionRating,
  type DimensionSignal,
} from "./stage-schemas";

/** Non-AI scored dimensions. `aiVisibility` is intentionally excluded here. */
export type NonAiDimensionKey =
  | "companyClarity"
  | "websiteCompleteness"
  | "customerQuestionCoverage"
  | "trustEvidence";

/**
 * Fixed rubric per dimension. The score is fully determined by ratings for THESE
 * keys — a criterion the model omits counts as ABSENT — so the mapping from LLM
 * signal to number is stable and reproducible regardless of how many entries the
 * model returned.
 */
export const DIMENSION_RUBRICS: Record<NonAiDimensionKey, readonly string[]> = {
  companyClarity: ["brandIdentityClear", "offeringClear", "targetCustomerClear", "valuePropositionClear"],
  websiteCompleteness: ["productInfo", "companyBackground", "contactChannel", "processOrPricing", "caseOrProof"],
  customerQuestionCoverage: ["purchaseDecisionQuestions", "comparisonQuestions", "deliveryAndAfterSales", "structuredFaq"],
  trustEvidence: ["thirdPartyCredentials", "verifiableCases", "mediaOrPublicMentions", "customerTestimonials"],
};

const RATING_VALUE: Record<CriterionRating, number> = { PRESENT: 1, PARTIAL: 0.5, ABSENT: 0 };

function scoreFromRubric(rubricKeys: readonly string[], signal: DimensionSignal): number {
  const byKey = new Map<string, CriterionRating>();
  for (const c of signal.criteria) byKey.set(c.key, c.rating);
  let sum = 0;
  for (const key of rubricKeys) {
    const rating = byKey.get(key) ?? "ABSENT";
    sum += RATING_VALUE[rating];
  }
  return Math.round((sum / rubricKeys.length) * 100);
}

function isStrongEvidence(item: EvidenceItem): boolean {
  if (item.supportLevel === "DIRECT_SUPPORT") return true;
  if (item.supportLevel === "PARTIAL_SUPPORT" && item.sourceType === "FIRST_PARTY_EVIDENCE") return true;
  return false;
}

function confidenceFromEvidence(ids: readonly string[], index: EvidenceIndex): number {
  let raw = 0;
  for (const id of ids) {
    const item = index.get(id);
    if (!item) continue;
    if (item.supportLevel === "DIRECT_SUPPORT") raw += 0.35;
    else if (item.supportLevel === "PARTIAL_SUPPORT") raw += 0.15;
    else if (item.supportLevel === "CONTEXT_ONLY") raw += 0.05;
  }
  return round2(clamp(raw, 0, 0.95));
}

function scoreOneDimension(
  rubricKeys: readonly string[],
  signal: DimensionSignal,
  index: EvidenceIndex,
): ScoreDimension {
  const evidenceIds = resolveEvidenceIds(signal.evidenceIds, index);

  // No resolvable evidence → cannot measure or estimate. score stays null (not 0).
  if (evidenceIds.length === 0) {
    return { score: null, measurementStatus: "INSUFFICIENT_EVIDENCE", confidence: 0, evidenceIds: [] };
  }

  const hasStrong = evidenceIds.some((id) => {
    const item = index.get(id);
    return item ? isStrongEvidence(item) : false;
  });
  const measurementStatus = hasStrong ? "MEASURED" : "ESTIMATED";

  const score = scoreFromRubric(rubricKeys, signal);
  let confidence = confidenceFromEvidence(evidenceIds, index);
  // Estimated dimensions rest on weaker evidence → cap stated confidence.
  if (measurementStatus === "ESTIMATED") confidence = round2(Math.min(confidence, 0.6));

  return { score, measurementStatus, confidence, evidenceIds };
}

export type NonAiScoreBlock = Record<NonAiDimensionKey, ScoreDimension>;

export function scoreNonAiDimensions(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
): StageParseResult<NonAiScoreBlock> {
  const parsed = parseStageJson("dimension_signals", DimensionSignalsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const s = parsed.value;
  const value: NonAiScoreBlock = {
    companyClarity: scoreOneDimension(DIMENSION_RUBRICS.companyClarity, s.companyClarity, index),
    websiteCompleteness: scoreOneDimension(DIMENSION_RUBRICS.websiteCompleteness, s.websiteCompleteness, index),
    customerQuestionCoverage: scoreOneDimension(
      DIMENSION_RUBRICS.customerQuestionCoverage,
      s.customerQuestionCoverage,
      index,
    ),
    trustEvidence: scoreOneDimension(DIMENSION_RUBRICS.trustEvidence, s.trustEvidence, index),
  };
  return { ok: true, value };
}

// ============================================================================
// Round-7: QuestionCoverageGap deterministic generation
// 来源于 customerQuestionCoverage 维度的 rubric 评估
// 每个 ABSENT 或 PARTIAL 的 criterion 映射为一个 QuestionCoverageGap
// Question Identity: questionId 来自稳定的 criterion key
// questionText 可来自 geoOpportunities.customerQuestion（用户原始问题）
// 不增加 Bocha/Crawler/DeepSeek 调用
// ============================================================================

/** 客户问题的固定集合（对应 customerQuestionCoverage 维度的 rubric） */
const CUSTOMER_QUESTION_MAP: Record<string, {
  question: string;
  scopeTemplate: () => string;
  missingTemplate: () => string;
  actionTemplate: () => string;
  valueTemplate: () => string;
}> = {
  purchaseDecisionQuestions: {
    question: "客户在购买前会问什么问题",
    scopeTemplate: () => "官网有部分采购决策问题相关内容，但不够系统和完整",
    missingTemplate: () => "系统化的采购决策问题内容",
    actionTemplate: () => "建立产品选购FAQ，补充采购决策问题说明",
    valueTemplate: () => "帮助客户快速了解产品特点，提升购买决策效率",
  },
  comparisonQuestions: {
    question: "客户在比较供应商时会问什么问题",
    scopeTemplate: () => "官网有部分供应商对比问题相关内容",
    missingTemplate: () => "完整的供应商对比问题和对比信息",
    actionTemplate: () => "补充选型对比指南和差异化说明",
    valueTemplate: () => "帮助客户做出更好的选择决策",
  },
  deliveryAndAfterSales: {
    question: "客户关心交付和售后服务吗",
    scopeTemplate: () => "官网有部分交付与售后问题信息",
    missingTemplate: () => "完整的交付与售后问题说明",
    actionTemplate: () => "建立售后服务页面或明确客服联系方式",
    valueTemplate: () => "降低客户购买顾虑，提升信任度",
  },
  structuredFaq: {
    question: "官网有结构化的常见问题解答吗",
    scopeTemplate: () => "官网没有系统化的FAQ结构",
    missingTemplate: () => "结构化的FAQ页面和内容",
    actionTemplate: () => "建立FAQ页面，按主题组织常见问题",
    valueTemplate: () => "减少售前咨询成本，提升客户自助能力",
  },
};

/**
 * 用户问题分类到 rubric criterion 的确定性映射。
 * 使用字符串相似度匹配，不猜测映射。
 */
function matchCustomerQuestionToCriterion(
  question: string,
  criterionMap: Record<string, { question: string }>,
): string | null {
  // 确定性关键词匹配
  const keyMap: Array<[string[], string]> = [
    [["采购", "购买", "选购", "选型", "选择", "供应商"], "purchaseDecisionQuestions"],
    [["对比", "比较", "差异", "区别", "竞品", "竞争", "竞争对手"], "comparisonQuestions"],
    [["交付", "售后", "服务", "保修", "客服", "周期"], "deliveryAndAfterSales"],
    [["faq", "常见问题", "FAQ", "问答"], "structuredFaq"],
  ];

  for (const [keywords, criterionKey] of keyMap) {
    if (keywords.some((kw) => question.includes(kw))) {
      return criterionKey in criterionMap ? criterionKey : null;
    }
  }
  return null;
}

/**
 * 根据 matchedCriterionKey 获取对应的 scope/action 模板。
 */
function getTemplateForCriterion(criterionKey: string | null): {
  scopeTemplate: () => string;
  missingTemplate: () => string;
  actionTemplate: () => string;
  valueTemplate: () => string;
} | null {
  if (!criterionKey) return null;
  return CUSTOMER_QUESTION_MAP[criterionKey] ?? null;
}

/**
 * 从 QuestionCoverageAssessment 生成 QuestionCoverageGap。
 * Round-7.1A: 每个 Assessment 最多派生一个 Gap。
 */
export function buildQuestionCoverageGapsFromAssessments(
  assessments: readonly { questionId: string; questionText: string; matchedCriterionKey: string | null; status: "FULLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNANSWERED"; evidenceIds: string[] }[],
): QuestionCoverageGap[] {
  const gaps: QuestionCoverageGap[] = [];

  for (const assessment of assessments) {
    // 只处理 PARTIALLY_SUPPORTED 或 UNANSWERED
    if (assessment.status === "FULLY_SUPPORTED") continue;

    const template = getTemplateForCriterion(assessment.matchedCriterionKey);
    const observedScope = template?.scopeTemplate() ?? "本次已检查的公开页面和搜索结果中，该问题尚未得到充分回答";
    const missingInformation = template?.missingTemplate() ?? "相关公开信息";
    const suggestedAction = template?.actionTemplate() ?? "建议补充相关公开信息";
    const businessValue = template?.valueTemplate() ?? "帮助客户和AI更好地了解企业";

    gaps.push({
      questionId: assessment.questionId,
      questionText: assessment.questionText,
      coverageStatus: assessment.status,
      observedScope,
      missingInformation,
      suggestedAction,
      businessValue,
      evidenceIds: assessment.evidenceIds,
    });
  }

  return gaps;
}

/**
 * 从 geoOpportunities 构建 QuestionCoverageAssessment。
 * 用于向后兼容（当 customerQuestions 不可用时）。
 * 注意：这不是真实的问题身份，只是用于 gap 生成。
 * @deprecated Use buildAssessmentsFromCustomerQuestions instead
 */
export function buildAssessmentsFromGeoOpportunities(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
  geoOpportunities?: readonly { customerQuestion: string }[],
): StageParseResult<Array<{ questionId: string; questionText: string; matchedCriterionKey: string | null; status: "FULLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNANSWERED"; evidenceIds: string[] }>> {
  const parsed = parseStageJson("dimension_signals", DimensionSignalsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const signals = parsed.value.customerQuestionCoverage;
  const evidenceIds = resolveEvidenceIds(signals.evidenceIds, index);

  // 建立 criterion key -> rating 的映射
  const criterionRatings = new Map<string, CriterionRating>();
  for (const c of signals.criteria) {
    criterionRatings.set(c.key, c.rating);
  }

  const assessments: Array<{ questionId: string; questionText: string; matchedCriterionKey: string | null; status: "FULLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNANSWERED"; evidenceIds: string[] }> = [];

  if (geoOpportunities) {
    for (const opp of geoOpportunities) {
      const matchedKey = matchCustomerQuestionToCriterion(opp.customerQuestion, CUSTOMER_QUESTION_MAP);
      const rating = matchedKey ? criterionRatings.get(matchedKey) : undefined;
      const status = rating === "PRESENT" ? "FULLY_SUPPORTED"
        : rating === "PARTIAL" ? "PARTIALLY_SUPPORTED"
        : "UNANSWERED";

      assessments.push({
        questionId: matchedKey ? `q_${matchedKey}` : `q_${simpleHash(opp.customerQuestion)}`,
        questionText: opp.customerQuestion,
        matchedCriterionKey: matchedKey,
        status,
        evidenceIds: matchedKey ? evidenceIds : [],
      });
    }
  }

  return { ok: true, value: assessments };
}

/**
 * 从 customerQuestions 构建 QuestionCoverageAssessment。
 * Round-7.1A: 使用稳定的 questionId 和原始问题文本。
 */
export function buildAssessmentsFromCustomerQuestions(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
  customerQuestions: readonly { questionId: string; questionText: string }[],
): StageParseResult<Array<{ questionId: string; questionText: string; matchedCriterionKey: string | null; status: "FULLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNANSWERED"; evidenceIds: string[] }>> {
  const parsed = parseStageJson("dimension_signals", DimensionSignalsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const signals = parsed.value.customerQuestionCoverage;
  const evidenceIds = resolveEvidenceIds(signals.evidenceIds, index);

  // 建立 criterion key -> rating 的映射
  const criterionRatings = new Map<string, CriterionRating>();
  for (const c of signals.criteria) {
    criterionRatings.set(c.key, c.rating);
  }

  const assessments: Array<{ questionId: string; questionText: string; matchedCriterionKey: string | null; status: "FULLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNANSWERED"; evidenceIds: string[] }> = [];

  for (const cq of customerQuestions) {
    const matchedKey = matchCustomerQuestionToCriterion(cq.questionText, CUSTOMER_QUESTION_MAP);
    const rating = matchedKey ? criterionRatings.get(matchedKey) : undefined;
    const status = rating === "PRESENT" ? "FULLY_SUPPORTED"
      : rating === "PARTIAL" ? "PARTIALLY_SUPPORTED"
      : "UNANSWERED";

    assessments.push({
      questionId: cq.questionId,
      questionText: cq.questionText,
      matchedCriterionKey: matchedKey,
      status,
      evidenceIds: matchedKey ? evidenceIds : [],
    });
  }

  return { ok: true, value: assessments };
}

/**
 * 简单哈希函数用于生成稳定的 ID。
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;
  }
  const positiveHash = hash >>> 0;
  return positiveHash.toString(36);
}

/**
 * 旧版函数：保持向后兼容。
 * @deprecated Use buildQuestionCoverageGapsFromAssessments instead
 */
export function buildQuestionCoverageGaps(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
  geoOpportunities?: readonly { customerQuestion: string }[],
): StageParseResult<QuestionCoverageGap[]> {
  const assessmentsResult = buildAssessmentsFromGeoOpportunities(evidence, deepSeekJson, geoOpportunities);
  if (!assessmentsResult.ok) return assessmentsResult;

  const gaps = buildQuestionCoverageGapsFromAssessments(assessmentsResult.value);
  return { ok: true, value: gaps };
}
