# REBUILD_EVIDENCE_LEDGER

记录重建过程中每一次「决策 / 已知事实 / 待确认事实」的台账，供后续 Agent 与人工审查
追溯依据，避免把未验证的假设当成既定事实。

## 格式

每条记录：

```
- [YYYY-MM-DD] <KNOWN|DECISION|UNKNOWN> <主题> — <说明> (来源: <会话/文档>)
```

## 台账

- [2026-07-18] DECISION 重建独立于任何旧仓库，Git 历史从空目录 `git init` 开始 —
  不复制旧 `.git`、不修复旧 worktree、不拼接旧源码。(来源: 本次 Supervisor 会话冻结指令)
- [2026-07-18] KNOWN GitHub 远程 `https://github.com/JustinXai/qiyezhenduanzhinengti.git`
  当前为空仓库（`git ls-remote` 无任何 ref），可安全作为 `origin/main` 的起点。
- [2026-07-18] DECISION 五项评分权重、Quick 8 模块结构、AI 可见度单一事实源规则、
  Provider 错误分类与重试策略，均按用户在本次会话中给出的冻结说明原样落地到
  `docs/*.md` 与 `src/contracts/index.ts`，未做任何产品范围外推。
- [2026-07-18] UNKNOWN 真实博查 / DeepSeek API Key 尚未配置到 `.env`（仅有
  `.env.example` 占位）。真实样本运行前必须由用户在本地补齐，Supervisor/Agent 不得
  询问或代填密钥值。
- [2026-07-18] UNKNOWN Mock Provider 的具体 Fixture 内容（各阶段 DeepSeek 结构化输出
  样例）尚未编写，留给 Agent D 在 `tests/providers/` 补充。

- [2026-07-18] KNOWN 基线 lint Gate 曾为 RED — pnpm 严格布局下
  `@next/eslint-plugin-next` 仅在 `eslint-config-next` 内部可解析，项目根解析失败，
  `pnpm lint` 非零退出（`next build` 仅告警放过，故此前误报「全绿」）。已通过将该插件
  声明为顶层直接 devDependency 修复，基线 commit `764283b` 六 Gate 实测全绿。
  (来源: 本次 Supervisor 会话实跑)
- [2026-07-18] KNOWN 上游 `next@15.3.1` 存在安全公告 CVE-2025-66478。已记录为范围外
  待办，本轮 Mock Vertical Slice 不处理，留待后续统一升级到补丁版。(来源: pnpm install 告警)
- [2026-07-18] DECISION 新增 Supervisor 独占目录 `src/fixtures/`，其中
  `sample-report.ts` 导出唯一权威 `SAMPLE_DIAGNOSIS_REPORT`（已 Zod 校验通过、
  evidenceId 无悬空、demonstrationFix 免责声明取自 schema 字面量保证逐字节一致），
  作为 7 路并行产出的集成锚点。(来源: 本次 Supervisor 会话)
- [2026-07-18] DECISION 本轮再派发采用「抗中断纪律」：切片一绿即本地 commit、
  一律不 push（远程推送由 Supervisor 审核后统一处理）、Mock 接缝对齐共享 fixture。
  (来源: 本次 Supervisor 会话 DELIVERY_BOARD)

- [2026-07-18] KNOWN 初版共享 fixture 只过了 Zod 形状、未过语义 Guard（播种时 Guard 尚未
  存在）。Agent B 实现 Guard 后发现 `SAMPLE_DIAGNOSIS_REPORT` 违反 PRODUCT_TRUTH_RULES
  §4（核心问题/机会引用 PARTIAL/CONTEXT_ONLY 证据,共 5 条)且 `aiVisibility.score=40`
  与 §8 冲突(仅 2 个 VALID 测试)。Supervisor 已修正:first-party about/product 证据
  升为 `DIRECT_SUPPORT`、iss_2/geo_2 改引 DIRECT 证据、`aiVisibility` 置为
  null/INSUFFICIENT(coverage→0.85、overallScore→62.53)。已用 B 的真实 `publishGuard`
  验证 `ok:true`。(来源: Agent B Round-1 反馈 + Supervisor 复核)
- [2026-07-18] TODO 集成待办:B 的「记录 5 违规码」pin 测试需随 fixture 修正翻转为断言
  `ok:true`;D 的 report-generation 锚点数字需从 59.15/coverage 1.0 更新为
  62.53/0.85;C↔E 的 EvidencePipeline 接缝、D↔E 的 ReportProducer 接缝需焊接;
  竞品名→域名解析步骤(C 的遗留①)待补。

- [2026-07-18] DECISION Round-3:语义支持从 EvidenceItem 全局属性分离为
  `ClaimEvidenceRelation`(逐 (Claim,Evidence) pair);新增 `CLAIM_EVIDENCE_VERIFICATION`
  阶段;`clampVerdict` 强制来源/极性/coverage 前置,模型判 DIRECT 不满足前置即降级;
  首方/竞品自动 DIRECT 桩删除。(来源: Agent H + Supervisor)
- [2026-07-18] DECISION Round-3:负面/缺失 Claim 需 EvidenceCoverage 测量边界
  (`boundaryEstablished = 首方范围内页面≥1 且 已执行查询≥1`),无 coverage 者由
  `pruneUnsupportedClaims` 验证后移除,报告在其它内容可信时仍 READY;硬拦截(§4.5/4.6/4.8)
  不剪枝。(来源: Supervisor §六)
- [2026-07-18] DECISION Round-3:Provider Mode `MOCK`/`REAL` 显式受控,仅 `PROVIDER_MODE`
  env 决定;`REAL` 缺配置抛 `REAL_PROVIDER_NOT_AUTHORIZED`、缺授权抛
  `PROVIDER_CANARY_REQUIRED`,绝不回退 MOCK;本轮真实 Provider 未启用。(来源: Supervisor §四)
- [2026-07-18] KNOWN Round-3 三 Canary(A/B/C)走真实应用边界 + Quick/Deep/Evidence 页面
  (vitest + Playwright 390px)全绿;真实 Provider 调用 0、真实 Diagnosis 0、main 未改变;
  下一阶段仅 `READY_FOR_PROVIDER_CANARY`。(来源: Supervisor §七/十四)

后续每个 Agent 在自己的 `agent-output/<agent-name>/CHECKPOINT.md` 中新增台账条目，
并由 Supervisor 汇总同步回本文件的关键决策部分（非逐条照抄）。

- [2026-07-19] KNOWN Round-5.1 中文成交版:zh-CN 契约冻结、中文公开 Guard、
  ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK 查询策略、证据分层去重、机会血统与
  reasonCode、测量构成展示;三条全链 Mock 中文 Canary(API→…→Guard)全绿;
  verify-only 复核已存 Insta360 报告 15/15,零 Provider 调用、零新 Diagnosis。
  Mock Canary 不构成真实企业验证;中文查询/Prompt 的真实链路需下一次授权的
  Insta360 真实诊断确认。(来源: Supervisor Round-5.1)

- [2026-07-19] DECISION Round-5.2C 将严格历史恢复与冻结 Evidence 再分析分离：
  `STRICT_CHECKPOINT_RESUME` 继续因 query/competitor hash 缺失而阻塞；
  `FROZEN_EVIDENCE_REANALYSIS` 显式记录两项 provenance 为 `UNAVAILABLE`，不生成假 hash，
  只消费原 Input 与 22 条 Evidence。(来源: Supervisor Round-5.2C 授权)
- [2026-07-19] KNOWN Round-5.2C 唯一真实 Repair Attempt 已成功：同一 `diag_d9d` READY，
  四分析阶段顺序持久化，Bocha/Crawler delta=0、DeepSeek delta=4、retries=0，Evidence
  registry `9b4ca22d…` 与 normalized `b55c9c77…` 未变，V1 逐文件未变；原
  `REPORT_CLAIMS_FAILED` 摘要与 run-lock 保留。(来源: SQLite 与只读 forensic audit)
- [2026-07-19] KNOWN 恢复后发布 Issue=3、Opportunity=0。技术链路、Canonical、Verifier、
  Publish/中文/Frozen-Evidence Guard 与 390px 三视图均通过，但产品产出门槛未通过；状态定为
  `PASS_WITH_PRODUCT_YIELD_BLOCKER`，不重跑、不合 integration、不创建成功 Tag、不进入
  三企业样本。(来源: Supervisor Round-5.2C 最终审计)
