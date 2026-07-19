# Round-6 三企业真实样本 Runner 契约

状态：`RUNNER_PREPARED_NOT_EXECUTED`

本文件记录 Phase 0 的零 Provider 开发结果。三企业真实样本尚未运行；真实 Provider 调用、
新 Diagnosis、真实 SQLite 和私有样本目录写入均为 0。

实现：`scripts/three-company-real-sample.ts`  
测试：`tests/qa/three-company-real-sample-runner.test.ts`

## 1. 授权边界

- 唯一外部授权开关是进程环境 `THREE_COMPANY_SAMPLE_AUTHORIZED=true`，默认 false，且精确区分大小写。
- 同时要求 `PROVIDER_MODE=REAL`、`DIAGNOSIS_SMOKE_MODE=false` 及 Bocha/DeepSeek 服务端密钥存在。
- 授权函数没有 request/body/query/header/form 参数；API、URL、页面和 `NEXT_PUBLIC_*` 都不能开启。
- 未授权时在创建私有根目录、batch lock、子目录、SQLite 或调用执行器之前失败。
- 新开关通过后，runner 只向隔离的 Next 子进程内部注入现有
  `TECHNICAL_COMPANY_CANARY_AUTHORIZED=true` 接缝；公共请求值不参与桥接。
- 模块 import 完全惰性。`--plan` 是只读计划模式：Provider 0、Diagnosis 0、私有写入 0。

Phase 0 安全查看命令：

```text
pnpm exec tsx scripts/three-company-real-sample.ts --plan
```

不得在 Phase 0 设置授权开关后直接执行无参数命令。

## 2. 固定目标与顺序

runner 内置不可由 CLI、表单或 API 修改的三个目标：

1. `01-qiaqia`：洽洽食品股份有限公司，`https://www.qiaqiafood.com/`，竞品“三只松鼠”。
2. `02-iflytek`：科大讯飞股份有限公司，`https://www.iflytek.com/cn/`，只聚焦“企业AI解决方案、智慧办公和行业数字化”，竞品“百度智能云”。
3. `03-heli`：安徽合力股份有限公司 / 合力叉车，`https://www.helichina.com/`，竞品“杭叉集团”。

每家五个客户问题逐字冻结在 runner 常量中，不提供临时覆盖参数。批次用普通 `for...of` 配合
逐次 `await`，前一家完成并通过停批检查后才会启动下一家；不存在并行 Promise 或自动重跑。

## 3. 私有隔离与一次性锁

生产根目录固定为：

```text
E:\企业诊断智能体_private\three-company-sample-v1
```

- 批次锁：根目录 `batch-run-lock.json`，存在即拒绝第二次批次。
- 每家公司使用独立子目录、独立 SQLite 和独立 `run-lock.json`。
- SQLite 固定为 `qiaqia.sqlite`、`iflytek.sqlite`、`heli.sqlite`，不得共享。
- 路径在使用前解析并验证直接位于冻结根目录下，拒绝目录逃逸。
- 任一已有 SQLite 或公司 run-lock 都会在执行该公司前停批。
- 成功、稀疏或失败均保留 lock；runner 没有自动删除或重置能力。
- 私有产物路径已受 `.gitignore` 保护；不得提交数据库、日志、截图或 Provider 响应。

测试允许把 `privateRoot` 注入系统临时目录，只用于验证锁与串行编排。生产 `main` 始终传入冻结
根目录，不能通过 CLI 改写。

## 4. 预算

| 范围 | Bocha | Crawler | DeepSeek | Retry | Diagnosis |
| --- | --- | --- | --- | --- | --- |
| 单公司 | 预期≤10，硬上限12 | 总12；第一方8；竞品4 | 预期4，硬上限8 | 0 | 1 |
| 三公司 | 硬上限36 | 硬上限36 | 硬上限24 | 0 | 3 |

runner 对每家公司完成结果和累计批次结果分别检查。任何硬上限越界、任意 Retry 或 Diagnosis
数量异常都会立即停止。现有 runtime 的统一 `CanaryBudgetTracker` 在请求发出前执行 Crawler
总量、第一方/域和竞品结构性上限；当前 `provider_usage` 表只持久化 Crawler 聚合调用数，
因此 runner 的持久化读取对分项显示 `null`，不得伪造分项精度。
`null` 不会放行：在统一 runtime 分项持久化接缝合入前，默认执行器会以
`CRAWLER_USAGE_NOT_AUDITABLE` 停批。

## 5. 停批与继续规则

立即停止：Schema、安全、Public API 泄漏、Truth Guard、公开 `UNSUPPORTED` Claim、评分权重、
状态机、SQLite/run-lock 冲突、预算、Retry、Diagnosis 数量或执行器失败。停止后不会调用下一家。

以下情况在 `READY` 且真实性/技术检查通过时继续下一家：Issue=0、Opportunity=0、
Demonstration Fix=null、`SPARSE_BUT_TRUTHFUL`。runner 不会因产出稀疏修改问题、补 Opportunity
或自动重跑。

## 6. Phase 0 验证边界

Mock 测试只向系统临时目录写 batch/company lock、摘要和必需产物占位文件，执行器完全内存化；不打开 SQLite，
不访问公开网络，也不调用真实 Provider。覆盖：

- 默认未授权和大小写 fail-closed；
- API/body/URL/form/NEXT_PUBLIC 无授权接缝；
- 授权后隔离子进程桥接；
- 只读计划模式；
- 固定公司、官网、竞品、聚焦和 15 个问题；
- 三个独立目录/SQLite/run-lock；
- 每家公司必须生成 sanitized Canonical、Quick/Deep/Evidence/print 截图、log、Provider usage 和 sample metrics；缺一即停批；
- 严格串行且最大并发为 1；
- 单公司和批次预算；
- 全部停批原因；
- 稀疏 READY 继续；
- batch lock 阻止第二次运行。

真实执行前仍必须由 Supervisor 完成 Phase 0 集成 Gate、客户/线索/保密关系冲突检查、工作树
与私有历史 Hash 核验。不得在本阶段自动启动任何真实样本。
