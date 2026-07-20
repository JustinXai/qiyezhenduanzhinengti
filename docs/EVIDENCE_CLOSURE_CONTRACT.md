# Evidence Closure Contract V1

## 1. 目的与状态

`EvidenceClosurePlannerV1` 是 Round-6B 的离线补证计划器。它解释高价值 Candidate 距离既有
Publication Policy 还缺什么，并给出下一步动作；它不执行搜索、抓取、Provider 调用或发布。

本轮冻结状态：

- `EVIDENCE_CLOSURE_ENABLED=false`；
- 只生成 `PLANNED_NOT_EXECUTED` 计划；
- 不接 URL、表单、API 或前端开关；
- 不修改 Canonical、Evidence、ClaimEvidenceRelation、评分或报告视图；
- 不允许计划本身升级 Support、附加 Evidence 或发布 Claim。

## 2. 输入

输入只接受最终 Decision Ledger 中状态为 `PRUNED` 或 `DEEP_NEEDS_CONFIRMATION` 的候选摘要：

- `candidateRef`、`claimKind`；
- 最终 `reasonCode`；
- 当前 Evidence ID；
- DIRECT / PARTIAL / CONTEXT / 独立来源计数；
- 可选的客户问题、潜在 GEO 机会与商业价值。

`SYSTEM_FAILURE_NOT_BUSINESS_ISSUE` 必须排除，系统失败不得被包装成企业补证任务。

## 3. 输出

每个入选 Candidate 最多生成 2 个 `EvidenceRequirementSlot`：

- `CURRENT_COMPANY_DIRECT_FACT`
- `CURRENT_COMPANY_COVERAGE`
- `INDEPENDENT_THIRD_PARTY_SUPPORT`
- `COMPETITOR_OFFICIAL_FACT`
- `COMPARABLE_DIMENSION_EVIDENCE`
- `CUSTOMER_INTERNAL_CONFIRMATION`
- `CUSTOMER_DOCUMENT_REQUIRED`

每个 Slot 必须记录 Candidate/Claim 关联、缺失条件、已有 Evidence ID、所需来源类型、所需独立
来源数、定向检索意图、官方页面类型、客户问题、完成条件与不可闭合原因。

`NextBestEvidenceAction` 只能是：

- `TARGETED_WEB_SEARCH`
- `TARGETED_OFFICIAL_CRAWL`
- `REQUEST_CUSTOMER_CONFIRMATION`
- `REQUEST_CUSTOMER_DOCUMENT`
- `KEEP_AS_NEEDS_CONFIRMATION`
- `PRUNE_PERMANENTLY`

每个动作固定 `executesAutomatically=false`、`mayPublishClaim=false`、
`mayUpgradeSupport=false`。

## 4. 规则映射

主要映射如下：

| 最终原因 | 首选 Slot | 边界 |
|---|---|---|
| `INSUFFICIENT_DIRECT_SUPPORT` | 当前企业直接事实、客户材料 | 材料仍须重新验证 |
| `INSUFFICIENT_INDEPENDENT_SUPPORT` | 独立第三方支持、当前企业直接事实 | 不得用首方来源冒充独立来源 |
| 竞品官方关系缺失 | 竞品官方事实、同维度证据 | 继续使用统一竞品 Publication Policy |
| Coverage 缺失 | 当前企业 Coverage | 补证不能代替 Coverage 限定 |
| 无效 Evidence 引用 | 当前企业直接事实、独立支持 | 不回填第一条 Evidence |
| 无效 `sourceIssueId` | 客户内部确认 Slot + 永久剪枝 | 客户确认不能修复断裂 lineage |
| 禁用/承诺文案 | 客户内部确认 Slot + 永久剪枝 | 客户确认不能解除文案 Guard |

未知原因保守进入客户确认/Needs Confirmation 路径，不自动检索或发布。

## 5. 冻结预算

未来一次 Closure 的预算固定为：

- 每家公司最多 3 个 Candidate；
- 每个 Candidate 最多 2 个 Slot；
- 最多 4 个定向 Query；
- 最多 4 页定向 Crawl；
- 最多 1 轮；
- retries = 0。

预算是上限，不是完成目标。Closure 后仍不足时只能剪枝或保持 Needs Confirmation。不得重新执行
完整 Query Plan，也不得为通过产品 Gate 扩大预算。

## 6. Round-6B 离线结果

私有最终产物位于：

`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\evidence-closure-agent-ah-final`

| 企业 | 被剪枝候选 | 入选 | Slot | 动作摘要 |
|---|---:|---:|---:|---|
| 洽洽 | 7 | 3 | 6 | Web Search 2、Official Crawl 3、客户材料 1 |
| 科大讯飞 | 7 | 3 | 5 | Web Search 2、Official Crawl 2、Needs Confirmation 1 |
| 安徽合力 | 0 | 0 | 0 | `NO_PRUNED_CANDIDATES` |

安徽合力不能生成 Closure 计划，因为最终 Candidate Ledger 为 0；这不是补证计划器可以修复的缺口，
也不得伪造 Candidate。

## 7. 明确不做

本契约不包含自动多轮搜索 Agent、完整 Query Plan 重跑、新 Provider、上传、对象存储、审批后台、
报告覆盖写、Opportunity fallback 或门槛放宽。
