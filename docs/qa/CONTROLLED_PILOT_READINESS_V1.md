# Round-6B Controlled Pilot Readiness V1

## 决策

`PILOT_DECISION=READY_FOR_INTERNAL_DEMO_ONLY`

当前不进入受控客户试用。三企业真实样本证明了 Truth Guard 和克制发布，但没有证明稳定的
产品产出；提议的两阶段机制仍处于 `DESIGN_REVIEW`，不能冒充已验证客户效果。

## 当前单阶段：实际状态

| 放行面 | 状态 | 证据 |
| --- | --- | --- |
| Truth Guard | PASS | 3/3 Truth Guard 通过 |
| Unsupported Claim | PASS | 3/3 为 0 |
| Quick 长度 | PASS | 3/3 ≤ 1800 |
| 三视图切换 Provider 增量 | PASS | 3/3 为 0 |
| Opportunity lineage | PASS | 0 条已发布 Opportunity，default-deny 正确 |
| 允许单家稀疏 | PASS | Gate 9 修正后为 PASS |
| 至少 2/3 有可信 Opportunity | **FAIL** | 0/3 |
| 至少 1/3 有可信 Demonstration Fix | **FAIL** | 0/3 |
| Trust 60 平均 | 57.0 / 60 | 真实报告只读评审 |
| Sales 40 平均 | 25.5 / 40 | 真实报告只读评审 |

Gate 6、Gate 7 是当前冻结的产品产出门槛。它们的失败分类为 `DATA_SPARSE`，不授权放宽
Guard、增加 fallback 或重跑企业；但在“达到门槛才进入受控客户试用”的既定规则下，仍然
意味着本批次不可放行。

## 为什么只适合内部 Demo

内部 Demo 可以如实展示：

- Canonical → Quick / Deep / Evidence 同源；
- 评分权重、覆盖率、测量构成和限制透明；
- 竞品与负面结论证据不足时退出；
- 稀疏报告不是系统失败；
- Quick / Deep / Evidence 切换零 Provider 调用。

不适合在客户试用中承诺或暗示：

- 当前能稳定给出可信 GEO 机会；
- 当前能稳定给出示范修复；
- 分数代表多平台 AI 市场份额；
- 公开网络一次诊断足以形成正式优化方案；
- 两阶段机制已经提高转化或客户满意度。

## 两阶段机制：DESIGN_REVIEW

推荐产品方向为 `ADOPT_TWO_STAGE_PUBLIC_PLUS_ENRICHMENT`，但 Pilot 准备度仍是设计态。

进入任何受控客户试用前，至少需要可验证地满足：

1. 阶段 2 为 append-only，原 Canonical、Evidence、评分不被覆盖；
2. 客户确认和客户文件有来源、状态、敏感性、审批与撤回记录；
3. 客户确认不会自动成为 DIRECT Evidence，新 Claim 仍走统一 Publication Policy；
4. Evidence Closure 和 Customer Enrichment 默认关闭，不能由 URL 或前端绕过；
5. Mock 证明 Evidence Slot → 客户请求 → 再验证 → Decision Ledger 全链可审计；
6. 至少一轮不接触真实客户的内部演练证明：无自动发布、无敏感资料过度索取、无历史
   Canonical 改写；
7. 未来合资格样本重新达到冻结产品 Gate；不得用降低阈值或补造 Opportunity 达成。

这些条件是 Pilot 候选清单，不是本轮完成声明。

## Pilot 风险与控制

| 风险 | 当前控制 | Pilot 前仍需证明 |
| --- | --- | --- |
| Sales 压力覆盖 Truth | Truth 硬违规独立计数 | 任何硬违规直接拒绝发布 |
| 稀疏报告令客户误解为系统失败 | 明确 `SPARSE_BUT_TRUTHFUL` | Quick 给出企业特定且不恐吓的补证下一步 |
| 客户确认被当成事实 | 设计要求不可自动 DIRECT | Enrichment 状态和审批测试 |
| 索取敏感资料 | 请求类型冻结、禁止密钥/密码/个人数据等 | 最小化请求与敏感性 QA |
| 二阶段覆盖阶段一 | append-only 方向已冻结 | 存储与 API 接缝测试 |
| 通用模板路线图冒充方案 | 当前报告只作为路线图 | Evidence Slot 驱动的企业特定请求 |

## 最终判定

- 当前单阶段：`READY_FOR_INTERNAL_DEMO_ONLY`
- 提议两阶段：`DESIGN_REVIEW`
- 受控客户 Pilot：`NO`
- 自动 Evidence Closure：`NO`
- 自动客户试用：`NO`
- 生产部署：`NO`
- 合入 main：`NO`

下一次 Pilot 判定必须依据实现后的 Mock / QA 和新的合资格样本，不得依据本设计评审推断客户
效果。
