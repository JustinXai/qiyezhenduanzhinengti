# Agent B Checkpoint — 共享契约计算器与发布 Guard (Round-1)

Branch: `cursor/rebuild-contracts-guards` (base `31972e3`). **Not pushed** (per discipline).

## 做了什么

纯计算器 + 发布 Guard，全部对着 `SAMPLE_DIAGNOSIS_REPORT` 编码/测试，基于已有半成品
`src/contracts/guard-types.ts` 与 `src/contracts/rounding.ts` 构建。

### 新增/纳入的源码 (`src/`)
- `src/contracts/guard-types.ts` — 纳入提交（此前未提交的半成品）。GuardName/GuardRuleCode/
  GuardViolation/GuardResult + `combineGuardResults`。刻意不进 `index.ts`。
- `src/contracts/rounding.ts` — 纳入提交（半成品，未改逻辑）。`roundTo`/`roundForDisplay`/`roundInternal`。
- `src/report/validation/score-calculator.ts` — 纯函数 `computeScoreBlock`。非 null 维度重新归一化、
  `scoreCoverage<0.70 → overallScore=null`（null≠0）、内部 2 位小数。导出 `SCORE_COVERAGE_THRESHOLD`。
- `src/report/validation/ai-visibility-calculator.ts` — `computeAIVisibility`。§8：`<3` 有效样本→
  `score=null`、`confidence≤0.40`；`≥3`→ 50% 提及率 + 30% 准确度 + 20% 推荐强度，理由按真实计数程序生成。
- `src/report/validation/evidence-guard.ts` — `evidenceGuard`。§4.1–§4.6、§4.8。
- `src/report/validation/cross-field-guard.ts` — `crossFieldGuard`（分数一致性、demonstrationFix 证据）
  + `viewModelEvidenceGuard`（视图模型 evidenceId 存在性，供 Agent F 调用）。
- `src/report/validation/cta-guard.ts` — `ctaGuard`。§9 禁用文案/别名扫描、主/次 CTA 字面量、Quick 字符预算。
- `src/report/validation/publish-guard.ts` — `publishGuard`，用 `combineGuardResults` 聚合统一入口。
- `src/report/validation/index.ts` — 模块公开面（供 D/E/F import）。

### 测试 (`tests/`)
- `tests/contracts/score-calculator.test.ts`（7）— 全 null / 0.65(下) / 0.75(上) / 重新归一化 / 四舍五入。
- `tests/contracts/ai-visibility-calculator.test.ts`（10）— 空 / 2 有效 / 恰好 3 / 满分 / null 桶 / 置信度爬升&封顶。
- `tests/report-validation/evidence-guard.test.ts`（11）、`cross-field-guard.test.ts`（10）、
  `cta-guard.test.ts`（8）、`publish-guard.test.ts`（7）、`support.ts`（共享 helper，非测试文件）。

## Gate 结果
- `pnpm typecheck` — PASS（clean）
- `pnpm vitest run tests/contracts tests/report-validation` — **54 passed / 7 files**
- `pnpm test`（全量）— 54 passed
- `pnpm lint` — PASS（exit 0）。注：本 worktree 的 `node_modules` 初始缺失
  `@next/eslint-plugin-next`，`pnpm install` 后修复（lockfile 未变、未改任何 Supervisor 文件）。

## Commits（本地，未 push）
```
374337c feat(contracts): add shared guard result/violation types + rule codes
0dccb11 feat(validation): add aggregating publish-guard + module barrel
87fbd85 feat(validation): add CTA/copy guard (§9 + REPORT_CONTRACT §8)
9a69cf4 feat(validation): add cross-field guard (score/demoFix/view-model)
79c7561 feat(validation): add evidence semantic guard (PRODUCT_TRUTH_RULES §4)
4667a7f feat(validation): add programmatic ai-visibility-calculator (§8)
69d44da feat(validation): add pure score-calculator (overallScore/scoreCoverage)
```

## ⚠️ 阻塞级接缝发现：冻结样例与契约不一致（需 Supervisor 处理）

### 发现 1（重要）— `SAMPLE_DIAGNOSIS_REPORT` 的证据支持等级不满足 PRODUCT_TRUTH_RULES §4
- 现象：`evidenceGuard(SAMPLE_DIAGNOSIS_REPORT)` 产生 **5 条违规**，因此
  `publishGuard(rawSample)` 为 `ok:false`（**仅** evidence guard 触发；score/cross-field/cta 均通过）。
- 根因（逐条）：核心问题/机会引用的证据未达 §4 要求的支持等级——
  - `iss_1`→`ev_first_product`(PARTIAL)、`iss_3`→`ev_first_product`(PARTIAL)：核心问题需 1 条 DIRECT → `TRUTH_4_1`
  - `iss_2`→`ev_observed_news`(CONTEXT_ONLY)、`geo_2`→`ev_observed_news`(CONTEXT_ONLY)：CONTEXT_ONLY 单独不足 → `TRUTH_4_4`
  - `geo_1`→`ev_first_product`(单条 PARTIAL)：机会需 1 DIRECT 或 2 PARTIAL → `TRUTH_4_3`
- 影响范围：任何“raw SAMPLE → publishGuard ok”的断言都不成立；Agent D 若照搬样例证据等级组装报告会被
  Guard 拦截；Agent G 端到端 mock 若期望样例直接过 publish 会红。
- 我的处理（不围绕单点打补丁）：**Guard 忠实实现 §4**（不放水，否则 Guard 失去意义）；happy-path 测试改用
  `tests/report-validation/support.ts` 的 `buildValidReport()`——它从样例派生，仅把
  `ev_first_product`/`ev_observed_news` 升级为 `DIRECT_SUPPORT`，即可整体满足 §4。另有一条**绿色但被 pin 的
  测试**记录 raw 样例当前 5 条违规，一旦 Supervisor 修复 fixture 该测试会转红以提醒更新。
- 建议修复（Supervisor 独占 `src/fixtures/`，二选一）：
  1. 把样例中被核心问题/机会引用的证据支持等级上调至 `DIRECT_SUPPORT`（最小改动，等价于 `buildValidReport`）；或
  2. 让这些 claim 改引用样例里已有的 DIRECT 证据（如 `ev_first_home`），并补足语义相关的 DIRECT 证据。

### 发现 2 — 样例 `aiVisibility.score=40` 与 §8 不自洽
- 样例只有 2 个 `VALID` AI 测试（`aiv_1`/`aiv_2`），但 `aiVisibility.score=40`、`confidence=0.6`。
  按 §8「<3 有效样本→score=null、confidence≤0.40」，`computeAIVisibility(sample.aiVisibilityTests)` 会返回
  `score=null`。
- 处理：**未**把 ai-visibility 重算接进 publish-guard（任务项 4 的 cross-field 未要求，且会误伤样例其余部分）；
  ai-visibility-calculator 作为独立计算器（任务项 2）交付并单测。已在测试中显式记录该接缝。
- 建议：Supervisor 决定是修 fixture（让 aiVisibility 维度与 §8 计算一致，或增加到 3 个 VALID），还是明确
  “fixture 的维度分是占位、不要求与计算器一致”。

## 与其他 Agent 的接缝假设
- **Agent D（评分接缝）**：D 组装报告时应调用
  `computeScoreBlock(scores)` 写回 `overallScore/scoreCoverage`，并调用
  `computeAIVisibility(tests)` 写回 `aiVisibility` 维度的 `score/confidence`（并可用其返回的
  `measurementStatus/rationale/evidenceIds`）。confidence 公式（`<3`：`0.40*n/3` 封顶 0.40；`≥3`：
  `0.50 + 0.10*(n-3)` 封顶 0.90）由 B 定义，是本计算器为单一事实源；若 D 另有约定请对齐。
  `crossFieldGuard` 会用同一 `computeScoreBlock` 复核 D 写回的分数（EPSILON=0.005）。
- **Agent F（视图校验）**：`viewModelEvidenceGuard(report, {quick?,deep?,evidenceView?})` 已就绪，校验
  视图模型引用的 evidenceId 均存在于 `report.evidence`；`ctaGuard` 可传入 `quick` 做 §9 扫描与
  Quick 字符预算（`QUICK_CHARACTER_BUDGET=1800`，`countQuickVisibleChars` 已导出）。CTA 字面量：
  `PRIMARY_CTA_LABEL="预约报告解读"`、`SECONDARY_CTA_LABEL="获取企业GEO优化方案"`。
- **视图模型 evidenceId**：CTA 字面量不在 canonical `DiagnosisReport` 内（是 Quick 投影时注入的冻结字面量），
  故 `ctaGuard` 的 label/预算检查仅在传入 `quick`/`cta` 时运行。

## 有意未做（记录，非遗漏）
- §4.7「禁止 array[0] 兜底」、§4.9「抓取/Provider/索引失败不得成为客户核心问题」：属生成期纪律，成品报告
  数据不携带可判定的溯源；`guard-types.ts` 也无对应规则码。留给 Agent D 生成期自律 + Agent G 评审。
- 未调用任何真实 Provider。未新增依赖（无 `DEPENDENCIES.md`）。未改 `src/contracts/index.ts`、`src/fixtures/`、
  其他 Agent 目录、共享配置。

## 遗留问题（给 Supervisor 决策）
1. 修复发现 1（fixture §4 证据等级）——阻塞“raw SAMPLE → publish ok”。
2. 裁定发现 2（aiVisibility 维度分与 §8 的关系）。
3. confidence 计算的 `<3`/`≥3` 公式是否采纳 B 的定义为契约。
