# Round-6 Phase 0 Agent Z Checkpoint

状态：`SAMPLE_AGGREGATOR_AND_RUNNER_READY`

## 交付

- 三企业聚合器改为 Tier A/B/C/D/E，并从 Evidence 明细确定性派生全部比例。
- Opportunity 候选为 0 时 `opportunityYieldRate=null`。
- 独立 Partial 支持只消费 `IndependentSupportSourceKey`，不再统计 `normalizedDomain` 数量。
- 新增 server-only `THREE_COMPANY_SAMPLE_AUTHORIZED` fail-closed 开关与内部子进程桥接。
- 新增只读 `--plan`、固定三企业/15 问题、独立目录/SQLite/锁、严格串行、预算与停批框架。
- 稀疏 READY 不停批，不修改固定问题，不自动重跑，不补 Opportunity。

## Phase 0 不变量

- 真实 Provider 调用：0
- 公开网络调用：0
- 新 Diagnosis：0
- V1/V2/Insta360 数据库写入：0
- 三企业真实私有目录写入：0
- Runtime 源码修改：0
- `src/fixtures/` 修改：0

## 验证

- 聚焦 QA：43 tests PASS
- `pnpm typecheck`：PASS
- 目标 ESLint：PASS

- `pnpm test`：744/748 PASS；4 个共享接缝回归未在 Z 范围修改（2 个 Round-5.3 revision latest 读取断言、2 个统一 Policy 后旧 canary/live-seams 产出断言），由 Supervisor 在 X/Y 接缝集成中统一处理。
