# Round-5.2 Insta360 Chinese Technical Canary V2

## 结论

- 状态：`BLOCKED_REAL_ANALYSIS_SCHEMA_MISMATCH`
- 技术 Canary：未通过；`READY_FOR_THREE_COMPANY_SAMPLE=NO`
- 唯一真实 Diagnosis：`diag_d9d81ba3428f4696b088870ca7416e49`（对外仅使用短 ID `diag_d9d`）
- 最终状态：`FAILED`，失败阶段 `ANALYZING`
- 错误：`REPORT_CLAIMS_FAILED`；`claims.demonstrationFix.currentIssue` 缺失
- 未重跑、未修补 Provider JSON、未放宽 schema、Evidence Guard 或 Publish Guard。

## 状态时间线

时间为 UTC，来自 V2 私有 run-lock、数据库与失败摘要。

| 状态 | 时间 |
|---|---:|
| Runner 启动 | 2026-07-19 01:27:27 |
| SEARCHING | 2026-07-19 01:27:37 |
| CRAWLING | 2026-07-19 01:27:39 |
| ANALYZING | 2026-07-19 01:27:41 |
| FAILED | 2026-07-19 01:28:10 |
| V2 run-lock 写为 failed | 2026-07-19 01:28:12 |

正式 POST 耗时 35.7 秒（Runner 显示 36 秒）。未到达
`CLAIM_EVIDENCE_VERIFICATION`、`VALIDATING_REPORT` 或 `READY`。

## V1 / V2 确定性对比

| 指标 | V1 审计产物 | V2 |
|---|---:|---:|
| Final state | READY | FAILED / ANALYZING |
| Evidence after dedup | 35 | 22 |
| First-party | 3 | 6 |
| Observed | 32 | 14 |
| Competitor | 0 | 2 |
| Claim–Evidence relations | 10 | 0（未到验证阶段） |
| DIRECT / PARTIAL / CONTEXT | 0 / 5 / 5 | 不适用 |
| Published strengths | 1 | 0 |
| Published issues | 1 | 0 |
| Published opportunities | 0 | 0 |
| Demonstration Fix | null | 未生成 Canonical |
| Quick 可见字符 | 669 | 不适用 |
| Bocha | 8 | 9 |
| DeepSeek | 4 | 4 次实际请求；失败路径未写 usage 表 |
| retries | 0 | 0 |
| overallScore | 53.85 | 不适用 |
| measurementComposition | 实测 15% / 估算 85% | 不适用 |

V1 授权说明中的 Quick 基线为 665 字；保留的 V1 `summary.json` 实际记录为 669 字，
本表采用审计产物值。

## Evidence 与 Query Policy

- `afterDedup=22`。
- `beforeDedup` 未由当前正式管线持久化，不能可靠重建；不以 22 冒充该值。
- `chineseEvidenceCount=22`；`englishOfficialFallbackCount=0`。
- Tier 分布：A=6，B=2，C=14，D=0，E=0。
- 类型分布：first-party=6，observed=14，competitor=2。
- `evidenceUsedByClaims=0`、`unusedEvidenceCount=22`、`evidenceUtilizationRate=0%`；原因是
  claims schema 失败后没有 Canonical Claim，而不是 Evidence 被 Publish Guard 剪枝。
- 所有持久化 Evidence 的 `language=zh`，中文 Evidence 数高于英文官方 fallback。
- 查询结果体现中文网络优先；但正式数据库不持久化完整 query plan，无法从运行后产物逐条审计
  查询文本。原始 Provider 响应按安全边界未落盘。

### GoPro 解析

未确认 GoPro 英文官方域名。V2 中两条 `COMPETITOR_WEB_EVIDENCE` 均为中文第三方页面，
不是 GoPro 官方站；因此国际竞品官方身份确认目标未通过。未手工填写 GoPro 官网。

## Content Yield 与 Opportunity lineage

`claims` 是第 4 个且最后一个 DeepSeek 结构化阶段。响应通过 JSON 解析，但不符合严格 schema：
返回了非 null `demonstrationFix`，却缺少必填 `currentIssue`。管线立即失败。

- candidateStrengthCount / candidateIssueCount / candidateOpportunityCount /
  candidateDemonstrationFixCount：不可报告。无效 stage 输出按安全设计未持久化，不能从错误文本
  反推候选数量。
- publishedStrengthCount=0、publishedIssueCount=0、publishedOpportunityCount=0、
  publishedDemonstrationFixCount=0。
- claimPublicationRate：不适用（候选分母不可审计）。
- opportunityYieldRate：不适用（候选分母不可审计）。
- pruneReasonDistribution：`SCHEMA_MISMATCH=1`；这发生在发布前，不是 Publish Guard 剪枝。
- Opportunity `sourceIssueId`、有效 Evidence、客户问题 lineage：未生成，产品通过条件未满足。

## Provider 预算

- Bocha：9 次，低于 12 次硬上限。
- DeepSeek：4 次，低于 8 次硬上限。正式 producer 固定顺序为 company profile、dimension
  signals、AI visibility、claims；错误发生于 claims 响应 schema 校验，因此实际完成了 4 次请求。
- retries=0。
- Crawler：9 次尝试（8 次成功、1 次 HTTP error），低于总页面 12 上限。
- 总耗时：POST 35.7 秒。
- token usage 与逐调用 latency：当前 provider usage schema 未持久化，不能可靠报告。
- 观测缺口：producer 失败时 state machine 在 `recordUsage(produced.usage)` 前返回，因此 V2
  `provider_usage` 表显示 DeepSeek 0；本报告没有把该持久化缺口误写成零真实调用。

## Quick / Deep / Evidence / Score

没有 Canonical Report，因此 Quick、Deep、Evidence 客户视图、reportLanguage、中文公开报告
Guard、评分覆盖、measurementComposition、页面切换零调用和 390px 截图均不适用，不能判定通过。
私有目录没有生成截图，这是失败即停的预期结果。

评分权重代码未修改；事后完整 Gate 中评分契约测试通过。Publish Guard、Evidence Guard、
ChinesePublicReportGuard 均未放宽，但 V2 没有走到可对真实 Canonical 执行这些 Guard 的阶段。

## 根因、影响与通用 Guard

- 现象：`REPORT_CLAIMS_FAILED`，缺少 `demonstrationFix.currentIssue`。
- 根因：Prompt 对 Demonstration Fix 使用 `{...}` 占位描述，没有逐字段呈现严格 schema；模型返回
  非 null 对象时漏掉必填字段。严格解析按契约正确拒绝。
- 影响范围：本次 V2 无 Canonical、无评分、无 Claim 发布、无客户视图；Evidence 与前 3 个分析
  请求已发生，但不能转化为报告。
- 上下游：上游为 claims prompt/schema 对齐；下游为 Claim–Evidence verifier、Publish Guard、
  Presentation 与截图，均未执行。
- 同类风险：任何 Prompt 以省略号描述、但 schema 要求完整字段的嵌套对象都可能产生同类失败。
- 系统不变量：不修补 Provider JSON、不放宽 schema、不把失败响应直接送入 Report Builder、
  不自动重跑。
- 建议的通用 Guard（本轮不实施并重跑）：由 schema 派生完整 JSON 形状或在 Prompt 中列全所有
  required 字段；增加缺失每个 Demonstration Fix 必填字段的 Mock 回归；失败路径先脱敏记录
  provider usage 再返回。

## 质量、安全与隔离

- 运行前与运行后 Gate 均通过：lint（0 error，1 个既存 warning）、typecheck、564 tests、build、
  Mock smoke、security check、16 E2E、`pnpm audit --prod` 0 known vulnerabilities。
- SSRF strict 行为门：52 个对抗用例全部通过。
- `.env.local` 保持 Git ignored；两个 Provider key 仅检查为 PRESENT，未输出值。
- V1 私有目录逐文件 SHA-256 与运行前一致，V1 run-lock 未删除或修改。
- V2 目录、SQLite、run-lock 与失败摘要位于仓库外，未进入 Git。
- main 与 integration 未切换、未合并、未推送；未创建成功 Tag。

## CTO 成交判断

本轮证明了中文 Evidence 策略能得到 22/22 中文标注证据，且第一方证据从 V1 的 3 条增至
6 条；但竞品官方身份确认失败，分析阶段又因 Prompt/schema 对齐问题中止，无法形成可成交的
中文 Canonical，更无法证明 Opportunity lineage。结论是阻塞，不应进入三企业样本。

