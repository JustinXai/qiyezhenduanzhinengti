// ============================================================================
// src/product/customer-copy.ts — Agent L (product-copy-freeze).
//
// THE single program source for customer-facing frozen copy. Guards, report
// components and doc-driven tests must import their strings from here instead
// of retyping them, so there is exactly one place a frozen string can drift.
//
// Authoritative text: docs/product/CTA_AND_DISCLAIMER_STRINGS.md (the frozen
// copy-paste source), docs/REPORT_CONTRACT.md and docs/PRODUCT_TRUTH_RULES.md.
//
// Punctuation ruling (Agent L, docs/PROJECT_FREEZE.md):
//   Customer-visible Chinese copy uses FULL-WIDTH Chinese punctuation
//   （，。；、：）, matching the frozen copy-paste source verbatim. This also
//   covers OQ-1 (the demonstrationFix disclaimer comma), which is now full-width
//   at its single source — the Zod literal in src/contracts/index.ts — and is
//   re-exported below via `.value` so it can never be retyped out of sync.
//
// NOTE for other agents (integration seams): the presentation service
// (Agent F, src/report/presentation/) and the CI copy scanner / e2e specs
// (Agent G) still carry local copies of some of these strings. They should
// import from this module to converge on the single source. See
// agent-output/agent-l/CHECKPOINT.md for the seam list.
// ============================================================================

import { DemonstrationFix } from "../contracts";

// ---------------------------------------------------------------------------
// §1 — Primary / secondary CTA labels (docs/REPORT_CONTRACT.md §8).
// ---------------------------------------------------------------------------

/** 主 CTA — 固定字面量。 */
export const PRIMARY_CTA_LABEL = "预约报告解读";
/** 次 CTA — 固定字面量。 */
export const SECONDARY_CTA_LABEL = "获取企业GEO优化方案";

// ---------------------------------------------------------------------------
// §2 — CTA explanation paragraph (docs/REPORT_CONTRACT.md §8, verbatim).
// One continuous paragraph, no line breaks.
// ---------------------------------------------------------------------------

export const CTA_DESCRIPTION =
  "我们将结合本报告与您的实际业务，进一步核验关键问题，并明确可实施的官网内容、客户问题覆盖、品牌知识和持续监测方案。";

// ---------------------------------------------------------------------------
// §3 — 30-minute session points (docs/REPORT_CONTRACT.md §8, verbatim).
// The leading "1）2）3）" numbering is rendered by the component; the frozen
// clause text is stored here. Contains the service brand name「凡间AI」— kept
// verbatim pending OQ-6 (see docs/REQUIREMENTS_TRACEABILITY.md).
// ---------------------------------------------------------------------------

/** UI heading immediately above the three points (punctuation-normalised). */
export const THIRTY_MINUTE_HEADING = "30 分钟解读会将帮助您：";

export const THIRTY_MINUTE_POINTS = [
  "核验报告中的关键结论是否符合企业实际；",
  "确定最值得优先处理的 3 件事；",
  "明确企业需提供什么、凡间AI可以交付什么，以及如何验收。",
] as const;

// ---------------------------------------------------------------------------
// §4 — Composite score name + banned aliases (docs/REPORT_CONTRACT.md §1).
// ---------------------------------------------------------------------------

/** 综合分固定命名。 */
export const OVERALL_SCORE_LABEL = "GEO基础诊断指数";

// 综合分禁用别名 — 不得出现在任何客户可见文案中。这是「检测清单」而非展示文案，
// 故每行标注 `security-check:allow`，与 src/report/validation/cta-guard.ts 中的
// BANNED_PHRASES 同理豁免 Agent G 的 banned-copy 扫描（scripts/security-check.ts）。
export const BANNED_SCORE_ALIASES = [
  "AI排名", // security-check:allow
  "AI推荐分", // security-check:allow
  "AI平台排名", // security-check:allow
  "企业经营分", // security-check:allow
  "市场权威指数", // security-check:allow
] as const;

// ---------------------------------------------------------------------------
// §5 — demonstrationFix disclaimer (docs/REPORT_CONTRACT.md §5).
// Single source: the Zod literal in src/contracts/index.ts. Re-exported via
// `.value` so callers never retype the sentence (OQ-1 — full-width comma).
// ---------------------------------------------------------------------------

export const DEMONSTRATION_FIX_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

// ---------------------------------------------------------------------------
// §6 — Competitor "insufficient evidence" placeholder
// (docs/REPORT_CONTRACT.md §3). Shown only when competitors WERE provided but
// public evidence is insufficient (see OQ-4 for the no-competitor case).
// ---------------------------------------------------------------------------

export const COMPETITOR_INSUFFICIENT_EVIDENCE =
  "已收到竞品输入，但本次公开证据不足，暂不做确定性比较。";

// ---------------------------------------------------------------------------
// §7 — Score-coverage hints (docs/SCORE_CONTRACT.md, verbatim).
// ---------------------------------------------------------------------------

/** 全部维度均为 ESTIMATED 时。 */
export const SCORE_HINT_ALL_ESTIMATED = "本次结果主要基于公开网络信息估算。";
/** 存在未测得维度（INSUFFICIENT_EVIDENCE / PROVIDER_FAILED）时。 */
export const SCORE_HINT_SOME_UNMEASURED = "部分维度暂未测得。";

/** 评分完整度标签 — 替代旧版「有效评分覆盖率」。 */
export const SCORE_COVERAGE_LABEL = "评分完整度";

// ---------------------------------------------------------------------------
// §8 — AI-visibility sample disclaimer (docs/PRODUCT_TRUTH_RULES.md §8).
// The frozen docs give no verbatim template, only four facts that MUST all be
// conveyed. This string covers all four; content is a measurement disclaimer
// (business meaning) — only sentence punctuation was normalised to full-width.
// The four facts are locked by tests/product/customer-copy.test.ts.
// ---------------------------------------------------------------------------

export const AI_SAMPLE_DISCLAIMER =
  "以下为当前模型、当前时间、当前问题集下的诊断样本，用于观察 AI 如何谈论企业；" +
  "不是豆包 / 元宝 / Kimi 等多平台监测，也不代表全网 AI 推荐率或市场份额。";

// ---------------------------------------------------------------------------
// §9 — Banned marketing / coercion phrases (docs/PRODUCT_TRUTH_RULES.md §9).
// ---------------------------------------------------------------------------

// Detection list (not display copy); each line is exempted from the customer
// banned-copy scan via the `security-check:allow` marker, exactly as
// src/report/validation/cta-guard.ts is exempted by path.
export const BANNED_MARKETING_PHRASES = [
  "提升AI推荐概率", // security-check:allow
  "显著提升", // security-check:allow
  "保证提升", // security-check:allow
  "转化为实际商机", // security-check:allow
  "快速获得客户", // security-check:allow
  "保证排名", // security-check:allow
  "保证流量", // security-check:allow
  "保证线索", // security-check:allow
  "保证收入", // security-check:allow
  "不优化就会失去市场", // security-check:allow
  "竞品正在抢走你的客户", // security-check:allow
] as const;

// ---------------------------------------------------------------------------
// §10 — Three-phase roadmap goal names (docs/REPORT_CONTRACT.md §7, verbatim).
// Only the phase GOAL names are frozen; phase labels / outcome prose are UI.
// ---------------------------------------------------------------------------

export const ROADMAP_PHASE_GOALS = [
  "统一品牌与业务表达",
  "覆盖高意向客户问题",
  "持续测试和更新",
] as const;

// ---------------------------------------------------------------------------
// Round-7: 销售用词边界 (docs/product/ROUND7_QUICK_FIRST_SME_CONVERSION.md §六)
// 用于指导客户沟通语言，不得在无真实数据时使用夸大承诺
// ---------------------------------------------------------------------------

/**
 * Round-7 推荐使用的销售词汇
 * 在客户沟通和报告文案中优先使用这些表达
 */
export const RECOMMENDED_SALES_TERMS = [
  "AI问答覆盖机会",
  "公开信息完善机会",
  "品牌事实表达机会",
  "客户决策内容机会",
  "产品与服务结构化机会",
] as const;

/**
 * Round-7 禁用销售词汇
 * 在没有真实排名、Probe 或需求数据时不得使用
 * 这些词汇涉及效果承诺，需要真实数据支撑
 */
export const BANNED_SALES_TERMS = [
  "排名提升空间巨大",   // security-check:allow 夸大效果
  "曝光一定增长",       // security-check:allow 绝对化承诺
  "AI排名靠后",         // security-check:allow 缺乏客观基准
  "能快速霸屏",         // security-check:allow 不切实际
  "抢占第一",           // security-check:allow 无法保证
  "保证推荐",           // security-check:allow 违反真实性
  "保证排名",           // security-check:allow 已有 §9 禁止
  "保证流量",           // security-check:allow 已有 §9 禁止
  "保证线索",           // security-check:allow 已有 §9 禁止
  "保证收入",           // security-check:allow 已有 §9 禁止
] as const;

/**
 * Round-7 PublicInformationOpportunity 必需限定语
 * 用于限定检查范围，避免绝对化表述
 */
export const PUBLIC_INFO_REQUIRED_QUALIFIER =
  "在本次已检查的公开页面和搜索结果中，";

/**
 * Round-7 PublicInformationOpportunity 禁用表述
 * 不得使用的绝对化或否定性表述
 */
export const PUBLIC_INFO_BANNED_PHRASES = [
  "企业没有",
  "官网完全缺失",
  "用户一定找不到",
  "AI不会推荐",
  "排名很差",
] as const;
