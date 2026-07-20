# Round-6B Product Yield Root-Cause Lab V1

状态：`COMPLETED_INTERNAL_LAB`

## 最终决策

- `PRIMARY_PRODUCT_YIELD_ROOT_CAUSE=MULTI_FACTOR`
- `MODEL_DECISION=INSUFFICIENT_EVIDENCE_TO_SWITCH`
- `PRODUCT_FLOW_DECISION=ADOPT_TWO_STAGE_PUBLIC_PLUS_ENRICHMENT`
- `PILOT_DECISION=READY_FOR_INTERNAL_DEMO_ONLY`

两阶段机制当前仅为 `DESIGN_REVIEW`，不代表已验证客户效果。未自动执行 Evidence Closure、
客户试用或生产部署。

## 聚合语义修正

真实 Gate 1–10 经离线复算后，Gate 9
`OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY` 从错误的 FAIL 修正为 PASS。Gate 6 独占
“至少 2/3 有可信 Opportunity”的产出阈值，Gate 9 只确认没有 3/3 强制要求。Gate 5 在
0 Published Opportunity 时按空集有效；Gate 8 仍审计被剪枝的 5 个 Opportunity Candidate；
空分母 `opportunityYieldRate=null`。最终仅 Gate 6、Gate 7 失败，分类为 `DATA_SPARSE`。

## 每家公司根因

| 企业 | Primary Cause | Secondary Cause | 持久化事实 |
| --- | --- | --- | --- |
| 洽洽 | `GUARD_CORRECTLY_REJECTED` | `INDEPENDENT_SUPPORT_TOO_THIN`、`EVIDENCE_TIERING_MISCLASSIFIED` | 8 Candidate，仅 1 Strength 发布；2 Opportunity 均无独立支持 |
| 科大讯飞 | `GUARD_CORRECTLY_REJECTED` | `MODEL_GENERATED_UNSUPPORTED_CLAIM`、`EVIDENCE_TIERING_MISCLASSIFIED`、`CANDIDATE_SOURCE_OR_AUDIT_BUG` | 9 Candidate，仅 2 Strength 发布；`geo_2/geo_3` 历史 relation 错位 |
| 安徽合力 | `MODEL_RETURNED_ZERO_CANDIDATES` | `MODEL_FAILED_TO_USE_AVAILABLE_EVIDENCE` | Claims stage 成功且原始五类 Candidate 均空；Evidence 35、first-party 19 |

跨样本原因不是单一模型能力或单一发现问题：两家由 Truth Guard 正确拒绝缺乏 Coverage、
DIRECT/独立支持与 lineage 的候选；一家公司由模型在可用 Evidence 上返回空候选；另有 Tier
字段使用错误和历史 relation 对齐异常。Query Plan、原始 Search/Crawl 和 beforeDedup 未
持久化，因此不对其补写推断值。

## Shadow A/B 结论

Flash 与 Pro 均 3/3 Schema 通过，均生成 6 Strength、9 Issue、9 Opportunity；Flash 另有
2 个 Demo，Pro 为 0。两者无效 Evidence/sourceIssue ID 与通用模板均为 0，但各有 2 个竞品
断言违规。由于所有新 Candidate 均缺少新 verifier relation，同一 Truth Policy 下可发布的
Issue + Opportunity + Demo 均为 0。Pro 未满足硬违规为 0和可发布增量至少 +2，故不切换。

## Evidence Closure 与客户补证

Planner 只生成计划，不执行搜索、抓取、Support 升级或发布：

| 企业 | 被剪枝 Candidate | 预算内选择 | Slots | 客户请求 |
| --- | ---: | ---: | ---: | ---: |
| 洽洽 | 7 | 3 | 6 | 4 |
| 科大讯飞 | 7 | 3 | 5 | 3 |
| 安徽合力 | 0 | 0 | 0 | 0 |

Slot 分布：`CURRENT_COMPANY_DIRECT_FACT` 5、`INDEPENDENT_THIRD_PARTY_SUPPORT` 4、
`CURRENT_COMPANY_COVERAGE` 1、`CUSTOMER_DOCUMENT_REQUIRED` 1。下一步动作分布：
`TARGETED_OFFICIAL_CRAWL` 5、`TARGETED_WEB_SEARCH` 4、`REQUEST_CUSTOMER_DOCUMENT` 1、
`KEEP_AS_NEEDS_CONFIRMATION` 1。所有动作 `executesAutomatically=false`、
`mayPublishClaim=false`、`mayUpgradeSupport=false`。

未来预算保持：每企业最多 3 个 Candidate、每 Candidate 最多 2 Slot、最多 4 Query、4 页
Crawl、1 轮 Closure、retries=0；本轮实际执行量为 0。

客户资料请求包：洽洽 4 项、科大讯飞 3 项、安徽合力 0 项；均要求发布前再次审批，禁止
API Key、密码、客户个人数据、未脱敏合同、财务机密和无关内部文件。客户确认不会自动成为
DIRECT Evidence。

## 产品与 Pilot 判断

单阶段公开网络诊断能够稳定守住 Truth，但本样本未证明能稳定形成正式 Opportunity。
建议采用“公共诊断 → Evidence Gap → 客户补充/确认 → 重新验证 → 正式 GEO 机会方案”的
append-only 两阶段产品方向；阶段 2 不覆盖阶段 1 Canonical。

Trust 平均 `57.0/60`，Sales 平均 `25.5/40`，三家 Truth 硬违规均为 0；但 Gate 6/7 仍
失败，Closure/Enrichment 仍默认关闭并仅完成 Contract/Planner/Mock/QA。因此当前仅可内部
演示，不进入受控客户试用。

## 已知阻断与分类

- 科大讯飞历史 Candidate–relation 对齐异常：`IMPLEMENTATION_BUG`；本轮禁止修改历史 relation。
- Evidence Tier 使用展示型 `sourceDomain` 而非 URL hostname：`IMPLEMENTATION_BUG`；本轮禁止修改历史 Evidence。
- 产出稀疏本身：`DATA_SPARSE`；不触发 Guard、阈值、fallback 或 Provider 代码修改。

上述 Implementation Bug 必须在未来明确授权的修复轮处理并回归验证；它们不授权本轮扩大
范围，也不改变“不得用位置 ID 复用 relation”的 Shadow default-deny 结论。
