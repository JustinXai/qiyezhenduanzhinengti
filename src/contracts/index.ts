import { z } from "zod";

// ============================================================================
// Canonical shared contracts. Supervisor-owned file (see docs/AGENT_FILE_OWNERSHIP.md).
// Agents extend validation/guards in src/contracts/** (Agent B) and
// src/report/validation/** (Agent B), but this index is the single source of
// truth for the shapes everyone imports. Do not fork these types elsewhere.
//
// See docs/REPORT_CONTRACT.md and docs/SCORE_CONTRACT.md for the frozen rules
// these types encode.
// ============================================================================

export const REPORT_CONTRACT_VERSION = "1.0.0";
export const SCORE_CONTRACT_VERSION = "1.0.0";

// V1 public reports are Simplified-Chinese ONLY (Round-5.1 中文成交版). The
// language is a frozen literal — no user form, URL parameter or front-end
// switch can change it. `.default()` keeps previously stored canonical JSON
// (written before this field existed) parseable on read.
export const ReportLanguage = z.literal("zh-CN");
export type ReportLanguage = z.infer<typeof ReportLanguage>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EvidenceSourceType = z.enum([
  "FIRST_PARTY_EVIDENCE",
  "OBSERVED_WEB_EVIDENCE",
  "COMPETITOR_WEB_EVIDENCE",
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceType>;

export const EvidenceSupportLevel = z.enum([
  "DIRECT_SUPPORT",
  "PARTIAL_SUPPORT",
  "CONTEXT_ONLY",
  "UNSUPPORTED",
]);
export type EvidenceSupportLevel = z.infer<typeof EvidenceSupportLevel>;

export const ClaimType = z.enum(["DIAGNOSTIC_INFERENCE", "UNVERIFIED_HYPOTHESIS"]);
export type ClaimType = z.infer<typeof ClaimType>;

/** Evidence source tier (Round-5.1 §六): A企业中文官方 B全球官方 C中文媒体/机构 D电商 E社区问答. */
export const EvidenceSourceTier = z.enum(["A", "B", "C", "D", "E"]);
export type EvidenceSourceTier = z.infer<typeof EvidenceSourceTier>;

export const EvidenceItem = z.object({
  id: z.string().min(1),
  title: z.string(),
  sourceDomain: z.string(),
  sourceType: EvidenceSourceType,
  authorityLevel: z.string(),
  supportLevel: EvidenceSupportLevel,
  fetchedAt: z.string(),
  snippet: z.string(),
  url: z.string().url(),
  // Round-5.1 registry metadata (optional → rows/reports written earlier parse).
  /** Detected content language of title+snippet ("zh" | "other"). */
  language: z.enum(["zh", "other"]).optional(),
  /** Source tier per the frozen中文证据 priority ladder. */
  sourceTier: EvidenceSourceTier.optional(),
  /** Canonical host after www/trailing-dot normalization (dedupe basis). */
  normalizedDomain: z.string().optional(),
  /** Deterministic merge key (normalizedDomain + normalized title head). */
  dedupeKey: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

// ---------------------------------------------------------------------------
// Scoring (docs/SCORE_CONTRACT.md - weights are frozen, do not change)
// ---------------------------------------------------------------------------

export const MeasurementStatus = z.enum([
  "MEASURED",
  "ESTIMATED",
  "INSUFFICIENT_EVIDENCE",
  "PROVIDER_FAILED",
]);
export type MeasurementStatus = z.infer<typeof MeasurementStatus>;

export const SCORE_DIMENSION_WEIGHTS = {
  companyClarity: 0.2,
  websiteCompleteness: 0.2,
  customerQuestionCoverage: 0.25,
  trustEvidence: 0.2,
  aiVisibility: 0.15,
} as const;

export type ScoreDimensionKey = keyof typeof SCORE_DIMENSION_WEIGHTS;

export const ScoreDimension = z.object({
  score: z.number().min(0).max(100).nullable(),
  measurementStatus: MeasurementStatus,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
});
export type ScoreDimension = z.infer<typeof ScoreDimension>;

export const ScoreBlock = z.object({
  companyClarity: ScoreDimension,
  websiteCompleteness: ScoreDimension,
  customerQuestionCoverage: ScoreDimension,
  trustEvidence: ScoreDimension,
  aiVisibility: ScoreDimension,
  overallScore: z.number().min(0).max(100).nullable(),
  scoreCoverage: z.number().min(0).max(1),
});
export type ScoreBlock = z.infer<typeof ScoreBlock>;

// ---------------------------------------------------------------------------
// AI Visibility (single source of truth per docs/PRODUCT_TRUTH_RULES.md §8)
// ---------------------------------------------------------------------------

export const AIVisibilityTestStatus = z.enum([
  "VALID",
  "INSUFFICIENT_EVIDENCE",
  "PROVIDER_FAILED",
]);
export type AIVisibilityTestStatus = z.infer<typeof AIVisibilityTestStatus>;

export const AIVisibilityAccuracy = z.enum(["ACCURATE", "PARTIAL", "INACCURATE", "NOT_MENTIONED"]);
export const AIVisibilityRecommendationStrength = z.enum([
  "STRONG",
  "MODERATE",
  "WEAK",
  "NONE",
]);

export const AIVisibilityQuestionCategory = z.enum([
  "PURCHASE_DECISION",
  "COMPETITOR_COMPARISON",
  "BRAND_DIRECT",
  "OTHER",
]);

export const AIVisibilityTest = z.object({
  id: z.string(),
  questionCategory: AIVisibilityQuestionCategory,
  question: z.string(),
  status: AIVisibilityTestStatus,
  brandMentioned: z.boolean().nullable(),
  accuracy: AIVisibilityAccuracy.nullable(),
  recommendationStrength: AIVisibilityRecommendationStrength.nullable(),
  modelUsed: z.string(),
  testedAt: z.string(),
  evidenceIds: z.array(z.string()),
});
export type AIVisibilityTest = z.infer<typeof AIVisibilityTest>;

// ---------------------------------------------------------------------------
// Claims (core issues, strengths, opportunities)
// ---------------------------------------------------------------------------

export const ClaimBase = z.object({
  id: z.string(),
  claimType: ClaimType,
  statement: z.string(),
  businessImpact: z.string(),
  evidenceIds: z.array(z.string()).min(1),
});

export const CoreIssue = ClaimBase.extend({
  fixDirection: z.string(),
});
export type CoreIssue = z.infer<typeof CoreIssue>;

export const Strength = ClaimBase;
export type Strength = z.infer<typeof Strength>;

export const GeoOpportunity = ClaimBase.extend({
  customerQuestion: z.string(),
  contentGap: z.string(),
  // Round-5.1 §八 opportunity lineage. Optional so pre-field canonical rows
  // still parse; NEW generations populate them (prompt + builder enforce).
  /** The published core issue this opportunity answers ("iss_N"). */
  sourceIssueId: z.string().optional(),
  /** Concrete, GEO-implementable action (not a generic "多发内容" line). */
  recommendedAction: z.string().optional(),
  /** Why this is worth doing FIRST (ties back to evidence + business impact). */
  priorityReason: z.string().optional(),
});
export type GeoOpportunity = z.infer<typeof GeoOpportunity>;

export const DemonstrationFixType = z.enum([
  "ENTITY_DESCRIPTION",
  "FAQ_EXAMPLE",
  "BEFORE_AFTER_STRUCTURE",
]);

export const DemonstrationFix = z.object({
  id: z.string(),
  fixType: DemonstrationFixType,
  currentIssue: z.string(),
  suggestedAssetType: z.string(),
  before: z.string(),
  after: z.string(),
  whyBetter: z.string(),
  customerConfirmationNeeded: z.string(),
  geoTeamDeliverable: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  disclaimer: z.literal(
    // OQ-1 (Agent L, docs/REQUIREMENTS_TRACEABILITY.md): full-width comma
    // 「，」U+FF0C, aligning this single source of truth with
    // docs/REPORT_CONTRACT.md §5. Consumers must read it via
    // `DemonstrationFix.shape.disclaimer.value`, never retype it.
    "示范内容仅用于展示优化方向，正式发布前需结合企业真实材料确认。",
  ),
});
export type DemonstrationFix = z.infer<typeof DemonstrationFix>;

// ---------------------------------------------------------------------------
// Round-7: PublicInformationOpportunityV1
// 来源于 QuestionCoverageGapV1 的确定性映射，用于提示企业可以补充的公开信息
// 不是正式 GEO Opportunity，不进入 Opportunity 统计，不影响 Truth Guard 门槛
// ---------------------------------------------------------------------------

export const PublicInformationCoverageStatus = z.enum([
  "PARTIALLY_SUPPORTED",
  "UNANSWERED",
]);
export type PublicInformationCoverageStatus = z.infer<typeof PublicInformationCoverageStatus>;

/** 措辞模式：必须限定检查范围 */
export const PublicInformationWordingMode = z.literal("WITHIN_CHECKED_SCOPE");
export type PublicInformationWordingMode = z.infer<typeof PublicInformationWordingMode>;

export const PublicInformationOpportunity = z.object({
  /** 关联的客户问题 ID */
  relatedQuestionId: z.string(),
  /** 客户正在问什么 */
  customerQuestion: z.string(),
  /** 当前覆盖状态：仅允许 PARTIALLY_SUPPORTED 或 UNANSWERED */
  currentCoverageStatus: PublicInformationCoverageStatus,
  /** 在本次已检查范围内观察到的内容范围 */
  observedScope: z.string(),
  /** 缺失的公开信息描述 */
  missingPublicInformation: z.string(),
  /** 建议的具体补充动作 */
  suggestedContentAction: z.string(),
  /** 潜在商业价值说明 */
  potentialBusinessValue: z.string(),
  /** 关联的 Evidence ID 列表 */
  evidenceIds: z.array(z.string()),
  /** 措辞模式：必须限定检查范围 */
  wordingMode: PublicInformationWordingMode,
});
export type PublicInformationOpportunity = z.infer<typeof PublicInformationOpportunity>;

/** 行动建议来源标记 */
export const PublicInformationActionSourceType = z.literal("PUBLIC_INFORMATION_ACTION");
export type PublicInformationActionSourceType = z.infer<typeof PublicInformationActionSourceType>;

/**
 * 阶段一 Quick 行动建议
 * 来源于 QuestionCoverageGap 的确定性映射
 * 标记为 PUBLIC_INFORMATION_ACTION，不是正式 GEO Opportunity
 */
export const PublicInformationAction = z.object({
  /** 行动建议文本 */
  actionText: z.string(),
  /** 来源标记：固定为 PUBLIC_INFORMATION_ACTION */
  sourceType: PublicInformationActionSourceType,
  /** 关联的客户问题 */
  relatedQuestion: z.string().optional(),
});
export type PublicInformationAction = z.infer<typeof PublicInformationAction>;

// ---------------------------------------------------------------------------
// Round-7.1A: QuestionCoverageAssessment - 客户问题评估记录
// ---------------------------------------------------------------------------

/** 评估原因代码 */
export const QuestionAssessmentReasonCode = z.enum([
  "MATCHED_SIGNAL",       // 成功匹配 coverage signal
  "NO_MATCHING_COVERAGE_SIGNAL",  // 无法匹配 coverage signal
  "EVIDENCE_INSUFFICIENT",       // 证据不足
]);
export type QuestionAssessmentReasonCode = z.infer<typeof QuestionAssessmentReasonCode>;

/**
 * Round-7.1A: QuestionCoverageAssessmentV1
 * 每个原始客户问题的评估记录
 * 在请求创建时生成，持久化于 Diagnosis Request
 */
export const QuestionCoverageAssessment = z.object({
  /** 稳定的问题 ID */
  questionId: z.string(),
  /** 原始问题文本 */
  questionText: z.string(),
  /** 匹配的 coverage criterion key（如果有） */
  matchedCriterionKey: z.string().nullable(),
  /** 覆盖状态 */
  status: z.enum(["FULLY_SUPPORTED", "PARTIALLY_SUPPORTED", "UNANSWERED"]),
  /** 关联的 Evidence ID */
  evidenceIds: z.array(z.string()),
  /** 评估原因代码 */
  reasonCode: QuestionAssessmentReasonCode,
  /** 评估时间 */
  assessedAt: z.string(),
  /** 算法版本 */
  algorithmVersion: z.literal("1.0.0"),
});
export type QuestionCoverageAssessment = z.infer<typeof QuestionCoverageAssessment>;

/**
 * Round-7: QuestionCoverageGapV1
 * 用于记录客户问题的覆盖情况
 * 是 PublicInformationOpportunity 的来源
 */
export const QuestionCoverageGap = z.object({
  /** 问题 ID */
  questionId: z.string(),
  /** 问题文本（客户正在问什么） */
  questionText: z.string(),
  /** 覆盖状态 */
  coverageStatus: z.enum(["FULLY_SUPPORTED", "PARTIALLY_SUPPORTED", "UNANSWERED"]),
  /** 观察到的内容范围 */
  observedScope: z.string(),
  /** 缺失的公开信息描述 */
  missingInformation: z.string(),
  /** 建议的具体补充动作 */
  suggestedAction: z.string(),
  /** 潜在商业价值 */
  businessValue: z.string(),
  /** 关联的 Evidence ID */
  evidenceIds: z.array(z.string()),
});
export type QuestionCoverageGap = z.infer<typeof QuestionCoverageGap>;

// ---------------------------------------------------------------------------
// Canonical DiagnosisReport - the single stored report shape.
// ---------------------------------------------------------------------------

export const CompetitorGap = z.object({
  id: z.string(),
  competitorName: z.string(),
  gapStatement: z.string(),
  evidenceIds: z.array(z.string()).min(1),
});

export const CompanyProfile = z.object({
  brandName: z.string(),
  website: z.string(),
  industry: z.string(),
  productOrService: z.string(),
  targetRegion: z.string(),
  competitors: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
});

export const DiagnosisReport = z.object({
  reportContractVersion: z.literal(REPORT_CONTRACT_VERSION),
  scoreContractVersion: z.literal(SCORE_CONTRACT_VERSION),
  /** Frozen public-report language (zh-CN only in V1); defaulted for pre-field rows. */
  reportLanguage: ReportLanguage.default("zh-CN"),
  diagnosisId: z.string(),
  publicToken: z.string(),
  generatedAt: z.string(),
  companyProfile: CompanyProfile,
  scores: ScoreBlock,
  aiVisibilityTests: z.array(AIVisibilityTest),
  strengths: z.array(Strength),
  coreIssues: z.array(CoreIssue),
  competitorGaps: z.array(CompetitorGap),
  geoOpportunities: z.array(GeoOpportunity),
  demonstrationFix: DemonstrationFix.nullable(),
  evidence: z.array(EvidenceItem),
  /**
   * Round-7.1A: 客户问题评估记录
   * 每个原始客户问题恰好有一个评估
   * 在请求创建时生成并持久化
   */
  questionCoverageAssessments: z.array(QuestionCoverageAssessment).optional(),
  /**
   * Round-7: 客户问题覆盖缺口
   * 用于生成 PublicInformationOpportunity
   * 来源于 customerQuestionCoverage 维度的分析
   */
  questionCoverageGaps: z.array(QuestionCoverageGap).optional(),
});
export type DiagnosisReport = z.infer<typeof DiagnosisReport>;

// ---------------------------------------------------------------------------
// Presentation view models (ReportPresentationService output).
// Quick/Deep/Evidence are read projections of one Canonical DiagnosisReport;
// never separately generated or scored. See docs/ARCHITECTURE.md.
// ---------------------------------------------------------------------------

/** Weight share of each measurement status over the frozen dimension weights. */
export const MeasurementComposition = z.object({
  measuredWeight: z.number().min(0).max(1),
  estimatedWeight: z.number().min(0).max(1),
  insufficientWeight: z.number().min(0).max(1),
  providerFailedWeight: z.number().min(0).max(1),
});
export type MeasurementComposition = z.infer<typeof MeasurementComposition>;

export const QuickReportViewModel = z.object({
  diagnosisId: z.string(),
  publicToken: z.string(),
  reportLanguage: ReportLanguage.default("zh-CN"),
  brandName: z.string(),
  reportDate: z.string(),
  headlineConclusion: z.string(),
  overallScore: z.number().nullable(),
  scoreCoverage: z.number(),
  measurementStatusSummary: z.string(),
  /** §八 transparency: 实测/公开网页估算/证据不足/暂未测得 weight shares. */
  measurementComposition: MeasurementComposition,
  /** Frozen disclaimer when估算 outweighs实测; null otherwise. */
  estimationNotice: z.string().nullable(),
  topStrength: Strength.nullable(),
  topIssue: CoreIssue.nullable(),
  topOpportunity: GeoOpportunity.nullable(),
  aiVisibilitySamples: z.array(AIVisibilityTest).max(2),
  competitorGapSummary: z.union([
    z.object({ available: z.literal(true), gaps: z.array(CompetitorGap) }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ]),
  coreIssues: z.array(CoreIssue).max(3),
  demonstrationFix: DemonstrationFix.nullable(),
  geoOpportunities: z.array(GeoOpportunity).max(3),
  /**
   * Round-7: 公开信息完善机会
   * 来源于 QuestionCoverageGapV1 的确定性映射
   * 最多 3 个，不是正式 Opportunity，不影响 Truth Guard
   */
  publicInformationOpportunities: z.array(PublicInformationOpportunity).max(3),
  /**
   * Round-7: 最重要的公开信息完善机会（用于首屏展示）
   * 从 publicInformationOpportunities 中选择最重要的 1 个
   */
  topPublicInformationOpportunity: PublicInformationOpportunity.nullable(),
  /**
   * Round-7: 行动建议
   * 来源于 QuestionCoverageGap 的确定性映射
   * 标记为 PUBLIC_INFORMATION_ACTION，不是正式 GEO Opportunity
   */
  publicInformationActions: z.array(PublicInformationAction).max(3),
});
export type QuickReportViewModel = z.infer<typeof QuickReportViewModel>;

export const DeepReportViewModel = z.object({
  diagnosisId: z.string(),
  publicToken: z.string(),
  companyProfile: CompanyProfile,
  scores: ScoreBlock,
  /** §八: same composition as Quick (projected once, displayed consistently). */
  measurementComposition: MeasurementComposition.optional(),
  aiVisibilityTests: z.array(AIVisibilityTest),
  strengths: z.array(Strength),
  coreIssues: z.array(CoreIssue),
  competitorGaps: z.array(CompetitorGap),
  geoOpportunities: z.array(GeoOpportunity),
  measurementNotes: z.array(z.string()),
});
export type DeepReportViewModel = z.infer<typeof DeepReportViewModel>;

export const EvidenceViewModel = z.object({
  items: z.array(
    EvidenceItem.pick({
      id: true,
      title: true,
      sourceDomain: true,
      sourceType: true,
      authorityLevel: true,
      supportLevel: true,
      fetchedAt: true,
      snippet: true,
      url: true,
    }).extend({
      // Round-5.1 中文成交版: the original title/snippet may stay in their source
      // language, but every item carries a Chinese customer summary + Chinese
      // labels so the public Evidence view never leans on internal enums.
      // Optional at the SCHEMA level (guard fixtures build minimal items); the
      // ChinesePublicReportGuard requires them on every real projection.
      summaryZh: z.string().optional(),
      supportLabel: z.string().optional(),
      sourceTypeLabel: z.string().optional(),
      /** 中文来源 / 英文官方补充 (from the recorded evidence language). */
      languageLabel: z.string().optional(),
    }),
  ),
});
export type EvidenceViewModel = z.infer<typeof EvidenceViewModel>;
