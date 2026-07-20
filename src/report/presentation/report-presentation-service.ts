// ============================================================================
// ReportPresentationService — pure projection of one Canonical DiagnosisReport
// into Quick / Deep / Evidence view models.
//
// This is the ONLY place selection logic lives (docs/ARCHITECTURE.md "禁止"):
//   - topStrength / topIssue / topOpportunity are RANKED here, never `array[0]`.
//   - Competitor gap availability is decided here (evidence-gated); insufficient
//     evidence yields { available: false, reason } — never an empty table.
//   - coreIssues / geoOpportunities are capped here.
//   - measurementStatusSummary / headlineConclusion prose is composed here.
//
// Round-7.1A: AI visibility samples removed from Quick (only in Deep).
//
// It NEVER: recomputes scores, re-interprets AI tests, calls a provider, or
// fabricates content. Every field is derived from data already present on the
// Canonical report.
// ============================================================================

import type {
  AIVisibilityTest,
  CoreIssue,
  DeepReportViewModel,
  DiagnosisReport,
  EvidenceItem,
  EvidenceSupportLevel,
  QuickReportViewModel,
  EvidenceViewModel,
  Strength,
  QuestionCoverageGap,
  QuestionCoverageAssessment,
  QuestionCoverageStats,
  KeyCustomerQuestion,
  PriorityDirection,
} from "../../contracts";
import { sanitizeEvidenceUrl } from "./evidence-url";
import {
  computeMeasurementComposition,
  estimationNoticeFor,
} from "./measurement-composition";
import {
  ZH_LANGUAGE_LABEL,
  ZH_MEASUREMENT_LABEL,
  ZH_SOURCE_TYPE_LABEL,
  ZH_SUPPORT_LABEL,
} from "./zh-labels";

// `CompetitorGap` is exported from contracts only as a Zod value; derive the
// element type from the Canonical report to avoid duplicating the shape.
type CompetitorGap = DiagnosisReport["competitorGaps"][number];

// ---------------------------------------------------------------------------
// Frozen prose constants (mirrors docs/REPORT_CONTRACT.md §3).
// ---------------------------------------------------------------------------

/** Shown when competitors were provided but public evidence is insufficient. */
export const COMPETITOR_INSUFFICIENT_EVIDENCE_REASON =
  "已收到竞品输入,但本次公开证据不足,暂不做确定性比较。";

/** Shown when no competitor was provided at all. */
export const COMPETITOR_NOT_PROVIDED_REASON = "本次未提供竞品,暂不做竞品比较。";

const QUICK_CORE_ISSUE_LIMIT = 3;
const QUICK_GEO_OPPORTUNITY_LIMIT = 3;
const DEEP_GEO_OPPORTUNITY_LIMIT = 5;
const MIN_VALID_AI_TESTS = 3;
const MAX_KEY_QUESTIONS = 3;

// ---------------------------------------------------------------------------
// Evidence indexing helpers
// ---------------------------------------------------------------------------

type EvidenceIndex = ReadonlyMap<string, EvidenceItem>;

function indexEvidence(report: DiagnosisReport): EvidenceIndex {
  const map = new Map<string, EvidenceItem>();
  for (const item of report.evidence) {
    map.set(item.id, item);
  }
  return map;
}

function countSupport(
  evidenceIds: readonly string[],
  index: EvidenceIndex,
  level: EvidenceSupportLevel,
): number {
  let n = 0;
  for (const id of evidenceIds) {
    if (index.get(id)?.supportLevel === level) n += 1;
  }
  return n;
}

/** True when at least one referenced evidence item semantically supports a claim. */
function hasSemanticSupport(evidenceIds: readonly string[], index: EvidenceIndex): boolean {
  return evidenceIds.some((id) => {
    const level = index.get(id)?.supportLevel;
    return level === "DIRECT_SUPPORT" || level === "PARTIAL_SUPPORT";
  });
}

// ---------------------------------------------------------------------------
// Claim ranking (shared by strengths / core issues / opportunities)
//
// Ranking is deterministic and stable. It NEVER re-scores; it orders claims the
// report already deemed publishable by how well each is evidenced:
//   1. DIAGNOSTIC_INFERENCE outranks UNVERIFIED_HYPOTHESIS.
//   2. More DIRECT_SUPPORT evidence outranks less.
//   3. More PARTIAL_SUPPORT evidence outranks less.
//   4. More total evidence outranks less.
//   5. Original array order breaks remaining ties (stable).
// ---------------------------------------------------------------------------

interface RankableClaim {
  claimType: "DIAGNOSTIC_INFERENCE" | "UNVERIFIED_HYPOTHESIS";
  evidenceIds: readonly string[];
}

function claimRankKey(claim: RankableClaim, index: EvidenceIndex): number[] {
  const claimTypeRank = claim.claimType === "DIAGNOSTIC_INFERENCE" ? 0 : 1;
  return [
    claimTypeRank, // lower is better
    -countSupport(claim.evidenceIds, index, "DIRECT_SUPPORT"),
    -countSupport(claim.evidenceIds, index, "PARTIAL_SUPPORT"),
    -claim.evidenceIds.length,
  ];
}

function rankClaims<T extends RankableClaim>(claims: readonly T[], index: EvidenceIndex): T[] {
  return claims
    .map((claim, originalIndex) => ({ claim, originalIndex, key: claimRankKey(claim, index) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        const diff = (a.key[i] ?? 0) - (b.key[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return a.originalIndex - b.originalIndex; // stable
    })
    .map((entry) => entry.claim);
}

// ---------------------------------------------------------------------------
// AI visibility sample selection (for Deep only in Round-7.1A)
//   Priority: PURCHASE_DECISION > COMPETITOR_COMPARISON > BRAND_DIRECT > OTHER.
//   Only VALID tests may surface.
// ---------------------------------------------------------------------------

const AI_CATEGORY_PRIORITY: Record<AIVisibilityTest["questionCategory"], number> = {
  PURCHASE_DECISION: 0,
  COMPETITOR_COMPARISON: 1,
  BRAND_DIRECT: 2,
  OTHER: 3,
};

function selectValidAiTests(tests: readonly AIVisibilityTest[]): AIVisibilityTest[] {
  return tests
    .map((test, originalIndex) => ({ test, originalIndex }))
    .filter((entry) => entry.test.status === "VALID")
    .sort((a, b) => {
      const diff =
        AI_CATEGORY_PRIORITY[a.test.questionCategory] - AI_CATEGORY_PRIORITY[b.test.questionCategory];
      return diff !== 0 ? diff : a.originalIndex - b.originalIndex; // stable
    })
    .map((entry) => entry.test);
}

// ---------------------------------------------------------------------------
// Competitor gap availability
// ---------------------------------------------------------------------------

type CompetitorGapSummary = QuickReportViewModel["competitorGapSummary"];

/** Gaps whose referenced evidence semantically supports a comparison. */
function selectValidCompetitorGaps(
  report: DiagnosisReport,
  index: EvidenceIndex,
): CompetitorGap[] {
  return report.competitorGaps.filter((gap) => hasSemanticSupport(gap.evidenceIds, index));
}

function buildCompetitorGapSummary(
  report: DiagnosisReport,
  index: EvidenceIndex,
): CompetitorGapSummary {
  const competitorsProvided = report.companyProfile.competitors.length > 0;
  const validGaps = selectValidCompetitorGaps(report, index);

  if (competitorsProvided && validGaps.length > 0) {
    return { available: true, gaps: validGaps };
  }
  // In Quick, hide competitor module entirely when not available
  // Reason note only shown in Deep's measurement boundaries
  return { available: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Prose composition (measurement summary + headline)
// ---------------------------------------------------------------------------

const SCORE_DIMENSION_ORDER = [
  "companyClarity",
  "websiteCompleteness",
  "customerQuestionCoverage",
  "trustEvidence",
  "aiVisibility",
] as const;

const DIMENSION_LABEL: Record<(typeof SCORE_DIMENSION_ORDER)[number], string> = {
  companyClarity: "企业清晰度",
  websiteCompleteness: "官网完整度",
  customerQuestionCoverage: "客户问题覆盖",
  trustEvidence: "信任证据",
  aiVisibility: "AI 可见度",
};

// Round-5.1 §四/§五 frozen public mappings — imported from the SINGLE program
// source (./zh-labels); no surface maintains its own translation table.
const MEASUREMENT_LABEL = ZH_MEASUREMENT_LABEL;
const SUPPORT_PUBLIC_LABEL = ZH_SUPPORT_LABEL;
const SOURCE_TYPE_PUBLIC_LABEL = ZH_SOURCE_TYPE_LABEL;

function buildMeasurementStatusSummary(report: DiagnosisReport): string {
  const counts = new Map<keyof typeof MEASUREMENT_LABEL, number>();
  for (const dim of SCORE_DIMENSION_ORDER) {
    const status = report.scores[dim].measurementStatus;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const status of Object.keys(MEASUREMENT_LABEL) as (keyof typeof MEASUREMENT_LABEL)[]) {
    const n = counts.get(status);
    if (n) parts.push(`${MEASUREMENT_LABEL[status]} ${n} 项`);
  }
  return `本次 5 项评分指标中,${parts.join(",")}。`;
}

function toPercent(coverage: number): number {
  return Math.round(coverage * 100);
}

// ---------------------------------------------------------------------------
// Round-7.1A: Deterministic clustering for Priority Directions
// ---------------------------------------------------------------------------

type GapCategory =
  | "PRODUCT_SELECTION"
  | "QUALITY_AND_SAFETY"
  | "BUSINESS_COOPERATION"
  | "SERVICE_AND_DELIVERY"
  | "CASES_AND_TRUST"
  | "FAQ_OTHER";

const CATEGORY_KEYWORDS: Record<GapCategory, readonly string[]> = {
  PRODUCT_SELECTION: ["口味", "规格", "保质期", "过敏原", "选购", "选型", "对比", "价格", "报价"],
  QUALITY_AND_SAFETY: ["原料", "工艺", "食品安全", "生产", "认证", "资质", "检测", "标准"],
  BUSINESS_COOPERATION: ["团购", "采购", "经销", "商超", "代工", "合作", "渠道", "代理", "招商"],
  SERVICE_AND_DELIVERY: ["交付", "售后", "服务", "保修", "流程", "周期", "发货", "配送"],
  CASES_AND_TRUST: ["案例", "客户", "合作品牌", "口碑", "评价", "推荐"],
  FAQ_OTHER: [],
};

const CONTENT_ASSET_MAP: Record<GapCategory, string> = {
  PRODUCT_SELECTION: "产品选购与规格FAQ",
  QUALITY_AND_SAFETY: "原料、工艺与食品安全说明页",
  BUSINESS_COOPERATION: "企业团购、渠道与合作流程页",
  SERVICE_AND_DELIVERY: "服务流程与售后FAQ",
  CASES_AND_TRUST: "案例、资质与信任证据页",
  FAQ_OTHER: "围绕该客户问题建立独立FAQ",
};

function classifyQuestion(questionText: string): GapCategory {
  const lowerText = questionText.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lowerText.includes(kw))) {
      return category as GapCategory;
    }
  }
  return "FAQ_OTHER";
}

interface ClusteredGap {
  category: GapCategory;
  gaps: QuestionCoverageGap[];
}

function clusterGapsByCategory(gaps: QuestionCoverageGap[]): ClusteredGap[] {
  const clusters = new Map<GapCategory, QuestionCoverageGap[]>();

  for (const gap of gaps) {
    const category = classifyQuestion(gap.questionText);
    const existing = clusters.get(category) ?? [];
    clusters.set(category, [...existing, gap]);
  }

  return Array.from(clusters.entries())
    .map(([category, categoryGaps]) => ({ category, gaps: categoryGaps }))
    .sort((a, b) => {
      // Priority order: gaps with UNANSWERED first, then PARTIALLY_SUPPORTED
      const aScore = a.gaps.some((g) => g.coverageStatus === "UNANSWERED") ? 0 : 1;
      const bScore = b.gaps.some((g) => g.coverageStatus === "UNANSWERED") ? 0 : 1;
      return aScore - bScore;
    });
}

function buildPriorityDirections(clusters: ClusteredGap[]): PriorityDirection[] {
  // Priority direction categories in order
  const PRIORITY_ORDER: GapCategory[] = [
    "BUSINESS_COOPERATION",
    "PRODUCT_SELECTION",
    "SERVICE_AND_DELIVERY",
    "QUALITY_AND_SAFETY",
    "CASES_AND_TRUST",
    "FAQ_OTHER",
  ];

  const sortedClusters = clusters.sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.category) - PRIORITY_ORDER.indexOf(b.category),
  );

  return sortedClusters.map((cluster) => ({
    directionTitle: CONTENT_ASSET_MAP[cluster.category],
    directionCategory: cluster.category,
    coveredQuestions: cluster.gaps.map((g) => g.questionText),
    suggestedContentAsset: CONTENT_ASSET_MAP[cluster.category],
    businessValue: cluster.gaps.map((g) => g.businessValue).join("；"),
  }));
}

// ---------------------------------------------------------------------------
// Round-7.1A: Question Coverage Stats & Key Questions
// ---------------------------------------------------------------------------

function buildQuestionCoverageStats(
  assessments: QuestionCoverageAssessment[] | undefined,
  gaps: QuestionCoverageGap[] | undefined,
): QuestionCoverageStats {
  // Use assessments if available
  if (assessments && assessments.length > 0) {
    return {
      totalQuestions: assessments.length,
      fullySupportedCount: assessments.filter((a) => a.status === "FULLY_SUPPORTED").length,
      partiallySupportedCount: assessments.filter((a) => a.status === "PARTIALLY_SUPPORTED").length,
      unansweredCount: assessments.filter((a) => a.status === "UNANSWERED").length,
    };
  }

  // When assessments are not available, derive from gaps
  // but set fullySupportedCount to 0 (cannot determine without assessments)
  const gapTotal = gaps?.length ?? 0;
  const unanswered = gaps?.filter((g) => g.coverageStatus === "UNANSWERED").length ?? 0;
  const partial = gaps?.filter((g) => g.coverageStatus === "PARTIALLY_SUPPORTED").length ?? 0;

  return {
    totalQuestions: gapTotal,
    fullySupportedCount: 0, // Cannot determine without assessments
    partiallySupportedCount: partial,
    unansweredCount: unanswered,
  };
}

/**
 * Build a restrained message when assessments are not available.
 * This is shown instead of the stat grid when questionCoverageAssessments is missing.
 */
export function buildQuestionCoverageRestrainedMessage(
  assessments: QuestionCoverageAssessment[] | undefined,
  gaps: QuestionCoverageGap[] | undefined,
): string | null {
  // Only show restrained message when assessments are missing and we have gaps
  if (assessments && assessments.length > 0) return null;
  if (!gaps || gaps.length === 0) return null;

  const gapTotal = gaps.length;
  return `本次已检查${gapTotal}个客户决策问题，部分问题的公开信息覆盖情况仍需进一步确认。`;
}

function buildKeyCustomerQuestions(
  gaps: QuestionCoverageGap[] | undefined,
  index: EvidenceIndex,
): KeyCustomerQuestion[] {
  if (!gaps || gaps.length === 0) return [];

  // Select questions to display: prioritize UNANSWERED, then PARTIALLY_SUPPORTED
  const sorted = [...gaps].sort((a, b) => {
    const order = { UNANSWERED: 0, PARTIALLY_SUPPORTED: 1, FULLY_SUPPORTED: 2 };
    return order[a.coverageStatus] - order[b.coverageStatus];
  });

  return sorted.slice(0, MAX_KEY_QUESTIONS).map((gap) => ({
    questionId: gap.questionId,
    questionText: gap.questionText,
    coverageStatus: gap.coverageStatus,
    publicInfoSituation: gap.observedScope,
    suggestedContentType: gap.missingInformation,
    evidenceIds: gap.evidenceIds.filter((id: string) => index.has(id)),
  }));
}

// ---------------------------------------------------------------------------
// Round-7.1A: Headline Conclusion Composition
// ---------------------------------------------------------------------------

function buildHeadlineConclusion(
  report: DiagnosisReport,
  topStrength: Strength | null,
  topIssue: CoreIssue | null,
  stats: QuestionCoverageStats,
): string {
  const brand = report.companyProfile.brandName;
  const productService = report.companyProfile.productOrService;
  const coveragePct = toPercent(report.scores.scoreCoverage);
  const overall = report.scores.overallScore;

  if (overall === null) {
    return `『${brand}』本次可测指标覆盖 ${coveragePct}%,尚不足以给出综合指数,建议先补齐关键信息后复测。`;
  }

  // Identify the most important info gap
  const infoGap = topIssue
    ? topIssue.statement
    : stats.unansweredCount > 0
      ? `有 ${stats.unansweredCount} 个客户关键问题尚未得到充分回答`
      : stats.partiallySupportedCount > 0
        ? `有 ${stats.partiallySupportedCount} 个客户关键问题部分覆盖`
        : "公开信息基本覆盖核心客户问题";

  // Identify enterprise basis
  const enterpriseBasis = topStrength
    ? topStrength.statement
    : "公开网络已能识别企业基础信息";

  // Impact on customer decision
  const decisionImpact = stats.unansweredCount > 0
    ? "客户在选购或合作决策时难以一次获得完整答案"
    : stats.partiallySupportedCount > 0
      ? "客户在关键决策阶段可能需要额外咨询才能获得完整信息"
      : "客户能够较为完整地了解企业核心信息";

  return `『${brand}』${enterpriseBasis}，但${infoGap}，${decisionImpact}。`;
}

// ---------------------------------------------------------------------------
// Deep measurement notes
// ---------------------------------------------------------------------------

function buildMeasurementNotes(
  report: DiagnosisReport,
  validAiTests: readonly AIVisibilityTest[],
): string[] {
  const notes: string[] = [];

  // AI visibility framing — always present so Deep can never over-claim.
  const modelUsed = validAiTests[0]?.modelUsed ?? report.aiVisibilityTests[0]?.modelUsed;
  notes.push(
    modelUsed
      ? `本报告的 AI 问答为当前模型(${modelUsed})、当前时间、当前问题集下的诊断样本,不代表多平台市场份额或全网 AI 推荐率。`
      : "本报告的 AI 问答为当前模型、当前时间、当前问题集下的诊断样本,不代表多平台市场份额或全网 AI 推荐率。",
  );

  if (validAiTests.length < MIN_VALID_AI_TESTS) {
    notes.push(
      `有效 AI 问答样本为 ${validAiTests.length} 项(少于 ${MIN_VALID_AI_TESTS} 项),AI 可见度分数与置信度已按契约下调处理。`,
    );
  }

  const excludedAiTests = report.aiVisibilityTests.length - validAiTests.length;
  if (excludedAiTests > 0) {
    notes.push(`另有 ${excludedAiTests} 项 AI 问答因证据不足或采集失败,未纳入有效样本。`);
  }

  // Competitor note when gaps unavailable
  const competitorsProvided = report.companyProfile.competitors.length > 0;
  const validGaps = selectValidCompetitorGaps(report, indexEvidence(report));
  if (competitorsProvided && validGaps.length === 0) {
    notes.push(COMPETITOR_INSUFFICIENT_EVIDENCE_REASON);
  }

  // Per-dimension measurement caveats for anything not directly MEASURED.
  for (const dim of SCORE_DIMENSION_ORDER) {
    const d = report.scores[dim];
    if (d.measurementStatus !== "MEASURED") {
      notes.push(
        `『${DIMENSION_LABEL[dim]}』为${MEASUREMENT_LABEL[d.measurementStatus]}状态,置信度 ${d.confidence.toFixed(2)}。`,
      );
    }
  }

  if (report.scores.scoreCoverage < 1) {
    notes.push(`本次评分覆盖率为 ${toPercent(report.scores.scoreCoverage)}%,未覆盖维度不计入综合指数。`);
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Public projections
// ---------------------------------------------------------------------------

export function toQuickReportViewModel(report: DiagnosisReport): QuickReportViewModel {
  const index = indexEvidence(report);

  const rankedStrengths = rankClaims(report.strengths, index);
  const rankedIssues = rankClaims(report.coreIssues, index);
  const rankedOpportunities = rankClaims(report.geoOpportunities, index);

  const topStrength = rankedStrengths[0] ?? null;
  const topIssue = rankedIssues[0] ?? null;
  const topOpportunity = rankedOpportunities[0] ?? null;

  const composition = computeMeasurementComposition(report.scores);

  // Round-7.1A: Build question coverage data
  const stats = buildQuestionCoverageStats(
    report.questionCoverageAssessments,
    report.questionCoverageGaps,
  );
  const restrainedMessage = buildQuestionCoverageRestrainedMessage(
    report.questionCoverageAssessments,
    report.questionCoverageGaps,
  );
  const keyQuestions = buildKeyCustomerQuestions(report.questionCoverageGaps, index);

  // Round-7.1A: Cluster gaps into priority directions
  const gapsToCluster = (report.questionCoverageGaps ?? []).filter(
    (g) => g.coverageStatus === "PARTIALLY_SUPPORTED" || g.coverageStatus === "UNANSWERED",
  );
  const clusters = clusterGapsByCategory(gapsToCluster);
  const priorityDirections = buildPriorityDirections(clusters);

  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: report.reportLanguage,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    headlineConclusion: buildHeadlineConclusion(report, topStrength, topIssue, stats),
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: buildMeasurementStatusSummary(report),
    measurementComposition: composition,
    estimationNotice: estimationNoticeFor(composition),
    topStrength,
    topIssue,
    topOpportunity,
    // Round-7.1A: Competitor gaps - only show when available
    competitorGapSummary: buildCompetitorGapSummary(report, index),
    coreIssues: rankedIssues.slice(0, QUICK_CORE_ISSUE_LIMIT),
    demonstrationFix: report.demonstrationFix,
    geoOpportunities: rankedOpportunities.slice(0, QUICK_GEO_OPPORTUNITY_LIMIT),
    // Round-7.1A: New question coverage fields
    questionCoverageStats: stats,
    questionCoverageRestrainedMessage: restrainedMessage,
    keyCustomerQuestions: keyQuestions,
    priorityDirections,
  };
}

export function toDeepReportViewModel(report: DiagnosisReport): DeepReportViewModel {
  const index = indexEvidence(report);
  const validAiTests = selectValidAiTests(report.aiVisibilityTests);

  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    companyProfile: report.companyProfile,
    scores: report.scores,
    // §八: Deep shows the SAME composition Quick shows — projected once here,
    // never recomputed by the front-end.
    measurementComposition: computeMeasurementComposition(report.scores),
    // AI visibility test samples - shown with title "当前模型问答样本（仅供参考）"
    aiVisibilityTests: validAiTests,
    strengths: rankClaims(report.strengths, index),
    coreIssues: rankClaims(report.coreIssues, index),
    competitorGaps: selectValidCompetitorGaps(report, index),
    geoOpportunities: rankClaims(report.geoOpportunities, index).slice(0, DEEP_GEO_OPPORTUNITY_LIMIT),
    measurementNotes: buildMeasurementNotes(report, validAiTests),
  };
}

/** Chinese customer summary for one evidence item (title/snippet keep原语言). */
function buildEvidenceSummaryZh(item: EvidenceItem): string {
  const source = SOURCE_TYPE_PUBLIC_LABEL[item.sourceType];
  const support =
    item.supportLevel === "UNSUPPORTED" ? "背景参考" : SUPPORT_PUBLIC_LABEL[item.supportLevel];
  return `来自 ${item.sourceDomain} 的${source},在本报告中作为${support}证据使用。`;
}

export function toEvidenceViewModel(report: DiagnosisReport): EvidenceViewModel {
  return {
    items: report.evidence
      // §四: UNSUPPORTED never surfaces in the public evidence list.
      .filter((item) => item.supportLevel !== "UNSUPPORTED")
      .map((item) => ({
        id: item.id,
        title: item.title,
        sourceDomain: item.sourceDomain,
        sourceType: item.sourceType,
        authorityLevel: item.authorityLevel,
        supportLevel: item.supportLevel,
        fetchedAt: item.fetchedAt,
        snippet: item.snippet,
        url: sanitizeEvidenceUrl(item.url),
        summaryZh: buildEvidenceSummaryZh(item),
        supportLabel: SUPPORT_PUBLIC_LABEL[item.supportLevel as Exclude<EvidenceSupportLevel, "UNSUPPORTED">],
        sourceTypeLabel: SOURCE_TYPE_PUBLIC_LABEL[item.sourceType],
        // 中文来源 / 英文官方补充 — only when the registry recorded a language.
        ...(item.language ? { languageLabel: ZH_LANGUAGE_LABEL[item.language] } : {}),
      })),
  };
}

export interface ReportPresentation {
  quick: QuickReportViewModel;
  deep: DeepReportViewModel;
  evidence: EvidenceViewModel;
}

/** Project a Canonical report into all three read view models in one pass. */
export function presentReport(report: DiagnosisReport): ReportPresentation {
  return {
    quick: toQuickReportViewModel(report),
    deep: toDeepReportViewModel(report),
    evidence: toEvidenceViewModel(report),
  };
}

// Re-export the sanitizer so consumers/tests have a single presentation entrypoint.
export { sanitizeEvidenceUrl } from "./evidence-url";
