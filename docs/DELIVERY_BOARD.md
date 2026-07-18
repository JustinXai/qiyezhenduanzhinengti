# DELIVERY_BOARD

Supervisor 维护。每个 Agent 自报 PASS 不等于通过 — 只有 Supervisor 复核实际 diff、
重新运行测试、确认未越权修改、未提交敏感数据、未削弱不变量之后才更新本表状态为
`VERIFIED`。

基线：`764283b`（`main`），六项 Gate 全绿（typecheck / lint / test / build /
smoke:mock / security:check，Supervisor 实测）。共享锚点：`src/fixtures/sample-report.ts`。
全部 7 个 worktree 分支已 fast-forward 到该基线。

Round-2（本轮再派发，2026-07-18）:

| Agent | 分支 | Worktree | 状态 | 基线 | Checkpoint |
|---|---|---|---|---|---|
| A 产品冻结 | `cursor/rebuild-product-contract` | `product-contract` | RE-DISPATCHED | 764283b | 半成品 docs/product/×2（未提交） |
| B 契约/Guard | `cursor/rebuild-contracts-guards` | `contracts-guards` | RE-DISPATCHED | 764283b | 半成品 guard-types/rounding（未提交） |
| C 搜索/Evidence | `cursor/rebuild-search-evidence` | `search-evidence` | RE-DISPATCHED | 764283b | - |
| D DeepSeek/诊断 | `cursor/rebuild-diagnosis-engine` | `diagnosis-engine` | RE-DISPATCHED | 764283b | - |
| E Runtime/API | `cursor/rebuild-runtime-api` | `runtime-api` | RE-DISPATCHED | 764283b | - |
| F 前端/报告 | `cursor/rebuild-frontend-report` | `frontend-report` | RE-DISPATCHED | 764283b | - |
| G QA/CI | `cursor/rebuild-qa-ci` | `qa-ci` | RE-DISPATCHED | 764283b | - |

状态取值：`DISPATCHED` → `CHECKPOINT_SUBMITTED` → `VERIFIED` → `INTEGRATED`。

Round-1 首次派发（同日更早）在全部 7 个 Agent 并行运行时集中撞上 session limit，
Agent 带着未提交改动被 API 掐断，几乎无工作落盘。本轮的硬性纠正见下方「抗中断纪律」。

## 抗中断纪律（每个 Agent 必须遵守）

1. 切片一绿立即本地 `commit`（先 typecheck+自身测试，再 commit），不攒大改动。
2. 只本地提交，**不 `push`**（远程推送由 Supervisor 审核后统一处理，仓库为 Public）。
3. Mock 接缝一律对着 `src/fixtures/sample-report.ts` 的 `SAMPLE_DIAGNOSIS_REPORT` 编码。
4. 严守 [AGENT_FILE_OWNERSHIP.md](AGENT_FILE_OWNERSHIP.md)，不碰他人目录与共享配置。

## 集成顺序

A → B → C → D → E → F → G，按依赖顺序合入 `integration/enterprise-diagnosis-rebuild`。
每次集成后运行：`pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm smoke:mock && pnpm security:check`，通过后立即 commit + push。

## 里程碑 Tag

- `rebuild-baseline-v0` — Supervisor 基线（已创建）
- `rebuild-vertical-slice-v1` — 第一轮 Mock Vertical Slice 全部 Gate 通过后
