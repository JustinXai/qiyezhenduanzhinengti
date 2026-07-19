# Round-5.2C / Round-5.3 Insta360 Chinese Technical Canary V2

## 结论

- Round-5.2C 原状态：`PASS_WITH_PRODUCT_YIELD_BLOCKER`（历史记录保留）。
- Round-5.3 将结论拆为 `TechnicalCanaryStatus` 与 `ProductYieldStatus`；Opportunity 为 0
  不再自动构成技术失败。
- 恢复模式：`FROZEN_EVIDENCE_REANALYSIS`；不是 Strict Checkpoint Resume。
- 同一真实 Diagnosis：`diag_d9d81ba3428f4696b088870ca7416e49`（短 ID `diag_d9d`）。
- 最终状态：`READY`；Repair Attempt 1 为 `SUCCEEDED`。
- 技术恢复链路已通过；Round-5.3 对现有报告执行零 Provider Truth Gate 审计与追加式
  离线再终结，不重跑 Recovery、不创建 Diagnosis、不补造 Opportunity。
- Round-5.3 最终：`TechnicalCanaryStatus=PASS`，
  `ProductYieldStatus=SPARSE_BUT_TRUTHFUL`。

## 原失败与冻结快照

首次失败文件和 run-lock 均逐字节保留：`FAILED / ANALYZING /
REPORT_CLAIMS_FAILED`，错误路径仍为 `demonstrationFix.currentIssue: Required`。
阻塞基线 Tag `rebuild-technical-company-canary-zh-v2-blocked-v1` 仍指向
`4a4b7569b3fd3edc6458114f06a53b7cc756a0cb`。

`FrozenEvidenceSnapshotV1`：

| 字段 | 值 |
|---|---|
| diagnosisInputHash | `7f83796f15c71668550d3b281055c11830f4d302d93bffc21c8de0fe02b73038` |
| evidenceRegistryHash | `9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce` |
| normalizedEvidenceHash | `b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd` |
| evidenceCount | 22 |
| sortedEvidenceIdsHash | `e2481085ba6b53c404505b450095a6dcde5e40d8ddcfc35db4742d3835bae428` |
| evidenceUrlsHash | `843a9980b2689a697f7bc94ebbcff58a712a7ae7788215d3de71bd448dadfb34` |
| 来源分布 | first-party=6 / observed=14 / competitor=2 |
| 语言分布 | zh=22 / other=0 |
| Tier 分布 | A=6 / B=2 / C=14 / D=0 / E=0 |
| queryPlanProvenance | `UNAVAILABLE` |
| competitorResolutionProvenance | `UNAVAILABLE` |

没有生成 queryPlanHash 或 competitorResolutionHash；四个 stage run 的对应字段均为
SQL `NULL`。`coverageMode=FROZEN_EVIDENCE_SCOPE_ONLY`，
`competitorResolutionStatus=UNVERIFIED_LEGACY_STATE`。

## Repair Attempt 与阶段持久化

Repair Attempt 1 记录：

- originalFailure：`REPORT_CLAIMS_FAILED`
- reusedStages：`EVIDENCE_REGISTRY`
- rerunStages：`REPORT_PROFILE → REPORT_SCORING → REPORT_AI_VISIBILITY → REPORT_CLAIMS`
- missingHistoricalProvenance：`QUERY_PLAN_HASH`、`COMPETITOR_RESOLUTION_HASH`
- providerCallDelta：4；resultState：`READY`

四阶段均严格 JSON 解析、Zod 验证后立即写入 `analysis_stage_runs`，状态均为
`SUCCEEDED`，模型均为 `deepseek-v4-flash`。输出哈希依次为：

1. Profile：`e4c373a3e7bed25f1c1dd9e5323b8598280f36f66e443148ffe70f296c9ab4a3`
2. Scoring：`82ba6ef1d63f35cfdfb2303fee45e71a1ecf1945b240c3cf68f393fe82273385`
3. AI Visibility：`20a43a183848fa7f1b4a63ab7d6067d05504cd283846f5003bb4a7d7842b45e8`
4. Claims：`6ed82de1c9917c61b9af3ad81242f1b0c432e04884d1ee5eba1c64cdee0e1761`

## Provider 差量

本次恢复：Bocha=0、Crawler=0、DeepSeek=4、retries=0、新 Diagnosis=0。
首次运行实际 DeepSeek 4 次，本次 4 次，历史总量保持硬上限 8。恢复没有调用 Query
Planner、Evidence Normalize 或 Competitor Resolver。

## Canonical、Claim–Evidence 与产品产出

- Round-5.2C 的 Claims Schema 与结构化解析通过；Round-5.3 复核发现当时的 Finalizer
  错误地让 Coverage-bounded PARTIAL 负面观察绕过 Quick 核心问题的 DIRECT 门槛。
- Claim–Evidence relations=22：DIRECT=1、PARTIAL=15、CONTEXT=6。
- 原 revision 发布 Strength=2、Issue=3、Opportunity=0、Competitor Gap=0、
  Demonstration Fix=null。三条 Issue 虽有范围限定，但逐条均为
  `DIRECT=0 / PARTIAL=2 / CONTEXT=1`，不满足 Quick 核心问题门槛。
- REPORT_CLAIMS 阶段实际返回 3 个 Opportunity 候选；`sourceIssueId`、Evidence ID、
  customerQuestion 与具体行动均完整。`geo_1` 只有 1 个 PARTIAL 来源；`geo_2`、`geo_3`
  的 PARTIAL 均未形成两个独立根域，因此根因确认为 `D. INSUFFICIENT_SUPPORT`。
- Opportunity=0 保持不变，不补位；产品产出分类为 `SPARSE_BUT_TRUTHFUL`。

## Quick / Deep / Evidence

- reportLanguage=`zh-CN`；overallScore=59.95；scoreCoverage=1.0。
- 原 Quick 默认，1097 可见字符（≤1800），但包含 3 条无 DIRECT 的核心问题，
  Truth Gate 判定为违规；Round-5.3 revision 必须移除这些 Quick 问题。
- 三条仅 PARTIAL 的负面观察只可进入 Deep“待确认信息”，并显式限定本次保存证据范围、
  标明待进一步确认且不作为确定性结论。
- 新 revision `4680f7d3-fbdb-467a-841a-0352a12a478a`：Quick Issue=0、
  Opportunity=0、274 字；Deep 确定性 Issue=0、待确认观察=3；Evidence=22。
- Quick 竞品说明保持冻结产品文案；Deep 记录“本次恢复未重新确认竞品官方网站”。
- Evidence View=22；Quick/Deep/Evidence 同源于同一 Canonical。
- 390px 真实页面检查：三视图均渲染、无横向溢出；切换期间 Provider usage 不变。
- Public API HTTP 200，未发现 Recovery mode、快照哈希、Repair Attempt 或 stage 字段泄漏。

## V1 / V2 对比

| 指标 | V1 | V2 Recovery |
|---|---:|---:|
| Final state | READY | READY |
| Evidence | 35 | 22 |
| Strength / Issue / Opportunity | 1 / 1 / 0 | 2 / 3 / 0 |
| Claim–Evidence relations | 10 | 22 |
| Competitor Gap | 0 | 0 |
| Demonstration Fix | null | null |
| Quick 字符 | 669 | 1097 |
| overallScore | 53.85 | 59.95 |
| DeepSeek（单次流程） | 4 | 4 |
| retries | 0 | 0 |

V1 与 V2 分数基于不同 Evidence 集合与分析版本，且 V2 为 Frozen-Evidence Reanalysis；
历史 Query Plan Hash 缺失、竞品解析未重新确认。因此两次分数只分别描述各自诊断结果，
不构成优化效果前后对照，不得表述为“中文优化后提升 6.1 分”。

V1 私有目录哈希仍为
`1465e42ff81e94858fed7e54d61272c4127dc171df94f5e0377912ba3763b934`，逐文件未修改。

## 质量、安全与冻结契约

- lint PASS（0 error，1 个既存 warning）、typecheck PASS、650 tests PASS、build PASS、
  smoke:mock PASS、security PASS（52 SSRF）、16 E2E PASS、`audit --prod` 0 漏洞。
- Round-5.3 最终集成：lint PASS（0 error，1 个既存 warning）、typecheck PASS、
  60 files / 681 tests PASS、build PASS、smoke:mock PASS、security 扫描 264 个 tracked files
  且 SSRF 52/52、16 E2E PASS、`audit --prod` 0 known vulnerabilities。
- 报告产品契约、评分权重 20/20/25/20/15、AI Visibility 公式、Claim–Evidence
  阈值、固定免责声明、CTA 与 SSRF 规则均未修改。
- Round-5.2C 的 main、integration 与 Tag 状态按当时事实保留；Round-5.3 最终集成与 Tag
  以本轮审计文档记录为准。
