// ============================================================================
// Shared canonical sample report — Supervisor-owned integration anchor.
//
// Every parallel agent (B/D/E/F/G) codes against THIS one known-valid
// `DiagnosisReport` at their mock seams so the seven independent outputs stay
// wire-compatible:
//   - B validates guards against it,
//   - D targets this shape when assembling reports from mock DeepSeek output,
//   - E stores/serves it through StorageAdapter + API,
//   - F projects it into Quick/Deep/Evidence view models and renders it,
//   - G asserts the end-to-end mock slice reproduces it.
//
// Do NOT fork this shape into per-agent samples. Import it read-only:
//   import { SAMPLE_DIAGNOSIS_REPORT, buildSampleReport } from "../../src/fixtures/sample-report";
//
// Numbers here are formula-consistent with docs/SCORE_CONTRACT.md AND satisfy
// Agent B's semantic guards (evidence support levels, cross-field, CTA):
//   aiVisibility is null/INSUFFICIENT — only 2 VALID AI tests exist and
//     PRODUCT_TRUTH_RULES §8 requires >=3 VALID before the dimension is scored.
//   scoreCoverage = 0.85 (the four scored dimensions' weights: .20+.20+.25+.20)
//   overallScore  = (72*.20 + 65*.20 + 55*.25 + 60*.20) / 0.85 = 62.53
//   every core issue / strength / opportunity cites DIRECT_SUPPORT evidence
//     (PRODUCT_TRUTH_RULES §4); CONTEXT_ONLY evidence backs only score
//     dimensions and AI tests, never a claim.
// The frozen demonstrationFix disclaimer is read from the Zod literal itself
// (never retyped) to stay byte-exact with src/contracts/index.ts.
// ============================================================================

import { DiagnosisReport, DemonstrationFix, REPORT_CONTRACT_VERSION, SCORE_CONTRACT_VERSION } from "../contracts";
import type { DiagnosisReport as DiagnosisReportType } from "../contracts";

const FROZEN_DEMO_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

const SAMPLE: DiagnosisReportType = {
  reportContractVersion: REPORT_CONTRACT_VERSION,
  scoreContractVersion: SCORE_CONTRACT_VERSION,
  reportLanguage: "zh-CN",
  diagnosisId: "diag_sample_0001",
  publicToken: "tok_sample_0001",
  generatedAt: "2026-07-18T00:00:00.000Z",
  companyProfile: {
    brandName: "示例智能装备",
    website: "https://example-equip.com",
    industry: "工业自动化设备",
    productOrService: "面向中小制造企业的柔性装配线与售后运维服务",
    targetRegion: "华东地区",
    competitors: ["竞品甲自动化", "竞品乙智造"],
    unresolvedQuestions: [
      "官网未明确说明典型交付周期",
      "缺少可验证的第三方资质或案例佐证",
    ],
  },
  scores: {
    companyClarity: {
      score: 72,
      measurementStatus: "MEASURED",
      confidence: 0.8,
      evidenceIds: ["ev_first_home", "ev_first_about"],
    },
    websiteCompleteness: {
      score: 65,
      measurementStatus: "MEASURED",
      confidence: 0.75,
      evidenceIds: ["ev_first_home", "ev_first_product"],
    },
    customerQuestionCoverage: {
      score: 55,
      measurementStatus: "ESTIMATED",
      confidence: 0.5,
      evidenceIds: ["ev_first_product"],
    },
    trustEvidence: {
      score: 60,
      measurementStatus: "MEASURED",
      confidence: 0.7,
      evidenceIds: ["ev_observed_news"],
    },
    aiVisibility: {
      score: null,
      measurementStatus: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      evidenceIds: [],
    },
    overallScore: 62.53,
    scoreCoverage: 0.85,
  },
  aiVisibilityTests: [
    {
      id: "aiv_1",
      questionCategory: "PURCHASE_DECISION",
      question: "华东地区有哪些可靠的中小企业柔性装配线供应商?",
      status: "VALID",
      brandMentioned: false,
      accuracy: "NOT_MENTIONED",
      recommendationStrength: "NONE",
      modelUsed: "deepseek-v4-flash",
      testedAt: "2026-07-18T00:00:00.000Z",
      evidenceIds: ["ev_observed_news"],
    },
    {
      id: "aiv_2",
      questionCategory: "BRAND_DIRECT",
      question: "示例智能装备主要提供什么产品和服务?",
      status: "VALID",
      brandMentioned: true,
      accuracy: "PARTIAL",
      recommendationStrength: "WEAK",
      modelUsed: "deepseek-v4-flash",
      testedAt: "2026-07-18T00:00:00.000Z",
      evidenceIds: ["ev_first_home"],
    },
    {
      id: "aiv_3",
      questionCategory: "COMPETITOR_COMPARISON",
      question: "示例智能装备和竞品甲自动化相比有什么差异?",
      status: "INSUFFICIENT_EVIDENCE",
      brandMentioned: null,
      accuracy: null,
      recommendationStrength: null,
      modelUsed: "deepseek-v4-flash",
      testedAt: "2026-07-18T00:00:00.000Z",
      evidenceIds: [],
    },
  ],
  strengths: [
    {
      id: "str_1",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "官网首页清晰说明了目标客户与核心产品线",
      businessImpact: "潜在客户能在首屏快速判断是否对口,降低跳出",
      evidenceIds: ["ev_first_home"],
    },
  ],
  coreIssues: [
    {
      id: "iss_1",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "缺少面向采购决策的常见问题解答内容",
      businessImpact: "高意向客户在比价阶段拿不到关键信息,容易流向信息更全的竞品",
      evidenceIds: ["ev_first_product"],
      fixDirection: "补充围绕交付周期、售后与选型的结构化 FAQ",
    },
    {
      id: "iss_2",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "第三方可验证的信任证据不足",
      businessImpact: "AI 与客户都难以确认企业资质,削弱推荐意愿",
      evidenceIds: ["ev_first_about"],
      fixDirection: "整理可公开的资质、案例与媒体报道并结构化呈现",
    },
    {
      id: "iss_3",
      claimType: "UNVERIFIED_HYPOTHESIS",
      statement: "产品页对不同行业适配的说明可能不够具体",
      businessImpact: "跨行业客户难以自我对号,咨询转化受限",
      evidenceIds: ["ev_first_product"],
      fixDirection: "按典型行业场景拆分产品适配说明",
    },
  ],
  competitorGaps: [
    {
      id: "gap_1",
      competitorName: "竞品甲自动化",
      gapStatement: "竞品公开展示了交付周期与验收标准,本企业官网暂未提供同类信息",
      evidenceIds: ["ev_competitor_home"],
    },
  ],
  geoOpportunities: [
    {
      id: "geo_1",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "围绕“柔性装配线选型”建立权威问答内容",
      businessImpact: "承接高意向搜索与 AI 问答流量",
      evidenceIds: ["ev_first_product"],
      customerQuestion: "中小制造企业该如何选择柔性装配线",
      contentGap: "官网无系统性的选型指南或对比框架",
    },
    {
      id: "geo_2",
      claimType: "DIAGNOSTIC_INFERENCE",
      statement: "沉淀真实交付案例的结构化描述",
      businessImpact: "为 AI 提供可引用的实体事实,提升被准确提及的概率",
      evidenceIds: ["ev_first_about"],
      customerQuestion: "这家供应商有没有类似我们规模的成功案例?",
      contentGap: "缺少可公开、可验证的案例结构化内容",
    },
  ],
  demonstrationFix: {
    id: "demo_1",
    fixType: "FAQ_EXAMPLE",
    currentIssue: "官网缺少面向采购决策的常见问题解答",
    suggestedAssetType: "结构化 FAQ 区块",
    before: "产品页仅罗列参数,未回答客户关心的交付与售后问题",
    after: "新增 FAQ:交付周期 / 售后响应 / 选型建议,每条给出明确、可核验的回答结构",
    whyBetter: "客户与 AI 都能直接提取到关键决策信息,减少歧义",
    customerConfirmationNeeded: "确认真实的交付周期区间与售后承诺口径",
    geoTeamDeliverable: "FAQ 内容结构模板与首批问题清单",
    evidenceIds: ["ev_first_product"],
    disclaimer: FROZEN_DEMO_DISCLAIMER,
  },
  /**
   * Round-7.1A: 客户问题评估记录（示例）
   * 包含三种覆盖状态，用于测试统计聚合
   */
  questionCoverageAssessments: [
    {
      questionId: "q_cover_1",
      questionText: "中小制造企业该如何选择柔性装配线？",
      matchedCriterionKey: "purchaseDecisionQuestions",
      status: "PARTIALLY_SUPPORTED",
      evidenceIds: ["ev_first_product"],
      reasonCode: "MATCHED_SIGNAL",
      assessedAt: "2026-07-18T00:00:00.000Z",
      algorithmVersion: "1.0.0",
    },
    {
      questionId: "q_cover_2",
      questionText: "这家供应商有没有类似规模的成功案例？",
      matchedCriterionKey: "purchaseDecisionQuestions",
      status: "UNANSWERED",
      evidenceIds: [],
      reasonCode: "NO_MATCHING_COVERAGE_SIGNAL",
      assessedAt: "2026-07-18T00:00:00.000Z",
      algorithmVersion: "1.0.0",
    },
    {
      questionId: "q_cover_3",
      questionText: "设备的交付周期和验收标准是什么",
      matchedCriterionKey: "purchaseDecisionQuestions",
      status: "PARTIALLY_SUPPORTED",
      evidenceIds: ["ev_first_product"],
      reasonCode: "MATCHED_SIGNAL",
      assessedAt: "2026-07-18T00:00:00.000Z",
      algorithmVersion: "1.0.0",
    },
  ],
  questionCoverageGaps: [
    {
      questionId: "q_cover_1",
      questionText: "中小制造企业该如何选择柔性装配线？",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网产品页有设备参数，但无系统性选型指南",
      missingInformation: "选型决策框架、不同规模适配建议、典型客户场景",
      suggestedAction: "建立产品选型指南页面，按行业/规模/预算提供对比框架",
      businessValue: "帮助采购方快速判断产品是否适合，提升咨询转化",
      evidenceIds: ["ev_first_product"],
    },
    {
      questionId: "q_cover_2",
      questionText: "这家供应商有没有类似规模的成功案例？",
      coverageStatus: "UNANSWERED",
      observedScope: "本次搜索结果中未找到客户案例或应用场景展示",
      missingInformation: "可公开的成功案例、行业分布、服务规模说明",
      suggestedAction: "整理并展示 3-5 个典型客户案例，包括行业和服务规模",
      businessValue: "增强采购信心，为 AI 提供可引用的实体事实",
      evidenceIds: [],
    },
    {
      questionId: "q_cover_3",
      questionText: "设备的交付周期和验收标准是什么",
      coverageStatus: "PARTIALLY_SUPPORTED",
      observedScope: "官网未明确说明交付周期，但有联系表单",
      missingInformation: "标准交付周期区间、验收流程说明",
      suggestedAction: "在产品页或 FAQ 中明确标准交付周期和验收流程",
      businessValue: "减少售前咨询成本，帮助客户合理规划采购时间",
      evidenceIds: ["ev_first_product"],
    },
  ],
  evidence: [
    {
      id: "ev_first_home",
      title: "示例智能装备 - 官网首页",
      sourceDomain: "example-equip.com",
      sourceType: "FIRST_PARTY_EVIDENCE",
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      snippet: "为中小制造企业提供柔性装配线与售后运维服务。",
      url: "https://example-equip.com/",
    },
    {
      id: "ev_first_about",
      title: "示例智能装备 - 关于我们",
      sourceDomain: "example-equip.com",
      sourceType: "FIRST_PARTY_EVIDENCE",
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      snippet: "公司成立于华东地区,专注工业自动化装备。",
      url: "https://example-equip.com/about",
    },
    {
      id: "ev_first_product",
      title: "示例智能装备 - 产品中心",
      sourceDomain: "example-equip.com",
      sourceType: "FIRST_PARTY_EVIDENCE",
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      snippet: "柔性装配线产品参数与应用场景介绍。",
      url: "https://example-equip.com/products",
    },
    {
      id: "ev_observed_news",
      title: "行业媒体对示例智能装备的报道",
      sourceDomain: "industry-news.example.net",
      sourceType: "OBSERVED_WEB_EVIDENCE",
      authorityLevel: "MEDIA",
      supportLevel: "CONTEXT_ONLY",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      snippet: "报道提及该企业在区域装备市场的参与情况。",
      url: "https://industry-news.example.net/articles/example-equip",
    },
    {
      id: "ev_competitor_home",
      title: "竞品甲自动化 - 官网首页",
      sourceDomain: "competitor-jia.example.net",
      sourceType: "COMPETITOR_WEB_EVIDENCE",
      authorityLevel: "OWNED",
      supportLevel: "DIRECT_SUPPORT",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      snippet: "公开展示标准交付周期与验收流程。",
      url: "https://competitor-jia.example.net/",
    },
  ],
};

/** Frozen, known-valid canonical report shared by all agents at their mock seams. */
export const SAMPLE_DIAGNOSIS_REPORT: DiagnosisReportType = SAMPLE;

/**
 * Deep-clone the sample and apply shallow overrides. Use this to derive
 * edge-case variants (null dimensions, missing demonstrationFix, empty
 * competitorGaps, ...) inside your own tests without mutating the shared sample.
 */
export function buildSampleReport(
  overrides: Partial<DiagnosisReportType> = {},
): DiagnosisReportType {
  const clone = structuredClone(SAMPLE_DIAGNOSIS_REPORT);
  return { ...clone, ...overrides };
}

/** Parse-validate the shared sample against the canonical schema (used by tests). */
export function assertSampleValid(): DiagnosisReportType {
  return DiagnosisReport.parse(SAMPLE_DIAGNOSIS_REPORT);
}
