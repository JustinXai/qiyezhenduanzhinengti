# Round-5.3 三企业样本聚合契约

状态：`THREE_COMPANY_SAMPLE_HARNESS_READY`

本契约只定义下一阶段的 Mock fixture、公司级统计和三企业聚合判定。Round-5.3 未启动第二家或第三家真实企业，未创建真实 Diagnosis，未访问网络，也未调用 Bocha、Crawler 或 DeepSeek。

## 1. 边界

- 输入必须恰好是 3 个不同 `companyId` 的样本记录。
- 统计器是纯函数；不读写诊断数据库，不调用 Provider，不修改 Canonical Report。
- fixture 位于 `tests/fixtures/`，不得改写 `src/fixtures/` 唯一权威报告样例。
- 所有比率从样本明细派生，不接受手填聚合结果。
- 稀疏结果允许存在；不补 Issue、Opportunity 或 Demonstration Fix。

实现：`scripts/round53-three-company-sample.ts`  
Mock fixture：`tests/fixtures/round53-three-company-sample.ts`  
回归测试：`tests/qa/round53-three-company-sample.test.ts`

## 2. 每家公司输入与派生指标

每家公司记录原始 Evidence、Claim 候选、Opportunity 候选、Demonstration Fix、Quick 可见字符数、耗时、Provider 调用、`scoreCoverage` 和 `measurementComposition`。统计器派生：

| 指标 | 计算规则 |
| --- | --- |
| Evidence 数量 | Evidence 明细数量 |
| 中文 Evidence 比例 | `language` 以 `zh` 开头的 Evidence / 全部 Evidence |
| Tier 分布 | A/B/C 各自数量，合计必须等于 Evidence 数量 |
| Issue 候选/发布 | `kind=ISSUE` 的候选数 / `publicationStatus=PUBLISHED` 数；Deep 待确认观察另计 |
| Opportunity 候选/发布 | Opportunity 明细数 / `publicationStatus=PUBLISHED` 数 |
| Demonstration Fix | 分别记录候选、发布以及血统可信状态 |
| prune reasons | 汇总所有被剪枝 Claim、Opportunity 和 Fix 的 `reasonCode`；被剪枝项不得缺失原因 |
| Evidence utilization | 被已公开 Claim、已发布 Opportunity 或已发布 Fix 引用的唯一有效 Evidence / 全部 Evidence |
| claim publication rate | 已发布 Strength + Issue + Opportunity / 对应全部候选；Deep 待确认观察不计作确定性发布 Claim |
| opportunity yield rate | 已发布 Opportunity / Opportunity 候选；候选为 0 时返回 `null`，不伪装成 0% |
| Quick 字符 | Quick 中文可见字符数，硬上限 1800 |
| 总耗时 | 单家公司端到端毫秒数 |
| Provider 调用 | 分别记录 Bocha、Crawler、DeepSeek；页面切换新增调用独立记录 |
| scoreCoverage | 0–1；必须等于 `measuredWeight + estimatedWeight` |
| measurementComposition | 实测、公开网页估算、证据不足、Provider 失败四类冻结权重份额，合计必须为 1 |

所有数量、耗时和调用次数必须是非负整数。空分母的 `claim publication rate` 或 `opportunity yield rate` 为 `null`，不得制造虚假精度。

## 3. 公司级真实性判定

统计器不放宽冻结 Claim–Evidence 阈值：

- Quick/确定性发布 Issue 至少有 1 条 `DIRECT_SUPPORT`。
- 发布 Strength 和 Opportunity 至少有 1 条 `DIRECT_SUPPORT`，或来自 2 个不同 `normalizedDomain` 的 `PARTIAL_SUPPORT`。
- `CONTEXT_ONLY` 不能单独支持公开结论；`UNSUPPORTED` Verdict 不得公开。
- 负面或缺失型 Claim 必须带 Coverage 限定。
- Deep 的 `DEEP_NEEDS_CONFIRMATION` 观察只允许 Issue 使用：无 Direct、至少 1 条 Partial，并同时明确“待进一步确认”“本次保存证据范围”“不作为确定性结论”。它不计为 Quick Issue 或确定性发布 Claim。
- 已发布 Opportunity 必须关联已发布 Issue、存在的 Evidence、客户问题、具体动作和优先理由；其 pairwise support 也必须引用同一 Evidence 集合。
- 已发布 Demonstration Fix 必须关联已发布 Issue 和存在的 Evidence。
- 重复 Evidence ID、失效引用、空血统字段或通用模板都会使血统无效，不会被补齐或升级。

## 4. 三企业十项聚合门槛

聚合器按固定顺序返回以下 10 个 Gate：

1. `ALL_TRUTH_GUARDS_PASS`：3/3 公司真实性 Guard 通过。
2. `NO_UNSUPPORTED_PUBLISHED_CLAIMS`：3/3 公司没有 `UNSUPPORTED` 公开 Claim。
3. `ALL_QUICK_WITHIN_1800`：3/3 Quick 不超过 1800 个中文可见字符。
4. `ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS`：3/3 页面切换新增 Provider 调用为 0。
5. `ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID`：所有已发布 Opportunity 血统 100% 有效；没有发布 Opportunity 时不伪造失败。
6. `AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY`：至少 2/3 公司各有至少 1 个可信 Opportunity。
7. `AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX`：至少 1/3 公司有可信 Demonstration Fix。
8. `NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES`：三个样本中通用模板 Opportunity 候选总数为 0；被剪枝的通用建议仍计入本项，便于同时约束生成质量。
9. `OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY`：只执行“至少 2/3”聚合阈值，不要求 3/3。
10. `SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE`：公司真实性通过时，单家公司可信 Opportunity 为 0 被标记为 `sparseButTruthful`，不会单独导致系统失败。

只有 10 项全部通过，聚合结果 `ready=true`。其中第 6、7 项是产品阶段样本门槛；第 9、10 项防止把单家公司稀疏结果错误耦合为技术失败。

## 5. Mock 验证范围

基准 fixture 故意设置：Alpha 和 Beta 各有 1 个可信 Opportunity，Alpha 有 1 个可信 Demonstration Fix，Gamma 的 Opportunity 候选和发布数均为 0。预期三企业聚合仍通过，Gamma 的 `opportunityYieldRate=null` 且 `sparseButTruthful=true`。

反例覆盖：Partial-only Quick Issue、`UNSUPPORTED` 公开 Claim、Quick 1801 字、页面切换新增调用、无效 Opportunity 血统、通用模板 Opportunity、仅 1/3 公司有 Opportunity、0/3 Demonstration Fix、样本数量错误和测量构成不一致。

该 Mock 结果只证明统计和判定框架可用，不代表真实 Opportunity 整体产出率。不得把 V1 53.85 与 V2 59.95 描述为优化前后效果；两者证据集合和分析版本不同，只分别描述各自诊断结果。
