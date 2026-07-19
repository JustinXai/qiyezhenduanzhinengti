# Round-5.2B Frozen-Evidence Analysis Recovery Forensics

## 结论

- 审计对象：`diag_d9d81ba3428f4696b088870ca7416e49`（短 ID `diag_d9d`）。
- 审计状态：`FAILED / ANALYZING / REPORT_CLAIMS_FAILED`。
- `PROFILE`：`NOT_RECOVERABLE`。
- `SCORING`：`NOT_RECOVERABLE`。
- `AI_VISIBILITY`：`NOT_RECOVERABLE`。
- `CLAIMS`：`NOT_AVAILABLE`。运行时记录了 Schema 失败，但无效 Provider Payload 未持久化，
  因此不能对现存 Payload 标记 `INVALID`，也不能从错误摘要重建。
- 22 条 Evidence 和 `NORMALIZING_EVIDENCE` Checkpoint 完整存在；SQLite 副本
  `PRAGMA integrity_check=ok`。
- 没有发现可安全导入的 Profile、Scoring、AI Visibility 或 Claims 结构化 JSON。
- `competitorResolutionHash` 与 `queryPlanHash` 均为 `NOT_AVAILABLE`。在 Round-5.2B 明确要求
  两者相等验证的前提下，当前恢复必须 fail closed；不得用 Evidence、Provider Usage、运行摘要或
  确定性重算冒充原始 Hash。
- 若且仅若 Supervisor 后续以明确契约解决上述两个不可验证前提，分析阶段需要从 Profile 开始，
  固定重跑 `PROFILE → SCORING → AI_VISIBILITY → CLAIMS`，对应 DeepSeek 上限 4 次、重试 0。

完成标志：`READY_FOR_RECOVERY_DECISION`

## 只读方法与边界

审计脚本为 `scripts/analysis-recovery-audit.ts`。它先对私有源文件取 SHA-256，再将
SQLite 主库、WAL、SHM 三件套复制到系统临时目录，只在副本上以 `readonly + query_only`
连接查询；退出时删除临时副本。审计前后重新计算 V1、V2 目录及源数据库文件 Hash，结果均未变。

没有写 SQLite、没有写 Checkpoint、没有调用 Bocha、Crawler 或 DeepSeek，没有保存或输出完整
Prompt、Provider Response、API Key、Authorization、完整用户输入或 Evidence 内容。

稳定 JSON Hash 规则：对象键递归按字典序排序，数组顺序保持，UTF-8、无空白序列化后计算
SHA-256。目录 Hash 规则：相对路径按 `/` 归一化并排序，对每个文件记录
`{name, bytes, sha256}`，再按前述稳定 JSON 规则计算 SHA-256。

`v2DatabaseHash` 是 SQLite 所有业务表的逻辑快照 Hash：每表包含表名、建表 SQL Hash、行数和
稳定行集 Hash；按主键（无主键时按全部列）排序。物理可恢复载体另记主库 + WAL 的
`v2DurableBundleHash`，SHM 单独记录，避免把瞬态共享内存混作逻辑数据库身份。

## 阶段可恢复性

Round-5.2B 要求一个阶段同时具备完整结构化输出、Schema 可验证、Input Hash、Prompt 版本、
Model、完成时间和 Output Hash。缺任一项即不可恢复。

| 阶段 | 判定 | 完整输出 | Schema | Input Hash | Prompt | Model | 完成时间 | Output Hash | 原因 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| PROFILE | `NOT_RECOVERABLE` | 无 | 无对象可验 | 无 | 无 | 无 | 无 | 无 | SQLite、Checkpoint 和 V2 JSON 均无完整输出 |
| SCORING | `NOT_RECOVERABLE` | 无 | 无对象可验 | 无 | 无 | 无 | 无 | 无 | 同上 |
| AI_VISIBILITY | `NOT_RECOVERABLE` | 无 | 无对象可验 | 无 | 无 | 无 | 无 | 无 | 同上 |
| CLAIMS | `NOT_AVAILABLE` | 无 | 运行时失败 | 无 | 无 | 无 | 无 | 无 | 仅保存错误路径，未保存无效响应本体 |

Claims 的可审计错误为 `demonstrationFix.currentIssue: Required`；错误消息本身的 SHA-256 为
`21dae07cde3899603073dcdb2e1128a55d7f58f9b2b924f657ea4982e5941eee`。这只能证明
Claims Schema 校验失败，不能证明或重建候选 Claims 的任何字段。

## Checkpoint、结构化 JSON 与表状态

数据库仅有 1 个 Checkpoint：

| Stage | Input Hash | Prompt / Model | Completed at (UTC) | 原始 Output JSON Hash |
|---|---|---|---|---|
| `NORMALIZING_EVIDENCE` | `76c4920879b396b3e2104b4fe0060e29aff6fede1c5dc7ec5637dacaf550edc2` | `n/a / n/a` | `2026-07-19T01:27:40Z` | `18cdd38c2761062237ca682f66971da068bb269f1c12d3ce29df13c70c123446` |

原始 Output JSON Hash 对数据库中原始字符串字节计算；解析后按稳定 JSON 规则计算的 22 条
Evidence Hash 见下一节。两者用途不同，不应混写。

对 V2 两个 JSON artifact 及所有 SQLite JSON 文本字段进行了结构形状扫描，没有发现完整匹配
现行 Profile、Scoring、AI Visibility 或 Claims Stage Schema 的 Payload。Provider Usage 只包含
计数和错误分类，不包含阶段输出；运行摘要只包含状态、聚合数和错误信息，均不可导入为阶段成功。

| 表 | 行数 | 稳定行集 Hash |
|---|---:|---|
| `analysis_checkpoints` | 1 | `10625572d65ca195a68bbe301e14f5061b7fe1a2f21ded822c5cb61c4a8881e0` |
| `claim_evidence_relations` | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `diagnosis_requests` | 1 | `10bde4b66451167c458cc0a3bda4c726680c80070ca4d40964c2b81ff5dbfa7a` |
| `evidence` | 22 | `9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce` |
| `provider_usage` | 12 | `74373120b7e21bfc9aba86a4a3f24e2ed1776f568d542ad651eae617f772b73b` |
| `reports` | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

## 冻结输入与 Hash

| 对象 | SHA-256 / 状态 | 定义 |
|---|---|---|
| diagnosisInputHash | `7f83796f15c71668550d3b281055c11830f4d302d93bffc21c8de0fe02b73038` | 解析后的 `diagnosis_requests.input_json` 稳定 Hash |
| evidenceRegistryHash | `9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce` | `evidence` 表 22 行、按 ID 排序的完整持久化字段稳定 Hash |
| 当前 22 条 Evidence 稳定 Hash | `b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd` | `NORMALIZING_EVIDENCE.output_json` 解析后的数组稳定 Hash |
| competitorResolutionHash | `NOT_AVAILABLE` | 完整 `CompetitorResolution` 未持久化 |
| queryPlanHash | `NOT_AVAILABLE` | planned / executed query plan 均未持久化 |
| V1 目录 Hash | `1465e42ff81e94858fed7e54d61272c4127dc171df94f5e0377912ba3763b934` | V1 全部 13 个文件清单稳定 Hash |
| V2 目录 Hash | `106d38a2288936ed5e41d89d62d046a1c0c053be643b5927c6cbb02ed1b2995e` | V2 全部 5 个文件清单稳定 Hash |
| V2 数据库逻辑 Hash | `bc8a5e062d366e1abd29f908ed89fe5ec0301e3a85a80520709925c2c1e402d6` | 全部业务表逻辑快照 |
| V2 主库 + WAL Hash | `7ac1e22a2a21091e180f046487979f5fb4674b18f8bd3d20e44dfad30cd445ef` | 两个持久文件清单稳定 Hash，不含 SHM |
| V2 run-lock Hash | `b86df78852ed7ac06d93ae43c4b5e4b9ee34c43221b74a35ddb6eb224aef48f8` | 原始文件字节 Hash |

### Competitor Resolution

V2 Evidence Registry 中存在 2 条 `COMPETITOR_WEB_EVIDENCE`，但 Evidence 行不包含完整解析对象的
输入项、查询、状态、providedDomain、resolvedDomain、置信度或解析证据集合。两条 Evidence
不能唯一重建原始 `CompetitorResolution[]`，因此不得为其计算替代 Hash。

### Query Plan

当前正式管线没有把 planned queries、executed queries 或 Query Plan ID 写入 SQLite、Checkpoint、
failure summary 或 run-lock。根据输入重新调用 Query Planner 会生成新的派生对象，不是读取原始
运行产物，而且 Round-5.2B 恢复模式明确禁止调用 Query Planner。因此 Query Plan Hash 不可得。

### Fail-closed 影响

Round-5.2B 恢复入口要求同时验证 Input、22 条 Evidence、Competitor Resolution、Query Plan 与
run-lock 不变。当前能验证 Input、两种 Evidence Hash、数据库与 run-lock；不能验证后两项。
因此 Agent M 不授权真实恢复。处理这一矛盾需要 Supervisor 明确决定并形成可测试的恢复契约，
不能由审计脚本把 `NOT_AVAILABLE` 当作“相同”，也不能补造旧 Checkpoint。

## Provider Usage 与私有运行日志

SQLite 与 failure summary 的已持久化计数一致：

| Provider | Stage | 已持久化 calls | retries | error |
|---|---|---:|---:|---|
| Bocha | SEARCHING | 9 | 0 | 无 |
| Crawler | CRAWLING | 7 | 0 | 无 |
| Crawler | CRAWLING | 2 | 0 | `HTTP_ERROR` |
| DeepSeek | ANALYZING | 0 | 0 | 无持久化 Usage 行 |

`DeepSeek=0` 只代表失败路径没有把 Producer Usage 写入数据库，不代表未调用。私有 artifact 只保留
Claims 阶段 Schema 失败结果，没有逐调用遥测、Token、Latency 或原始响应；不得由 Usage 记录
重建前三阶段输出。

failure summary 记录的时间线为 `SEARCHING 01:27:37.009Z → CRAWLING 01:27:39.025Z →
ANALYZING 01:27:41.038Z`，最终为 `FAILED / ANALYZING / REPORT_CLAIMS_FAILED`。3 条私有
server run-log 仅按长度和 SHA-256 审计，未复制进 Git；其中没有可导入的阶段 Payload。

## 物理文件 Hash

### V2

| 文件 | bytes | SHA-256 |
|---|---:|---|
| `failure-summary.json` | 1,439 | `db98f4cb498f9a7c2cec7057294827f5a6c61a24a78639e01e6d9773079f4ee0` |
| `run-lock.json` | 137 | `b86df78852ed7ac06d93ae43c4b5e4b9ee34c43221b74a35ddb6eb224aef48f8` |
| `technical-canary-zh-v2.sqlite` | 4,096 | `41b81c502c6354f4b38ce0a65dd19c933017a73b7f04b7e3a4e2eece86f2f3ce` |
| `technical-canary-zh-v2.sqlite-shm` | 32,768 | `df7783567ef1d48f3360b9d99698ea519ce06107eca5ea61d3e8d03012c9f390` |
| `technical-canary-zh-v2.sqlite-wal` | 350,232 | `9dfcc3d3500c8915e469d6afc3e0fd1b9a761cdf2f9fa09fc3e521abd3ba74ba` |

### V1

| 文件 | bytes | SHA-256 |
|---|---:|---|
| `deep-desktop.png` | 200,271 | `91afe81fa43fc1ffe69411c891e6a69277156ddf6dc3920aed7e7eefe9e9ad59` |
| `evidence-drawer.png` | 236,037 | `79267929cbd314a2d2bfb9b89529f6f88168e35b3e388ef423ce8f19bde5ee24` |
| `input-snapshot.json` | 583 | `bf0bfcaa1151445530050a23cff0bd5e62e69abd07a7d495f6293685b0e99ed4` |
| `print-preview.png` | 233,478 | `e85140ad2f97b4aa11c2d78cab2dd64a9fd6277421fc32af223796f60c6c959a` |
| `quick-desktop.png` | 165,385 | `538905dfc2c7eece733ef854eae8b65001297747388fb3a4dd0ff1c25f078dcd` |
| `quick-mobile.png` | 148,724 | `51f526fe035fb402b55a837e7c79cf8055514cdcc10ae5698f4c1744224fbf6f` |
| `report-canonical.json` | 58,938 | `8413c2b8df28eb8af100505228ad83fb02d4fe60d5903043747b264d6f57d5de` |
| `run-lock.json` | 217 | `d6034546c8978b529e3c21833b3fccb45dcc7e9cfc6d3ca1ba5d2aa3e481e570` |
| `summary.json` | 4,875 | `93cbd07eb33f6f0fcbd52da6242f3145a8ed3a5a4f6433a177a415372893907b` |
| `technical-canary.sqlite` | 4,096 | `41b81c502c6354f4b38ce0a65dd19c933017a73b7f04b7e3a4e2eece86f2f3ce` |
| `technical-canary.sqlite-shm` | 32,768 | `82b431de4caa15dddf4346d075f28af876459f2d6bd49cd3e82e219e89bd2543` |
| `technical-canary.sqlite-wal` | 642,752 | `63de2bde8c90dd1f8d567a4f792b47c0e795c403cbe75d482c4fcafbe12b01b0` |
| `verify-run-log.txt` | 390 | `9e2e57307c8f6e75a7df9f810a8617f4c4c450d1fdc4b89b1104effcbd1c816c` |

## 恢复决策输入

- 可复用分析阶段：无。
- 必须重跑分析阶段（若恢复前置条件另行解决）：Profile、Scoring、AI Visibility、Claims。
- Claims 必须使用修复后的新内部 Candidate Schema；本审计不修改 Schema。
- 当前 Evidence Registry 与 Normalizing Evidence 输出都可作为冻结锚点，但二者 Hash 语义不同，
  Runner 应分别按契约使用，不能任选一个替代另一个。
- 当前原始失败、数据库、run-lock、V1 目录均保持不变。
- 当前严格结论：`BLOCKED_UNVERIFIABLE_COMPETITOR_RESOLUTION_AND_QUERY_PLAN_HASHES`。

`READY_FOR_RECOVERY_DECISION`
