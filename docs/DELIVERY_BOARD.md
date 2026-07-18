# DELIVERY_BOARD

Supervisor 维护。每个 Agent 自报 PASS 不等于通过 — 只有 Supervisor 复核实际 diff、
重新运行测试、确认未越权修改、未提交敏感数据、未削弱不变量之后才更新本表状态为
`VERIFIED`。

| Agent | 分支 | Worktree | 状态 | 最新 Commit | Checkpoint |
|---|---|---|---|---|---|
| A 产品冻结 | `cursor/rebuild-product-contract` | `product-contract` | DISPATCHED | - | - |
| B 契约/Guard | `cursor/rebuild-contracts-guards` | `contracts-guards` | DISPATCHED | - | - |
| C 搜索/Evidence | `cursor/rebuild-search-evidence` | `search-evidence` | DISPATCHED | - | - |
| D DeepSeek/诊断 | `cursor/rebuild-diagnosis-engine` | `diagnosis-engine` | DISPATCHED | - | - |
| E Runtime/API | `cursor/rebuild-runtime-api` | `runtime-api` | DISPATCHED | - | - |
| F 前端/报告 | `cursor/rebuild-frontend-report` | `frontend-report` | DISPATCHED | - | - |
| G QA/CI | `cursor/rebuild-qa-ci` | `qa-ci` | DISPATCHED | - | - |

状态取值：`DISPATCHED` → `CHECKPOINT_SUBMITTED` → `VERIFIED` → `INTEGRATED`。

## 集成顺序

A → B → C → D → E → F → G，按依赖顺序合入 `integration/enterprise-diagnosis-rebuild`。
每次集成后运行：`pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm smoke:mock && pnpm security:check`，通过后立即 commit + push。

## 里程碑 Tag

- `rebuild-baseline-v0` — Supervisor 基线（已创建）
- `rebuild-vertical-slice-v1` — 第一轮 Mock Vertical Slice 全部 Gate 通过后
