# ARCHITECTURE — 唯一事实源架构

## 展示链路

```
Canonical DiagnosisReport
  → ReportPresentationService
    → QuickReportViewModel
    → DeepReportViewModel
    → EvidenceViewModel
```

系统只保存一份 Canonical `DiagnosisReport`（`src/contracts/index.ts`）。

## 禁止

- 为 Quick 重新调用 DeepSeek；
- 为 Deep 重新调用 DeepSeek；
- 保存两份不同报告 JSON；
- Quick 和 Deep 使用不同分数；
- Quick 和 Deep 使用不同 Evidence；
- 前端重新计算分数；
- 前端重新解释 AI 测试；
- 前端直接使用 `array[0]` 选择核心问题（选择逻辑属于
  `ReportPresentationService`，不是渲染层）；
- 切换视图时创建新任务或产生费用。

## 状态机（Agent E 实现，src/runtime/, src/diagnosis/orchestration/）

```
CREATED → VALIDATING → SEARCHING → CRAWLING → NORMALIZING_EVIDENCE
  → ANALYZING → CLAIM_EVIDENCE_VERIFICATION → VALIDATING_REPORT → READY | FAILED
```

`CLAIM_EVIDENCE_VERIFICATION`（Round-3,Agent H）位于 `ANALYZING` 与
`VALIDATING_REPORT` 之间:对每个候选 `(Claim, Evidence)` pair 由
`ClaimEvidenceVerifier`（`src/diagnosis/verification/`）判定语义支持等级,产出
`ClaimEvidenceRelation[]`(持久化于 `claim_evidence_relations`)。`EvidenceItem.supportLevel`
退化为来源属性默认值,不再表达对某 Claim 的语义支持;发布 Guard 的 §4 裁决改以
`ClaimEvidenceRelation` + 测量边界 `EvidenceCoverage` 为唯一依据。模型输出不能直接决定
`READY`(Mock 模式使用确定性 Verifier,零 Provider 调用;真实模式为 DeepSeek 结构化
Verifier,本轮不真实调用)。

## 目录职责总览

| 目录 | 归属 Agent | 内容 |
|---|---|---|
| `src/contracts/` | B（index.ts 由 Supervisor 独占） | 共享类型、Zod schema |
| `src/report/validation/` | B | Evidence Semantic Guard、Cross-field Guard、CTA Guard |
| `src/providers/bocha/` | C | 博查 Adapter |
| `src/diagnosis/search/`、`src/diagnosis/evidence/` | C | Query Planner、Evidence 规范化 |
| `src/security/crawler/` | C | SSRF 防护 Crawler |
| `src/providers/deepseek/` | D | DeepSeek JSON Adapter |
| `src/diagnosis/analysis/`、`src/report/generation/` | D | 阶段化分析、报告组装 |
| `app/api/`、`src/runtime/`、`src/storage/`、`src/diagnosis/orchestration/` | E | 状态机、Storage、API |
| 非 API 页面、`components/`、`src/report/presentation/` | F | Quick/Deep/Evidence 渲染 |
| `tests/e2e/`、`tests/security/`、`.github/workflows/` | G | QA、CI、可信评审 |

详见 [docs/AGENT_FILE_OWNERSHIP.md](AGENT_FILE_OWNERSHIP.md)。

## 技术栈

Next.js 15 App Router / TypeScript strict / Tailwind CSS / Zod / Vitest /
Playwright / pnpm / SQLite / Drizzle ORM / Cheerio / p-limit。单仓库单体应用 +
一个轻量 Worker 入口。不使用 Redis、消息队列集群或复杂事件总线。

持久化最少包括：`diagnosis_requests`、`evidence`、`reports`、`provider_usage`、
`analysis_checkpoints`（见 `src/storage/schema.ts`）。通过 `StorageAdapter`
（`src/storage/adapter.ts`）隔离数据库实现。禁止用散乱 JSON 文件作为正式运行状态。


## Round-5.1 中文成交版补充

公开报告语言冻结为 zh-CN(见 `docs/CHINESE_REPORT_CONTRACT.md`)。证据在
NORMALIZING_EVIDENCE 阶段经过语言检测、来源分层(A–E)与去重
(`src/diagnosis/evidence/tiering.ts`,见 `docs/CHINESE_EVIDENCE_POLICY.md`),
公开投影经 `ChinesePublicReportGuard` 与 `chineseConversionReview`
(`src/report/validation/`)双重确定性检查。公开标签的唯一程序来源为
`src/report/presentation/zh-labels.ts`。
