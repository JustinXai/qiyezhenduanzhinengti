# Round-6B Agent AF — Candidate → Evidence → Decision 离线取证

状态：`YIELD_ROOT_CAUSE_CONFIRMED`

## 1. 边界与方法

本次只读检查三家冻结 SQLite 的 Evidence、`analysis_checkpoints`、
`analysis_stage_runs`、Claim–Evidence relations、Publication Decisions、Prune Decisions
与 latest Canonical。未创建 Diagnosis，未调用 Bocha、Crawler 或 DeepSeek，未修改任何
Canonical、Evidence 或 relation。

Candidate Source 使用与 Round-6A 一致的顺序：优先读取成功的 `REPORT_CLAIMS`
stage run；若历史样本没有该 stage run，则读取最新 `ANALYZING` checkpoint 中的 report。
Candidate 编号按冻结 Builder 顺序还原为 `str_n`、`iss_n`、`geo_n`、`gap_n`、`demo_1`，
再与最终 Decision Ledger 和 relation 表逐项连接。

Evidence 利用率有两个口径：

- Candidate 利用率：被任何 Candidate 引用的去重 Evidence / afterDedup；
- Published 利用率：被最终 Published Candidate 引用的去重 Evidence / afterDedup。

独立来源总量是按实际 URL host 复算的结构性来源数，用于描述输入多样性；单个 Claim
能否满足独立支持阈值，仍以 Decision Ledger 中的 resolver 结果为准，二者不可互换。

## 2. 数据完整性与限制

| 企业 | SQLite SHA-256 | Candidate Source | Decision 完整性 |
|---|---|---|---:|
| 洽洽 | `7bb678fd6ff11afee254536361016a13f79f371e079d358d0aded716d0e24581` | `LEGACY_ANALYSIS_CHECKPOINT` | 8/8 |
| 科大讯飞 | `70a2920f932b2b516cb52ac7268991e81a0df96d8bee18d8186b7dcc14f45d30` | `ANALYSIS_STAGE_RUN` | 9/9 |
| 安徽合力 | `f172d5e9733eb31befa857f941cc94ee6123d22d89820464b70de673d2a5d5d2` | `ANALYSIS_STAGE_RUN` | 0/0 |

三家 SQLite 均未持久化 Query Plan 文本、原始搜索结果、原始 Crawl body 或 curate 前的
Evidence 数组。因此：

- 可确认每家 9 次 Search，Crawler 次数分别为洽洽 2、科大讯飞 1、安徽合力 6；
- `beforeDedup` 必须标记 `NOT_PERSISTED`，不能用 afterDedup 或 Provider 次数猜测；
- 无法从持久化数据逐 query 判断 `QUERY_PLAN_MISALIGNED`；
- 可审计的 Crawl 结果仅限最终 normalized Evidence，不能重建原始响应。

## 3. Evidence 指标

| 企业 | beforeDedup | afterDedup | A/B/C/D/E | 中文比例 | First-party | Competitor | 结构性独立来源 | Candidate 利用率 | Published 利用率 | 只被未发布 Candidate 引用 | 从未被 Candidate 引用 |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 洽洽 | N/P | 36 | 1/1/34/0/0 | 100% | 1 | 1 | 31 | 25.00% | 11.11% | 5 | 27 |
| 科大讯飞 | N/P | 39 | 1/0/37/0/1 | 97.44% | 1 | 0 | 33 | 28.21% | 15.38% | 5 | 28 |
| 安徽合力 | N/P | 35 | 19/1/15/0/0 | 100% | 19 | 1 | 16 | 0% | 0% | 0 | 35 |

`N/P` 表示没有持久化，不是零。

### Tier 实际 URL 复核

Tier 分类器的已知电商/社区规则接收 `sourceDomain`，但冻结 Evidence 的该字段包含“京东”、
“知乎”、“网站排行榜”等展示名称，而不是实际 URL hostname。逐条解析真实 URL 后发现：

- 洽洽有 7 条已知规则错分为 Tier C：3 条 `zhihu.com` 应为 E，3 条 `jd.com`
  应为 D，1 条 `chinaz.com` 应为 E；
- 科大讯飞有 3 条已知规则错分为 Tier C：1 条 `zhihu.com` 应为 E，2 条
  `jd.com` 应为 D；
- 安徽合力未发现命中当前已知域名规则的错分。

这不是依据来源名称猜测，而是 Evidence ID、完整 URL 与冻结分类结果的逐项比较。
结论为 `EVIDENCE_TIERING_MISCLASSIFIED`。本 Agent 只取证，不修改分类器或历史 Evidence。

## 4. Candidate 与最终决策

| 企业 | Strength | Issue | Opportunity | Gap | Demo | Published | Deep Needs Confirmation |
|---|---:|---:|---:|---:|---:|---:|---:|
| 洽洽 | 2 | 2 | 2 | 1 | 1 | 1（Strength） | 0 |
| 科大讯飞 | 2 | 3 | 3 | 0 | 1 | 2（Strength） | 0 |
| 安徽合力 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

洽洽的 prune reasons：

- `INVALID_SOURCE_ISSUE_REFERENCE` × 1；
- `MISSING_COMPETITOR_OFFICIAL_RELATION` × 1；
- `INSUFFICIENT_INDEPENDENT_SUPPORT` × 2；
- `INSUFFICIENT_DIRECT_SUPPORT` × 1；
- `MISSING_COVERAGE_PREFIX` × 2。

科大讯飞的 prune reasons：

- `INVALID_SOURCE_ISSUE_REFERENCE` × 1；
- `INSUFFICIENT_INDEPENDENT_SUPPORT` × 2；
- `SYSTEM_FAILURE_NOT_BUSINESS_ISSUE` × 1；
- `MISSING_COVERAGE_PREFIX` × 3。

安徽合力没有 Candidate，因此没有虚构 prune reason；0/0 Decision Ledger 是完整的空账本。

## 5. Opportunity Candidate 逐项结论

| 企业 / Candidate | sourceIssue | Issue 已发布 | DIRECT / PARTIAL / CONTEXT | 独立支持 | Coverage | Decision |
|---|---|---|---|---:|---|---|
| 洽洽 `geo_1` | `iss_1` | 否 | 0 / 0 / 2 | 0 | `ESTABLISHED_AND_BOUNDED` | `INSUFFICIENT_INDEPENDENT_SUPPORT` |
| 洽洽 `geo_2` | `iss_2` | 否 | 0 / 0 / 3 | 0 | `ESTABLISHED_AND_BOUNDED` | `INSUFFICIENT_INDEPENDENT_SUPPORT` |
| 科大讯飞 `geo_1` | `iss_1` | 否 | 0 / 0 / 2 | 0 | `ESTABLISHED_AND_BOUNDED` | `INSUFFICIENT_INDEPENDENT_SUPPORT` |
| 科大讯飞 `geo_2` | `iss_2` | 否 | 0 / 0 / 3 | 0 | `ESTABLISHED_AND_BOUNDED` | `INSUFFICIENT_INDEPENDENT_SUPPORT` |
| 科大讯飞 `geo_3` | `iss_3` | 否 | 0 / 0 / 0 | 0 | `NOT_REQUIRED` | `SYSTEM_FAILURE_NOT_BUSINESS_ISSUE` |

完整私有明细还记录每个 Candidate 的 Evidence IDs、relation Evidence IDs、customerQuestion、
recommendedAction、priorityReason、Coverage 与最终 Decision。所有 5 个 Opportunity 的
source Issue 均未通过发布阈值，因此即使只看 lineage，也不存在可发布 Opportunity。

### 科大讯飞 relation 对齐异常

`geo_2` 的 Candidate Evidence 是 2 个 ID，但 `geo_2` relation 挂载了另外 3 个 ID；这 3 个
ID 实际与 `geo_3` Candidate 完全一致，而 `geo_3` 自身没有 relation。该事实由冻结
Candidate Source 与 relation 表直接对比得出，分类为 `CANDIDATE_SOURCE_OR_AUDIT_BUG`。

该错位不改变本次“无可发布 Opportunity”的结果：三个 source Issue 均已因 Coverage
缺失被剪枝，且前两个 Opportunity 的支持仅为 `CONTEXT_ONLY`。但该 relation 不能被当作
可信的 Candidate 级审计明细，Supervisor 应将其作为独立 Implementation Bug 处理。

## 6. 安徽合力 candidateCount=0 的持久化证明

安徽合力 `REPORT_CLAIMS` stage run：

- 状态：`SUCCEEDED`；
- prompt：`REPORT_CLAIMS_ZH_PROMPT_V2_2`；
- output hash：`992971b2275a86fb7c4b1e11c8d1447c36dff1a1a1c8c434b67d2d9b55a4e4b4`；
- payload：Strength、Issue、Opportunity、Competitor Gap 均为空数组，Demo 为 null；
- 后续 `ANALYZING` checkpoint 同样为五类空结果；
- relation=0、publication decision=0、prune decision=0、latest Canonical 五类 Claim 也为空；
- 同时 normalized Evidence=35，其中 first-party=19、competitor=1、observed=15。

所以可排除：Candidate Source 读取失败、Claims Schema 解析失败、Builder 吞掉 Candidate、
Publication Guard 把 Candidate 剪到零。持久化证据支持的结论只能是：模型在成功的 Claims
响应中返回零 Candidate。工业 B2B Prompt 不匹配仍是待 Shadow A/B 验证的假设，不能由
现有数据直接证明；“Evidence 缺乏可用内容”也与 19 条 first-party Evidence 不相容。

## 7. 每家公司根因分类

| 企业 | Primary Cause | Secondary Cause |
|---|---|---|
| 洽洽 | `GUARD_CORRECTLY_REJECTED` | `INDEPENDENT_SUPPORT_TOO_THIN`；`EVIDENCE_TIERING_MISCLASSIFIED` |
| 科大讯飞 | `GUARD_CORRECTLY_REJECTED` | `MODEL_GENERATED_UNSUPPORTED_CLAIM`；`EVIDENCE_TIERING_MISCLASSIFIED`；`CANDIDATE_SOURCE_OR_AUDIT_BUG` |
| 安徽合力 | `MODEL_RETURNED_ZERO_CANDIDATES` | `MODEL_FAILED_TO_USE_AVAILABLE_EVIDENCE` |

跨三家公司不是单一“DATA_SPARSE”，而是多因素组合：两家公司有 Candidate，但 Guard
正确拒绝了 Coverage、DIRECT、独立支持或 lineage 不足的 Claim；一家公司在 Evidence
充足且 Claims stage 成功的前提下由模型返回零 Candidate；同时存在 Tier 输入字段错误和
科大讯飞 Candidate–relation 对齐错误。该结论支持后续严格受控的模型 Shadow 与 Evidence
Closure 设计，但不支持降低 Guard 或强制生成 Opportunity。

## 8. 私有产物

所有包含完整 URL、Candidate 文案和 Canonical 的原始明细只保存在仓库外：

- `E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\agent-af-three-company-yield-forensics-v1.json`
  — SHA-256 `08779fc17d6036800ed6de4ce0be96dfd8662a6a55cc2ac5f90375bd27b75341`；
- `E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\agent-af-yield-root-cause-summary-v1.md`
  — SHA-256 `269f9aec3234f08392bdcecaf7683f1af23c29c24a44bbafb1baa71103b117bc`；
- `E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\agent-af-hash-manifest-v1.json`；
- 同目录 `agent-af-yield-forensics.py` 为离线只读重现工具，不提交 Git。
