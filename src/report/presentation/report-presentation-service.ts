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
} from "../../contracts";
import { sanitizeEvidenceUrl } from "./evidence-url";

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

const SUPPORT_STRENGTH: Record<EvidenceSupportLevel, number> = {
  DIRECT_SUPPORT: 3,
  PARTIAL_SUPPORT: 2,
  CONTEXT_ONLY: 1,
  UNSUPPORTED: 0,
};

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

const MEASUREMENT_LABEL = {
  MEASURED: "实测",
  ESTIMATED: "估算",
  INSUFFICIENT_EVIDENCE: "证据不足",
  PROVIDER_FAILED: "采集失败",
} as const;

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

function buildHeadlineConclusion(
  report: DiagnosisReport,
  topStrength: Strength | null,
  topIssue: CoreIssue | null,
): string {
  const brand = report.companyProfile.brandName;
  const coveragePct = toPercent(report.scores.scoreCoverage);
  const overall = report.scores.overallScore;

  if (overall === null) {
    return `『${brand}』本次可测指标覆盖 ${coveragePct}%,尚不足以给出综合指数,建议先补齐关键信息后复测。`;
  }

  const clauses = [`『${brand}』当前 GEO可见度基础指数为 ${Math.round(overall)} 分(覆盖率 ${coveragePct}%)`];
  if (topStrength) clauses.push(`已具备优势:${topStrength.statement}`);
  if (topIssue) clauses.push(`最需优先处理:${topIssue.statement}`);
  return `${clauses.join(";")}。`;
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

  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    headlineConclusion: buildHeadlineConclusion(report, topStrength, topIssue),
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: buildMeasurementStatusSummary(report),
    topStrength,
    topIssue,
    topOpportunity,
    aiVisibilitySamples: selectValidAiTests(report.aiVisibilityTests).slice(0, QUICK_AI_SAMPLE_LIMIT),
    competitorGapSummary: buildCompetitorGapSummary(report, index),
    coreIssues: rankedIssues.slice(0, QUICK_CORE_ISSUE_LIMIT),
    demonstrationFix: report.demonstrationFix,
    geoOpportunities: rankedOpportunities.slice(0, QUICK_GEO_OPPORTUNITY_LIMIT),
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
    aiVisibilityTests: validAiTests,
    strengths: rankClaims(report.strengths, index),
    coreIssues: rankClaims(report.coreIssues, index),
    competitorGaps: selectValidCompetitorGaps(report, index),
    geoOpportunities: rankClaims(report.geoOpportunities, index).slice(0, DEEP_GEO_OPPORTUNITY_LIMIT),
    measurementNotes: buildMeasurementNotes(report, validAiTests),
  };
}

export function toEvidenceViewModel(report: DiagnosisReport): EvidenceViewModel {
  return {
    items: report.evidence.map((item) => ({
      id: item.id,
      title: item.title,
      sourceDomain: item.sourceDomain,
      sourceType: item.sourceType,
      authorityLevel: item.authorityLevel,
      supportLevel: item.supportLevel,
      fetchedAt: item.fetchedAt,
      snippet: item.snippet,
      url: sanitizeEvidenceUrl(item.url),
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
