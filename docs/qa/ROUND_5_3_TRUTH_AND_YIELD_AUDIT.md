# Round-5.3 Truth Gate Audit & Product Yield Classification

## 最终判定

- Diagnosis：`diag_d9d81ba3428f4696b088870ca7416e49`，状态仍为 `READY`。
- 修复前 Truth Gate：`FAIL / TRUTH_AUDIT_POLICY_VIOLATION`。
- 追加式 revision 后 Truth Gate：`PASS`。
- `TechnicalCanaryStatus=PASS`。
- `ProductYieldStatus=SPARSE_BUT_TRUTHFUL`。
- Opportunity 归零根因：`D. INSUFFICIENT_SUPPORT`；不是模型返回 0，也不是有效候选被实现
  Bug 误剪。没有补造 Opportunity。
- 本轮真实 Provider 调用 0，新 Diagnosis 0，Recovery 重跑 0。

## Agent 结果

| Agent | 状态 | 结论 |
|---|---|---|
| T Published Claim Truth Audit | `TRUTH_AUDIT_POLICY_VIOLATION` | 原 Quick 三条 Issue 均无 DIRECT |
| U Opportunity Yield Forensics | `YIELD_CAUSE_CONFIRMED` | `D. INSUFFICIENT_SUPPORT` |
| V Status / Offline Finalizer | `STATUS_CONTRACT_READY` | 双状态解耦、独立根域、append-only revision |
| W Three-Company Sample | `THREE_COMPANY_SAMPLE_HARNESS_READY` | 10 项聚合产品门槛已由 Mock 固定 |

## Published Claim Truth Audit

原 Canonical 的 Strength 2 条均通过：`str_1=0 DIRECT / 4 PARTIAL / 0 CONTEXT`
且有 3 个独立来源；`str_2=1 / 0 / 0`。原 Canonical 三条 Issue 的逐条结果：

| Issue | DIRECT | PARTIAL | CONTEXT | 关系域名 | 独立 PARTIAL 根域 | 原 Quick 位置 | 原门槛 |
|---|---:|---:|---:|---|---:|---|---|
| `iss_1` | 0 | 2 | 1 | `insta360.com`、京东 | 1 | topIssue、headline、coreIssues[0] | FAIL |
| `iss_2` | 0 | 2 | 1 | `insta360.cn`、`insta360.com`、`support.insta360.com` | 1 | coreIssues[1] | FAIL |
| `iss_3` | 0 | 2 | 1 | `insta360.com`、京东 | 1 | coreIssues[2] | FAIL |

三条均使用“在本次保存的公开证据中……”或等价冻结范围限定，Coverage 边界成立；但
Coverage 不能替代 Quick 核心问题至少 1 条 `DIRECT_SUPPORT` 的门槛。`iss_1` 的冻结
snippet 还出现“产品对比”，`iss_3` 的同一冻结 Registry 存在家庭记录、旅拍、运动拍摄等
场景信号。因此三条从确定性 Core Issue 移除，只在 Deep“待确认信息”中以
“待进一步确认 / 仅限本次保存的公开证据范围 / 不作为确定性结论”呈现。

revision 后：Published Strength=2、确定性 Issue=0、Opportunity=0、Competitor Gap=0、
Demonstration Fix=null。Quick Issue=0，Deep 确定性 Issue=0，Deep 待确认观察=3。

## Opportunity Yield Forensics

| 指标 | Candidate | Published（原 / revision） |
|---|---:|---:|
| Strength | 2 | 2 / 2 |
| Issue | 3 | 3 / 0 |
| Opportunity | 3 | 0 / 0 |
| Demonstration Fix | 0 | 0 / 0 |

三个候选的 `sourceIssueId`、Evidence ID、customerQuestion、recommendedAction、
priorityReason 均存在且可追溯，但支持不足：

- `geo_1`：1 PARTIAL + 1 CONTEXT，仅 1 个独立 PARTIAL 根域。
- `geo_2`：2 PARTIAL + 1 CONTEXT；两个 PARTIAL 均归一到 Insta360 同一根域。
- `geo_3`：2 PARTIAL + 1 CONTEXT；两个 PARTIAL 均归一到 `insta360.com`。
- 三个候选的负面 `contentGap` 也没有冻结 Evidence 范围前缀。

revision 审计链对 `iss_1..3`、`geo_1..3` 均记录
`INSUFFICIENT_INDEPENDENT_SUPPORT`。没有把有效 Evidence 误记为无效引用，也没有降低关系
等级或阈值。

## Append-Only Report Revision

- Parent report：`7fcafee7-1cdf-466c-bb9b-efc78d438e1c`。
- Revision：`4680f7d3-fbdb-467a-841a-0352a12a478a`，revision number 1。
- Algorithm：`round53-truth-gate.v1`。
- Original report hash：`38ed516d4264bf32ad2b4c52d9129fa8acc204ae90b6b12fd1b3462472244c37`。
- New report hash：`5f61bd465b592febd936a747fa7b7d1a05296ce1fcede996d415c43287e3217a`。
- 原 `reports` 行逐字节保留；新 Canonical 与 revision/prune 审计行在同一事务追加。
- Public API 常规 latest-report 路径返回新 revision，HTTP 语义验证为 200，未泄漏 revision、
  stage、relation 或内部哈希字段。
- Provider 调用 0；Diagnosis、Evidence、阶段输出、关系、评分、AI tests 均未修改。

## Quick / Deep / Evidence

- Quick：默认 zh-CN，0 Issue、0 Opportunity、274 个中文可见字符，≤1800；CTA 不变。
- Deep：0 条确定性 Issue，3 条明确的待确认观察；不是完整 SOW。
- Evidence：22 条；normalized hash 仍为
  `b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd`。
- overallScore 仍为 59.95；权重、AI Visibility 公式与 scoreCoverage 未改变。
- Quick / Deep / Evidence 均由 revision Canonical 投影，切换新增 Provider 调用 0。

## 冻结历史与比较边界

- 原 `REPORT_CLAIMS_FAILED`、run-lock、Repair Attempt 1 与四个 SUCCEEDED stage run 保留。
- 四阶段 output hash 未变；ClaimEvidenceRelation 仍为 DIRECT 1 / PARTIAL 15 / CONTEXT 6。
- V1 目录 hash 仍为
  `1465e42ff81e94858fed7e54d61272c4127dc171df94f5e0377912ba3763b934`。
- Evidence registry hash 仍为
  `9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce`。
- V1 与 V2 基于不同证据集合和分析版本，分数仅分别描述各自诊断结果，不构成优化效果
  前后对照。

## Three-Company Sample Readiness

三企业真实样本尚未运行。纯离线统计器、fixture 与 Mock 测试已固定 10 项聚合门槛，包含
3/3 Truth Guard、3/3 无 UNSUPPORTED、3/3 Quick≤1800、切换零 Provider、Opportunity
血统 100%、至少 2/3 有可信 Opportunity、至少 1/3 有可信 Demo Fix、0 通用模板机会，并
明确允许单家 Opportunity=0 的稀疏但真实结果。
