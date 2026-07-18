# AGENT_FILE_OWNERSHIP

## Supervisor 独占

```
package.json
pnpm-lock.yaml
tsconfig.json
next.config.*
eslint.config.*
vitest.config.*
playwright.config.*
drizzle.config.*
AGENTS.md
src/contracts/index.ts
src/fixtures/            # 共享 Canonical Report 样例锚点，各 Agent 只读引用，不得修改
docs/DELIVERY_BOARD.md
docs/AGENT_FILE_OWNERSHIP.md
```

Agent 需要新增依赖时，只能创建 `agent-output/<agent-name>/DEPENDENCIES.md` 提出申请，
由 Supervisor 统一添加。

`src/fixtures/sample-report.ts` 导出唯一权威样例 `SAMPLE_DIAGNOSIS_REPORT` 与
`buildSampleReport(overrides)`。所有 Agent 在 Mock 接缝处对着它编码/断言，禁止另建
不兼容的样例 report 形状。

## Agent A — 产品冻结与需求追踪

分支 `cursor/rebuild-product-contract`，worktree
`E:\企业诊断智能体_worktrees\product-contract`。

可修改：`docs/product/`、`docs/recovery/`、`docs/PROJECT_FREEZE.md`、
`docs/PRODUCT_TRUTH_RULES.md`、`docs/REPORT_CONTRACT.md`、`docs/SCORE_CONTRACT.md`、
`docs/REQUIREMENTS_TRACEABILITY.md`。不编写业务代码。

## Agent B — 共享契约与发布 Guard

分支 `cursor/rebuild-contracts-guards`，worktree
`E:\企业诊断智能体_worktrees\contracts-guards`。

可修改：`src/contracts/`（除 `index.ts`）、`src/report/validation/`、
`tests/contracts/`、`tests/report-validation/`。不得实现 Provider。

## Agent C — 搜索、抓取与 Evidence

分支 `cursor/rebuild-search-evidence`，worktree
`E:\企业诊断智能体_worktrees\search-evidence`。

可修改：`src/providers/bocha/`、`src/diagnosis/search/`、`src/diagnosis/evidence/`、
`src/security/crawler/`、`tests/search/`、`tests/evidence/`、`tests/security/crawler/`。

## Agent D — DeepSeek 与诊断引擎

分支 `cursor/rebuild-diagnosis-engine`，worktree
`E:\企业诊断智能体_worktrees\diagnosis-engine`。

可修改：`src/providers/deepseek/`、`src/diagnosis/analysis/`、`src/report/generation/`、
`tests/providers/`、`tests/analysis/`、`tests/report-generation/`。不直接生成整页 HTML。

## Agent E — Runtime、Storage 与 API

分支 `cursor/rebuild-runtime-api`，worktree
`E:\企业诊断智能体_worktrees\runtime-api`。

可修改：`app/api/`、`src/runtime/`、`src/storage/`、`src/diagnosis/orchestration/`、
`tests/runtime/`、`tests/storage/`、`tests/api/`。

## Agent F — 前端与报告体验

分支 `cursor/rebuild-frontend-report`，worktree
`E:\企业诊断智能体_worktrees\frontend-report`。

可修改：非 API 页面（`app/` 下除 `app/api/`）、`components/`、`styles/`、`public/`、
`src/report/presentation/`、`tests/ui/`、`tests/report-presentation/`。不得实现评分或
搜索逻辑。

## Agent G — QA、安全、CI 与可信评审

分支 `cursor/rebuild-qa-ci`，worktree `E:\企业诊断智能体_worktrees\qa-ci`。

可修改：`tests/e2e/`、`tests/security/`、`tests/fixtures/`、`scripts/`、
`.github/workflows/`、`docs/qa/`、`docs/TRUST_AND_CONVERSION_REVIEW_V1.md`、
`docs/REPORT_V2_QUICK_DEEP_EXPERIENCE.md`。真实样本不得在第一轮运行。

## 全局规则

Agent 不得：修改其他 Agent 目录；修改共享配置；`reset --hard`；`clean -fdx`；
删除恢复文档；修改 `main`；直接合并；扩大产品范围。
