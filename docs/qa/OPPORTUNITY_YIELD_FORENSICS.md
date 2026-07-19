# Round-5.3 Opportunity Yield Forensics

## 1. 结论

- 状态：`YIELD_CAUSE_CONFIRMED`
- 唯一 A–H 根因分类：**D. `INSUFFICIENT_SUPPORT`**
- Product Yield 判断：`SPARSE_BUT_TRUTHFUL`
- 当前 Opportunity=0 **不是**模型返回 0 个候选，也不是 sourceIssueId、Evidence ID、
  Schema、重复 Evidence 集合或通用行动造成。
- 已持久化 `REPORT_CLAIMS` 实际返回 3 个 Opportunity 候选；三者最终均未发布。
- 三者都没有满足冻结产品契约的“1 条 DIRECT，或 2 条独立 PARTIAL”门槛：
  `geo_1` 只有 1 条 PARTIAL；`geo_2` 的两条 PARTIAL 均来自 Insta360 官方根域；
  `geo_3` 的两条 PARTIAL 均为 `insta360.com`。CONTEXT_ONLY 不计入门槛。
- 三者的客户可见 `contentGap` 还使用了未加冻结范围前缀的缺失表述。Supervisor
  的冻结范围过滤器因此确定性移除了三者；没有修改关系等级，也没有生成 fallback。
- 发现一项**非根因的审计实现缺口**：该 Supervisor 专用过滤器只返回删减后的报告，
  没有持久化逐 Candidate 的 `DroppedClaimRecord/reasonCode`。本报告只能根据已持久化
  Stage Output、关系表、最终 Canonical 与确定性分支条件恢复原因。该缺口需要后续通用
  审计能力修复，但不构成“有效机会被错误剪枝”，因此不归类为 G。

## 2. 取证范围与只读约束

| 项目 | 取证值 |
|---|---|
| Git baseline | `cab80edb3bc910d2700a04309578dd5c1b045bb7` |
| Diagnosis | `diag_d9d81ba3428f4696b088870ca7416e49` |
| Diagnosis 状态 | `READY` |
| Claims Stage Run | `e88dd2d1-c7fa-4b98-9e5b-c908019d4b0e` / `SUCCEEDED` |
| Claims outputHash | `6ed82de1c9917c61b9af3ad81242f1b0c432e04884d1ee5eba1c64cdee0e1761` |
| Schema / Prompt | `ClaimsStageOutput.v2.1` / `REPORT_CLAIMS_ZH_PROMPT_V2_1.frozen-evidence-scope.v1` |
| Canonical Report | `7fcafee7-1cdf-466c-bb9b-efc78d438e1c` |
| Provider 调用 | 0 |
| 新 Diagnosis | 0 |
| Recovery 重跑 | 0 |
| V1/V2 业务表写入 | 0 |

本轮只读取已持久化 `analysis_stage_runs`、`claim_evidence_relations`、`evidence`、
`reports`，并对照 baseline 实现。没有保存数据库副本、Provider Payload、Prompt、
public token 或客户联系信息到仓库。

## 3. Candidate → Published 数量

| 内容类型 | Stage Candidate | Builder 后 | 最终 Published |
|---|---:|---:|---:|
| Strength | 2 | 2 | 2 |
| Core Issue | 3 | 3 | 3 |
| GEO Opportunity | 3 | 3 | 0 |
| Demonstration Fix | 0（模型返回 `null`） | 0 | 0 |

Candidate publication rate 为 `5 / 8 = 62.5%`（不把 `demonstrationFix=null` 当作
一个候选）；Opportunity publication rate 为 `0 / 3 = 0%`。

## 4. 每个 Opportunity Candidate

### geo_1

| 字段 | 已持久化值 |
|---|---|
| statement | 在官网或产品页增加产品对比表格、技术参数详解及用户实测对比案例，帮助消费者在选购时快速决策。 |
| sourceIssueId | `iss_1`（存在，且最终发布） |
| evidenceIds | `ev_bee405f0`, `ev_4e33f5fd`（均存在） |
| customerQuestion | 影石Insta360的产品相比竞品（如GoPro）有哪些优势和差异？ |
| recommendedAction | 在官网产品详情页增加可视化对比表格，从画质、防抖、视角、配件兼容性等维度进行对比，并嵌入用户实测对比视频片段。 |
| priorityReason | 对比内容直接影响搜索引擎对产品页的权威性评分，且能快速满足用户购买决策需求，提升转化效果。 |
| 关系 | `ev_4e33f5fd`: PARTIAL / MEASUREMENT_BOUNDARY / 0.60；`ev_bee405f0`: CONTEXT_ONLY / CONTENT_MATCH / 0.40 |
| 独立可计数支持来源 | 1：`insta360.com`；京东关系仅 CONTEXT_ONLY，不计入发布阈值 |
| 最终状态 | `PRUNED_NOT_PUBLISHED` |
| 持久化 prune reasonCode | **缺失（实现未记录）** |
| 确定性主原因 | `INSUFFICIENT_INDEPENDENT_SUPPORT`：无 DIRECT，只有 1 条 PARTIAL |
| 同时命中的冻结过滤条件 | `FROZEN_SCOPE_PREFIX_MISSING`：合并后的 Opportunity 文本含“缺乏”，但没有批准的冻结范围前缀 |

### geo_2

| 字段 | 已持久化值 |
|---|---|
| statement | 在官网增设企业服务专区，展示合作案例、服务流程及资质证书，提升企业客户信任度。 |
| sourceIssueId | `iss_2`（存在，且最终发布） |
| evidenceIds | `ev_08d8fb26`, `ev_46b7297c`, `ev_11461056`（均存在） |
| customerQuestion | 影石Insta360的企业采购、定制、代理服务有哪些成功案例和资质？ |
| recommendedAction | 在官网导航栏增设“企业服务”板块，发布合作案例、服务流程、客户评价及资质证书，并设置在线咨询入口。 |
| priorityReason | B2B业务客户对信息透明度要求高，完善此内容可形成差异化优势，且当前证据显示该内容缺失，机会窗口明显。 |
| 关系 | `ev_11461056`: PARTIAL / MEASUREMENT_BOUNDARY / 0.60；`ev_46b7297c`: PARTIAL / MEASUREMENT_BOUNDARY / 0.60；`ev_08d8fb26`: CONTEXT_ONLY / CONTENT_MATCH / 0.40 |
| normalizedDomain | `insta360.com`, `support.insta360.com`, `insta360.cn` |
| 独立可计数支持来源 | 1 个组织根域：两条 PARTIAL 都属于 Insta360 的 `insta360.com` 官方根域；`insta360.cn` 仅 CONTEXT_ONLY |
| 最终状态 | `PRUNED_NOT_PUBLISHED` |
| 持久化 prune reasonCode | **缺失（实现未记录）** |
| 确定性主原因 | `INSUFFICIENT_INDEPENDENT_SUPPORT`：两条 PARTIAL 是两个 Evidence ID，但不是两个独立来源 |
| 同时命中的冻结过滤条件 | `FROZEN_SCOPE_PREFIX_MISSING`：`contentGap` 使用无范围限定的“缺乏” |

### geo_3

| 字段 | 已持久化值 |
|---|---|
| statement | 在官网或官方社交平台增加应用场景专题页，整合用户实测视频、教程与图文攻略，激发用户购买欲望。 |
| sourceIssueId | `iss_3`（存在，且最终发布） |
| evidenceIds | `ev_bee405f0`, `ev_4e33f5fd`, `ev_c3da0ba0`（均存在） |
| customerQuestion | 影石Insta360的产品在骑行、滑雪、Vlog等场景下的实际效果如何？ |
| recommendedAction | 在官网“发现精彩”栏目下增加“场景应用”子板块，按骑行、滑雪、Vlog、旅行等分类聚合用户实测视频、图文攻略及官方教程，并嵌入FAQ或BEFORE_AFTER_STRUCTURE内容。 |
| priorityReason | 场景化内容能显著提升用户停留时间和社交分享，而当前证据显示该内容缺失，竞争对手GoPro在场景化内容上已有积累，优先布局可快速抢占用户心智。 |
| 关系 | `ev_4e33f5fd`: PARTIAL / MEASUREMENT_BOUNDARY / 0.60；`ev_c3da0ba0`: PARTIAL / MEASUREMENT_BOUNDARY / 0.60；`ev_bee405f0`: CONTEXT_ONLY / CONTENT_MATCH / 0.40 |
| normalizedDomain | `insta360.com`, `insta360.com`, `京东` |
| 独立可计数支持来源 | 1：两条 PARTIAL 均为 `insta360.com`；京东仅 CONTEXT_ONLY |
| 最终状态 | `PRUNED_NOT_PUBLISHED` |
| 持久化 prune reasonCode | **缺失（实现未记录）** |
| 确定性主原因 | `INSUFFICIENT_INDEPENDENT_SUPPORT`：无 DIRECT，两条 PARTIAL 来自同一 normalizedDomain |
| 同时命中的冻结过滤条件 | `FROZEN_SCOPE_PREFIX_MISSING`；此外 priorityReason 含冻结禁用文案“显著提升”，并对未重新确认官网的 GoPro 作确定性积累判断，不能公开 |

## 5. Builder、Pruner 与 Guard 逐层核验

### 5.1 Schema 与 Builder

1. Stage Run 为 `SUCCEEDED`，输出通过 `ClaimsStageOutput.v2.1` 严格解析。
2. 三个 Opportunity 都具有 `sourceIssueId/customerQuestion/recommendedAction/
   priorityReason/evidenceIds`；不存在旧字段读取或字段丢失。
3. Builder 的 `buildGeoOpportunities` 先解析 Evidence ID，再验证 source Issue；三个
   source Issue 均成功构建为 `iss_1..iss_3`，所有 Evidence ID 均在冻结的 22 条
   Registry 中，因此 Builder 产出 `geo_1..geo_3`，没有 Builder `dropped` 记录。
4. 不存在第一条 Issue/Evidence fallback；ID 是按 Stage 数组位置确定性生成。

实现锚点：`src/diagnosis/analysis/claims.ts:99-140, 275`；
`src/diagnosis/analysis/stage-schemas.ts:89-143`。

### 5.2 Pairwise Relations 与发布阈值

| Candidate | DIRECT | PARTIAL | CONTEXT | PARTIAL Evidence IDs | 独立支持来源结论 |
|---|---:|---:|---:|---|---|
| geo_1 | 0 | 1 | 1 | `ev_4e33f5fd` | 1，失败 |
| geo_2 | 0 | 2 | 1 | `ev_11461056`, `ev_46b7297c` | 同一 Insta360 官方根域，失败 |
| geo_3 | 0 | 2 | 1 | `ev_4e33f5fd`, `ev_c3da0ba0` | 同一 `insta360.com`，失败 |

所有 PARTIAL 都是 `MEASUREMENT_BOUNDARY`，所有 CONTEXT 都是 `CONTENT_MATCH`；
没有 UNSUPPORTED 或非法关系。CONTEXT_ONLY 不能补足发布阈值，两个同域 Evidence 也不能
伪装成两个独立来源。

现有通用 `evidenceGuard` 对 `NEGATIVE_MISSING` 走特殊分支，只要求至少 1 条
coverage-backed PARTIAL（`src/report/validation/evidence-guard.ts:148-154`），并未执行
Opportunity 的“1 DIRECT 或 2 独立 PARTIAL”来源独立性检查。这是需要后续 Guard 审计的
通用差距，但它没有造成当前 Opportunity=0；它反而会偏宽松。

### 5.3 Pruner 与 Frozen Finalizer

1. 通用 `pruneUnsupportedClaims` 没有移除这些候选，因为上述负面特殊分支接受了至少
   1 条 coverage-backed PARTIAL。
2. Supervisor 随后调用 `removeFrozenUnsupportedClaims`。该函数把 Opportunity 的
   `statement/businessImpact/customerQuestion/contentGap` 合并分类；三个 contentGap 都含
   “缺乏”，因此全部被视为 `NEGATIVE_MISSING`。
3. 三个合并文本都不含批准的冻结范围前缀，所以 `bounded=false`；函数在
   `!bounded || partial.size < 2` 时删除 Claim。`geo_1` 两个条件都失败，`geo_2/geo_3`
   至少失败范围前缀条件。
4. 该函数只返回新 `DiagnosisReport`，没有返回或持久化 reasonCode；最终 Canonical
   因而只有 `geoOpportunities=[]`，无法从最终报告本身区分剪枝原因。

实现锚点：`scripts/run-frozen-evidence-reanalysis-supervisor.ts:224-251`；
通用 reasonCode 路径在 `src/report/validation/prune-claims.ts:28-98`，但该 Supervisor
专用过滤未复用它。

### 5.4 Default-deny、重复集与通用模板

- `sourceIssueId`：3/3 有效，且对应最终发布 Issue。
- Evidence 引用：8 个 Candidate 引用位置全部解析成功。
- 必需字段：3/3 非空；没有 Schema default/fallback。
- 行动具体性：3/3 都不是“多发内容/优化内容/提升曝光/加强宣传”默认模板。
- Evidence 集合：三组分别为 `{bee,4e33}`、`{08d8,46b7,1146}`、
  `{bee,4e33,c3da}`，不相同，不命中 `DUPLICATED_EVIDENCE_SET`。
- Demonstration Fix：Stage 明确返回 `null`，不是 Builder 或 Guard 丢失。

## 6. A–H 排除法

| 分类 | 结论 | 证据 |
|---|---|---|
| A MODEL_RETURNED_ZERO_CANDIDATES | 排除 | Stage 返回 3 个 |
| B INVALID_SOURCE_ISSUE_REFERENCE | 排除 | `iss_1..iss_3` 均存在且发布 |
| C INVALID_EVIDENCE_REFERENCE | 排除 | 所有 Candidate Evidence ID 均在 22 条 Registry |
| **D INSUFFICIENT_SUPPORT** | **确认** | 0 DIRECT；每个 Candidate 只有 1 个独立可计数支持来源；负面 contentGap 还缺冻结范围限定 |
| E DUPLICATED_EVIDENCE_SET | 排除 | 三组 Evidence 集合不同 |
| F GENERIC_OR_UNACTIONABLE | 排除为主因 | 三个行动均具体；geo_3 有禁用/竞品表述问题，但不是全部归零的共同原因 |
| G BUILDER_OR_GUARD_BUG | 排除为根因 | 没有证据充分且满足范围契约的 Candidate 被错误剪枝；另有 reasonCode 未持久化和来源独立性未通用校验的实现缺口 |
| H VALID_SPARSE_RESULT | 排除为直接原因 | Stage 并不稀疏，返回 3 个无足够独立支持的候选 |

因此本次真实报告维持 Opportunity=0 是可信的 default-deny 结果。不得离线补造、升级
关系或放宽阈值；单家企业的该结果不能代表整体 Opportunity 产出率。

## 7. 后续通用修复建议（本 Agent 不实施）

1. 将 Frozen Finalizer 的逐 Candidate 删除结果写入 append-only 审计记录，至少包含
   `claimId/ref/reasonCode/guardRule`；不要覆盖 Stage Output。
2. 区分“Coverage 已建立但客户文案缺限定前缀”和“Coverage 未建立”，新增精确内部原因，
   避免把二者都映射成 `COVERAGE_NOT_ESTABLISHED`。
3. 通用 Opportunity Guard 按独立来源域计算 PARTIAL 阈值；同一组织根域或相同
   normalizedDomain 的两个 Evidence 不能计作两个独立来源。
4. Prompt/Schema Mock 回归应覆盖 Opportunity 的客户可见 `contentGap` 也必须携带冻结
   范围限定，而不只检查 source Issue。
5. 保持当前 Canonical 不变；任何技术修复只能用已持久化 Stage Output 做 append-only
   离线 Refinalization，且不得生成当前证据不能支持的 Opportunity。
