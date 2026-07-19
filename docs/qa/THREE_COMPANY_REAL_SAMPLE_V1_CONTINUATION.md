# Round-6A 三企业真实样本 Continuation V1

状态：`PHASE_A_IMPLEMENTED_NOT_EXECUTED`

实现：`scripts/three-company-batch-continuation.ts`  
测试：`tests/qa/three-company-batch-continuation.test.ts`

本阶段 Provider 调用、网络访问、新 Diagnosis、真实 SQLite 写入和
`E:\企业诊断智能体_private` 写入均为 0。本文件只定义 Supervisor 后续受控执行可使用的
续跑接缝；不授权执行真实样本。

## 1. 独立续跑，不恢复原批次

`ThreeCompanyBatchContinuationV1` 是独立的一次性续跑账本，预期由 Supervisor 的私有 Store
写入：

```text
E:\企业诊断智能体_private\three-company-sample-v1\batch-continuation-1.json
```

续跑 Store 只有三个能力：创建新续跑记录、更新新续跑记录、只读核验原批次内容 Hash。
它没有更新、删除、恢复或重命名原 `batch-run-lock.json` 的方法。启动前、每家公司启动前和
全部完成后均复核原批次 Hash；任何变化以 `PARENT_BATCH_MUTATED` 停止。

新记录固定包含：

- `continuationId=batch-continuation-1`；
- 原 `parentBatchId`、`parentBatchStatus=STOPPED` 和内容 Hash；
- `acceptedCompletedCompany=qiaqia`；
- 已通过 Truth Guard 的洽洽 append-only revision ID/Hash；
- `remainingTargets=[iflytek, heli]`；
- 服务端授权状态、创建/开始/完成时间、状态和停止原因；
- Provider/Diagnosis 预算、累计量及已完成目标。

原洽洽 Canonical 和原 STOPPED 批次仅作为预检事实与不可变封印，不是续跑写入目标。

## 2. 服务端授权与预检

唯一新开关是进程环境：

```text
THREE_COMPANY_SAMPLE_CONTINUATION_AUTHORIZED=true
```

默认 false，且精确区分大小写。授权还要求 `PROVIDER_MODE=REAL`、
`DIAGNOSIS_SMOKE_MODE=false` 和两个服务端 Provider 配置存在。授权函数没有 Request、body、
URL、query、header、表单或前端参数；公共入口静态回归保证不读取该开关。

创建续跑账本或调用执行器前，必须全部满足：

1. 洽洽最新 revision Truth Guard 通过；
2. 原洽洽 Canonical 保留；
3. 原批次仍为 `STOPPED`，且 ID/Hash 完整；
4. `batch-continuation-1` 不存在；
5. 科大讯飞、安徽合力都不存在 Diagnosis；
6. Competitor Gap 统一策略已进入正常 Runtime；
7. 正常 Runtime 已持久化 `analysis_stage_runs`；
8. Candidate 最终 Publication Decision 审计完整；
9. 接受的洽洽 revision ID/Hash 完整。

任一失败均在新续跑账本创建和执行器调用前 fail-closed。

## 3. 固定顺序、预算与停止规则

固定顺序只有：

1. `iflytek`；
2. `heli`。

目标直接复用 Round-6 冻结输入，不接受 CLI/API 临时覆盖。普通 `for...of` 逐次 `await`，
最大并发为 1，无 Retry、无自动重跑；新 Diagnosis 必须恰好为 2，每家恰好 1 个。续跑目标
常量和账本的 `remainingTargets` 都不含 `qiaqia`。

| 范围 | Bocha | Crawler | DeepSeek | Retry | 新 Diagnosis |
| --- | ---: | ---: | ---: | ---: | ---: |
| 单公司 | ≤12 | ≤12 | ≤8 | 0 | 1 |
| Continuation | ≤24 | ≤24 | ≤16 | 0 | 2 |

以下任一事实立即停止，且不启动下一家公司：Schema、安全、预算、Retry、Public API 泄漏、
公开 UNSUPPORTED、Competitor Gap Truth 违规、Publication Decision 不完整、Candidate Source
不可审计、状态机异常，以及原批次封印变化。现有 Runner 的语言、Quick 字符、移动端、打印、
同源、审计和 Crawler 可审计规则继续适用。

以下事实不会停止或触发重跑：Issue=0、Opportunity=0、Demonstration Fix=null、
`SPARSE_BUT_TRUTHFUL`。

## 4. 三态聚合

聚合输入身份被固定为：

1. 洽洽 `LATEST_APPEND_ONLY_REVISION`；
2. 科大讯飞最终 `CANONICAL`；
3. 安徽合力最终 `CANONICAL`。

洽洽若标为普通 Canonical 会被拒绝，避免原违规报告混入聚合。公司缺失时不创建占位报告、
不伪造 0 指标，也不将未运行公司计作失败：

- 已观察到的 Truth、公开 UNSUPPORTED、Quick>1800、View Switch Provider Call、Opportunity
  Lineage 或通用模板 Opportunity 硬违规可以立即 `FAIL`；
- 其余依赖完整三企样本的数据为 `NOT_EVALUABLE`；
- 三家公司齐全后，10 项 Gate 都必须成为 `PASS` 或 `FAIL`，不得残留
  `NOT_EVALUABLE`。

Gate ID 和最终公式复用冻结的 Round-5.3 十项产品契约。稀疏但真实的报告不是系统失败。

## 5. 公共 API 隔离与 Phase A 证据

续跑记录、accepted revision 内部身份、Publication Decision、Candidate Source provenance、
legacy checkpoint/stage-run 身份均为内部审计数据。公共 API/页面不得返回，也不得用公共输入
开启授权。`publicApiInternalAuditLeakKeys` 提供投影后的防御性递归检查，静态测试同时扫描公开
API、表单和报告页面。

Phase A 重点覆盖：

- #17 Continuation 固定排除洽洽；
- #18 严格串行且只允许两个 Diagnosis；
- #19 十项聚合 Gate 支持 `NOT_EVALUABLE`，缺失公司不虚构指标；
- #20 公共 API 不泄漏 Decision/provenance 或服务端授权。

测试 Store、Executor 和父锁核验全部为内存注入；没有创建真实私有目录或连接 Provider。
