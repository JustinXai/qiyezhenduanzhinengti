// ============================================================================
// ReportPresentationService — pure projection of one Canonical DiagnosisReport
// into Quick / Deep / Evidence view models.
//
// This is the ONLY place selection logic lives (docs/ARCHITECTURE.md "禁止"):
//   - topStrength / topIssue / topOpportunity are RANKED here, never `array[0]`.
//   - Quick shows at most 2 VALID AI tests, chosen by question-category priority.
//   - Competitor gap availability is decided here (evidence-gated); insufficient
//     evidence yields { available: false, reason } — never an empty table.
//   - coreIssues / geoOpportunities are capped here.
//   - measurementStatusSummary / headlineConclusion prose is composed here.
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
  PriorityDirection,
  QuestionCoverageStats,
  QuestionCoverageAssessment,
  EnterpriseReportViewModel,
  EnterpriseInformationOpportunity,
  EnterpriseContentAssetPlan,
  EnterpriseCompetitorObservation,
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
const QUICK_AI_SAMPLE_LIMIT = 2;
const DEEP_GEO_OPPORTUNITY_LIMIT = 5;
const MIN_VALID_AI_TESTS = 3;

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
// AI visibility sample selection (docs/PRODUCT_TRUTH_RULES.md §8)
//   Priority: PURCHASE_DECISION > COMPETITOR_COMPARISON > BRAND_DIRECT > OTHER.
//   Only VALID tests may surface. Quick caps at 2.
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
  return {
    available: false,
    reason: competitorsProvided
      ? COMPETITOR_INSUFFICIENT_EVIDENCE_REASON
      : COMPETITOR_NOT_PROVIDED_REASON,
  };
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
  return `本次 5 项评分指标中，${parts.join("、")}。`;
}

function toPercent(coverage: number): number {
  return Math.round(coverage * 100);
}

function buildHeadlineConclusion(
  report: DiagnosisReport,
  _topStrength: Strength | null,
  _topIssue: CoreIssue | null,
): string {
  const brand = report.companyProfile.brandName;
  const coveragePct = toPercent(report.scores.scoreCoverage);
  const overall = report.scores.overallScore;

  if (overall === null) {
    return `『${brand}』本次可测指标覆盖 ${coveragePct}%，尚不足以给出综合指数，建议先补齐关键信息后复测。`;
  }

  // Round-8.1 FINAL: restrained structured conclusion per FINAL_QUICK_COPY_CLEANUP_ONLY.
  // No hardcoded brand name beyond the prefix. Deterministic from Profile + QCGaps.
  return `『${brand}』当前 GEO基础诊断指数为 ${Math.round(overall)} 分（覆盖率 ${coveragePct}%）；公开网络已经能够识别企业的品牌、产品与业务基础，但部分客户决策信息仍较分散，客户在购买或合作前难以一次获得完整答案。`;
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
// Round-8 FINAL: Question Coverage Stats — from questionCoverageAssessments only.
// Do NOT use questionCoverageGaps.length as total.
// ---------------------------------------------------------------------------

function buildQuestionCoverageStats(
  assessments: QuestionCoverageAssessment[] | undefined,
): { stats: QuestionCoverageStats; restraintNote: string | null } {
  if (!assessments || assessments.length === 0) {
    return {
      stats: { total: 0, supported: 0, partial: 0, unanswered: 0, providerFailed: 0 },
      restraintNote: null,
    };
  }
  const total = assessments.length;
  const supported = assessments.filter((a) => a.status === "FULLY_SUPPORTED").length;
  const partial = assessments.filter((a) => a.status === "PARTIALLY_SUPPORTED").length;
  const unanswered = assessments.filter((a) => a.status === "UNANSWERED").length;
  // Any assessment with MATCHED_SIGNAL but empty evidenceIds and PARTIALLY status is
  // effectively a partial coverage; providerFailed is not used by the current pipeline.
  const providerFailed = 0;

  // Restraint note: if assessment count doesn't match input question count (a gap in
  // the pipeline), show a cautious note. We don't fabricate data.
  const restraintNote: string | null =
    total > 0
      ? null
      : "本次已检查客户决策问题，部分问题的公开信息覆盖情况仍需进一步确认。";

  return {
    stats: { total, supported, partial, unanswered, providerFailed },
    restraintNote,
  };
}

// ---------------------------------------------------------------------------
// Round-8 FINAL: Priority Direction Clustering
// Categories: PRODUCT_SELECTION | QUALITY_AND_SAFETY | BUSINESS_COOPERATION |
//            SERVICE_AND_DELIVERY | CASES_AND_TRUST | FAQ_OTHER
// Each gap belongs to exactly one category; same category = merged into one direction.
// Max 3 directions, each with title + linkedQuestions + linkedQuestionIds +
// suggestedAsset + businessValue.
// ---------------------------------------------------------------------------

type GapCategory =
  | "PRODUCT_SELECTION"
  | "QUALITY_AND_SAFETY"
  | "BUSINESS_COOPERATION"
  | "SERVICE_AND_DELIVERY"
  | "CASES_AND_TRUST"
  | "FAQ_OTHER";

interface CategoryMeta {
  title: string;
  suggestedAsset: string;
  /** Keywords that, if present in the question text, route to this category. */
  keywords: readonly string[];
}

const CATEGORY_META: Record<GapCategory, CategoryMeta> = {
  PRODUCT_SELECTION: {
    title: "产品选购与品质说明",
    suggestedAsset: "建立产品选购FAQ，补充采购决策问题说明",
    keywords: ["选购", "口味", "规格", "保质期", "过敏原", "产品", "适合", "人群", "消费场景", "早餐", "零食", "节日礼赠"],
  },
  QUALITY_AND_SAFETY: {
    title: "原料、工艺与品质保障",
    suggestedAsset: "建立产品选购FAQ，补充采购决策问题说明",
    keywords: ["原料", "工艺", "保鲜", "食品安全", "认证", "生产", "品质"],
  },
  BUSINESS_COOPERATION: {
    title: "企业合作与渠道说明",
    suggestedAsset: "建立合作FAQ，补充企业合作渠道说明",
    keywords: ["团购", "采购", "经销", "商超", "代工", "渠道", "合作", "批量", "联系"],
  },
  SERVICE_AND_DELIVERY: {
    title: "交付与售后服务",
    suggestedAsset: "建立服务说明页，补充交付和售后流程",
    keywords: ["交付", "售后", "服务", "流程"],
  },
  CASES_AND_TRUST: {
    title: "资质与案例说明",
    suggestedAsset: "建立资质与案例页，补充企业认证和合作案例",
    keywords: ["案例", "资质", "认证", "合作", "品牌"],
  },
  FAQ_OTHER: {
    title: "其他常见问题",
    suggestedAsset: "建立FAQ页面，覆盖其他常见客户问题",
    keywords: [],
  },
};

function classifyGap(gap: QuestionCoverageGap): GapCategory {
  const text = gap.questionText.toLowerCase();
  let bestCategory: GapCategory = "FAQ_OTHER";
  let bestScore = 0;
  for (const [cat, meta] of Object.entries(CATEGORY_META) as [GapCategory, CategoryMeta][]) {
    if (cat === "FAQ_OTHER") continue;
    const score = meta.keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }
  return bestCategory;
}

function buildPriorityDirections(gaps: QuestionCoverageGap[] | undefined): PriorityDirection[] {
  if (!gaps || gaps.length === 0) return [];

  // Classify each gap into a category
  const grouped = new Map<GapCategory, QuestionCoverageGap[]>();
  for (const gap of gaps) {
    const cat = classifyGap(gap);
    const existing = grouped.get(cat) ?? [];
    existing.push(gap);
    grouped.set(cat, existing);
  }

  // Build one PriorityDirection per category, sorted by gap count desc, take max 3
  const MAX_DIRECTIONS = 3;
  const directions: PriorityDirection[] = [];

  const sortedCats = [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_DIRECTIONS);

  for (const [cat, catGaps] of sortedCats) {
    const meta = CATEGORY_META[cat];
    directions.push({
      id: `dir_${cat.toLowerCase()}`,
      title: meta.title,
      linkedQuestions: catGaps.map((g) => g.questionText),
      linkedQuestionIds: [...new Set(catGaps.map((g) => g.questionId))],
      // The suggestedAsset comes from the category meta (generic for each cluster);
      // the businessValue comes from the first gap's businessValue.
      suggestedAsset: meta.suggestedAsset,
      businessValue: catGaps[0]?.businessValue ?? "帮助客户快速了解产品特点，提升购买决策效率",
    });
  }

  return directions;
}

// ---------------------------------------------------------------------------
// Public projections
// ---------------------------------------------------------------------------

export function toQuickReportViewModel(report: DiagnosisReport): QuickReportViewModel {
  const index = indexEvidence(report);

  const rankedStrengths = rankClaims(report.strengths, index);
  const rankedIssues = rankClaims(report.coreIssues, index);
  const rankedOpportunities = rankClaims(report.geoOpportunities, index);

  const composition = computeMeasurementComposition(report.scores);

  // Round-8 FINAL: build question coverage stats from Assessments (NOT gaps).
  const { stats, restraintNote } = buildQuestionCoverageStats(
    report.questionCoverageAssessments,
  );

  // Round-8 FINAL: cluster gaps into priority directions (max 3).
  const priorityDirections = buildPriorityDirections(report.questionCoverageGaps);

  // Round-8.1 FINAL: clean canonical strength statement for Quick display.
  // Replace "信息较为完整" with the restrained "具备进一步结构化呈现的基础" per
  // FINAL_QUICK_COPY_CLEANUP_ONLY. The canonical statement is preserved unchanged.
  const topStrength = rankedStrengths[0]
    ? {
        ...rankedStrengths[0],
        statement: rankedStrengths[0].statement.replace(
          "信息较为完整。",
          "具备进一步结构化呈现的基础。",
        ),
      }
    : null;
  const topIssue = rankedIssues[0] ?? null;
  const topOpportunity = rankedOpportunities[0] ?? null;

  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: report.reportLanguage,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    headlineConclusion: buildHeadlineConclusion(report, topStrength, topIssue),
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: buildMeasurementStatusSummary(report),
    measurementComposition: composition,
    estimationNotice: estimationNoticeFor(composition),
    topStrength,
    topIssue,
    topOpportunity,
    competitorGapSummary: buildCompetitorGapSummary(report, index),
    questionCoverageStats: stats,
    questionCoverageRestraintNote: restraintNote,
    priorityDirections,
    demonstrationFix: report.demonstrationFix,
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
  enterprise: EnterpriseReportViewModel;
}

/** Project a Canonical report into all four read view models in one pass. */
export function presentReport(report: DiagnosisReport): ReportPresentation {
  return {
    quick: toQuickReportViewModel(report),
    deep: toDeepReportViewModel(report),
    evidence: toEvidenceViewModel(report),
    enterprise: toEnterpriseReportViewModel(report),
  };
}

// ============================================================================
// Round-9 FINAL: Enterprise GEO Consulting Report — single unified enterprise report.
// Pure projection from Canonical. No new scoring, no new Canonical fields.
//
// 7-module structure (per REQUEST):
//   01 决策摘要 (brand, date, score, summary)
//   02 企业现状分析 (from Profile + Strength)
//   03 客户需求与信息机会 (MERGED: customer questions + coverage + geo opportunities)
//   04 内容资产建设建议 (from priorityDirections)
//   05 优先行动路线 (roadmap)
//   06 星媄数据服务方向 (static)
//   07 证据附件 (EvidenceView)
//
// REMOVED:
//   - 客户决策问题分析 (独立模块, coverage统计为空时感知价值低)
//   - AI检索场景观察 (空洞, 融合进入03)
// ============================================================================

function buildEnterpriseStatusDescription(
  profile: DiagnosisReport["companyProfile"],
  strength: Strength | null,
): string {
  if (strength) {
    return `${strength.statement}`;
  }
  return `企业已在公开渠道具备基础信息展示。`;
}

function buildEnterpriseStatusSummary(
  profile: DiagnosisReport["companyProfile"],
  strength: Strength | null,
  priorityDirs: PriorityDirection[],
  stats: QuestionCoverageStats,
): string {
  if (priorityDirs.length > 0) {
    const topDir = priorityDirs[0]!;
    return `企业已经具备基本的公开信息基础，但在${topDir.title}等客户决策场景中仍存在信息缺口，影响用户快速了解产品、服务和合作方式。`;
  }
  if (stats.unanswered > 0) {
    return `企业已经具备基本的公开信息基础，但部分客户决策问题仍缺乏集中展示的信息内容。`;
  }
  return `企业已在公开渠道建立基本的信息展示基础。`;
}

/**
 * Build informationOpportunities from priority directions + gaps
 * Round-9.1: 公开信息完善方向，不是正式GEO机会
 * Each opportunity shows: 客户关注 / 当前情况 / 建议资产 / 商业价值
 * Max 5 opportunities displayed, prioritizing highest value directions
 */
function buildInformationOpportunities(
  dirs: PriorityDirection[],
  gaps: QuestionCoverageGap[] | undefined,
): EnterpriseInformationOpportunity[] {
  if (dirs.length === 0) return [];

  const gapMap = new Map<string, QuestionCoverageGap>();
  for (const g of gaps ?? []) {
    gapMap.set(g.questionId, g);
  }

  // Build from priority directions (max 5)
  return dirs.slice(0, 5).map((dir) => {
    const firstQ = dir.linkedQuestionIds[0] ?? "";
    const gap = gapMap.get(firstQ);
    return {
      title: dir.title,
      customerQuestion: dir.linkedQuestions[0] ?? "",
      currentStatus: gap?.observedScope ?? "相关信息有待集中整理。",
      suggestedAsset: dir.suggestedAsset,
      businessValue: dir.businessValue,
    };
  });
}

/**
 * Round-9.2: Build content asset plans from priority directions
 * Each plan has: title, suggestedAssets[], businessValue
 */
function buildContentAssetPlans(dirs: PriorityDirection[]): EnterpriseContentAssetPlan[] {
  const CATEGORY_DETAILS: Record<string, { suggestedAssets: string[]; businessValue: string }> = {
    PRODUCT_SELECTION: {
      suggestedAssets: ["产品选购指南", "口味与规格对照", "保质期及过敏原说明", "产品FAQ"],
      businessValue: "帮助消费者在购买前快速判断产品差异，减少重复咨询",
    },
    QUALITY_AND_SAFETY: {
      suggestedAssets: ["原料来源说明", "生产工艺说明", "食品安全与品质控制", "相关认证和检测信息"],
      businessValue: "让消费者、采购方和渠道合作方更容易核验产品品质依据",
    },
    BUSINESS_COOPERATION: {
      suggestedAssets: ["团购和批量采购入口", "经销及商超合作流程", "代工能力说明", "可公开案例和咨询入口"],
      businessValue: "降低采购方和合作伙伴了解合作条件的沟通成本",
    },
    SERVICE_AND_DELIVERY: {
      suggestedAssets: ["服务流程FAQ", "交付时间说明", "售后政策页"],
      businessValue: "减少客户对服务流程的咨询，提升合作效率",
    },
    CASES_AND_TRUST: {
      suggestedAssets: ["合作案例展示", "资质证书页", "认证说明"],
      businessValue: "增强采购方和合作方的信任感",
    },
    FAQ_OTHER: {
      suggestedAssets: ["企业FAQ页", "通用问答内容"],
      businessValue: "覆盖客户常见问题，减少重复咨询",
    },
  };

  const seen = new Set<string>();
  const plans: EnterpriseContentAssetPlan[] = [];
  for (const dir of dirs) {
    const catKey = dir.id.replace("dir_", "").toUpperCase();
    if (seen.has(catKey)) continue;
    seen.add(catKey);
    const meta = CATEGORY_DETAILS[catKey] ?? {
      suggestedAssets: ["FAQ页面"],
      businessValue: "覆盖客户常见问题",
    };
    plans.push({
      title: dir.title,
      suggestedAssets: meta.suggestedAssets,
      businessValue: meta.businessValue,
    });
  }
  return plans;
}

/**
 * Round-9.2: Build competitor observations from valid competitor gaps
 * Only uses evidence-backed gaps, limited to 3 observations
 */
function buildCompetitorObservations(
  gaps: CompetitorGap[],
  index: EvidenceIndex,
): EnterpriseCompetitorObservation[] {
  // Filter to only gaps with semantic support
  const validGaps = gaps.filter((gap) => hasSemanticSupport(gap.evidenceIds, index));
  if (validGaps.length === 0) return [];

  return validGaps.slice(0, 3).map((gap) => ({
    dimension: gap.competitorName,
    observation: gap.gapStatement,
    competitorMentioned: true,
  }));
}

export function toEnterpriseReportViewModel(report: DiagnosisReport): EnterpriseReportViewModel {
  const evidence = toEvidenceViewModel(report);

  const index = indexEvidence(report);
  const rankedStrengths = rankClaims(report.strengths, index);
  const topStrength = rankedStrengths[0] ?? null;
  const composition = computeMeasurementComposition(report.scores);

  const { stats } = buildQuestionCoverageStats(report.questionCoverageAssessments);
  const priorityDirs = buildPriorityDirections(report.questionCoverageGaps);

  // Round-9.2: informationOpportunities from priority directions (max 5)
  const informationOpportunities = buildInformationOpportunities(priorityDirs, report.questionCoverageGaps);

  // Round-9.2: competitor observations (conditional)
  const competitorObservations = buildCompetitorObservations(report.competitorGaps, index);

  // Round-9.2: content asset plans (dynamic 2-5)
  const contentAssetPlans = buildContentAssetPlans(priorityDirs);

  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: report.reportLanguage,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    enterpriseStatusSummary: buildEnterpriseStatusSummary(
      report.companyProfile,
      topStrength,
      priorityDirs,
      stats,
    ),
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementComposition: composition,
    estimationNotice: estimationNoticeFor(composition),
    enterpriseStatusDescription: buildEnterpriseStatusDescription(report.companyProfile, topStrength),
    topStrength,
    informationOpportunities,
    ...(competitorObservations.length > 0 ? { competitorObservations } : {}),
    contentAssetPlans,
    demonstrationFix: report.demonstrationFix,
    evidence,
  };
}

// Re-export the sanitizer so consumers/tests have a single presentation entrypoint.
export { sanitizeEvidenceUrl } from "./evidence-url";
