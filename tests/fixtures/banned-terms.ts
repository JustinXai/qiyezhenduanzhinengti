// ============================================================================
// tests/fixtures/banned-terms.ts — Agent G (qa-ci).
//
// Single source of truth for forbidden customer-facing copy. Consumed by:
//   - scripts/security-check.ts   (build-time gate over customer-visible source)
//   - tests/security/banned-copy.test.ts (guards the canonical report payload)
//   - tests/e2e/report.spec.ts    (guards the rendered DOM, INTEGRATION-GATED)
//
// Keep this in sync with docs/REPORT_CONTRACT.md §1 and
// docs/PRODUCT_TRUTH_RULES.md §9. This file must NOT itself be scanned by the
// customer-visible banned-copy scan (it lives under tests/, which the scanner
// excludes by design).
// ============================================================================

/** 综合分只能命名为「GEO基础诊断指数」，禁用这些别名 — docs/REPORT_CONTRACT.md §1. */
export const BANNED_SCORE_ALIASES = [
  "AI排名",
  "AI推荐分",
  "AI平台排名",
  "企业经营分",
  "市场权威指数",
] as const;

/** 禁用营销 / 夸大 / 恐吓式文案 — docs/PRODUCT_TRUTH_RULES.md §9. */
export const BANNED_MARKETING_COPY = [
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

export type BannedCategory = "score-alias" | "marketing-copy";

export interface BannedTerm {
  term: string;
  category: BannedCategory;
}

export const BANNED_TERMS: readonly BannedTerm[] = [
  ...BANNED_SCORE_ALIASES.map((term): BannedTerm => ({ term, category: "score-alias" })),
  ...BANNED_MARKETING_COPY.map((term): BannedTerm => ({ term, category: "marketing-copy" })),
];

/** Return every banned term contained in `text` (substring match). */
export function findBannedTerms(text: string): BannedTerm[] {
  return BANNED_TERMS.filter(({ term }) => text.includes(term));
}
