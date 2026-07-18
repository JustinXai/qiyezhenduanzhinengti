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
export const OVERALL_SCORE_LABEL = "GEO可见度基础指数";

/** 综合分禁用别名 — 不得出现在任何客户可见文案中。 */
export const BANNED_SCORE_ALIASES = [
  "AI排名",
  "AI推荐分",
  "AI平台排名",
  "企业经营分",
  "市场权威指数",
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

export const BANNED_MARKETING_PHRASES = [
  "提升AI推荐概率",
  "显著提升",
  "保证提升",
  "转化为实际商机",
  "快速获得客户",
  "保证排名",
  "保证流量",
  "保证线索",
  "保证收入",
  "不优化就会失去市场",
  "竞品正在抢走你的客户",
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
