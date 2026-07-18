// Forbidden marketing copy (docs/PRODUCT_TRUTH_RULES.md §9) plus the frozen
// list of banned score aliases (docs/REPORT_CONTRACT.md §1). Presentation output
// must never contain any of these. Agent G owns the authoritative CI scan; this
// local copy lets the presentation tests self-guard.
export const FORBIDDEN_COPY = [
  // §9 promise/coercion language
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
  // §1 banned score aliases
  "AI排名",
  "AI推荐分",
  "AI平台排名",
  "企业经营分",
  "市场权威指数",
] as const;
