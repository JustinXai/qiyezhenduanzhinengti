# Round-3 Pre-Real-Sample Hardening — QA 记录

> **本文件记录的是 Mock 加固与 Mock Canary,不是真实企业验收。真实 Provider 与真实样本尚未运行。**

基线:tag `rebuild-live-seams-v1` @ `b0e36dd`。

## 交付项

| # | 项 | 结果 |
|---|---|---|
| 1 | Claim–Evidence 语义验证 | Evidence 与关系职责分离;`ClaimEvidenceRelation`;`CLAIM_EVIDENCE_VERIFICATION` 阶段;确定性 + DeepSeek(接口)Verifier;关系持久化可追溯;首方/竞品自动 DIRECT 桩已删除 |
| 2 | Coverage Context + 负面 Claim 政策 | `EvidenceCoverage`(queryPlanId/planned/executed/successful/failed/searchedDomains/crawledPages/searchWindow/coverageLimitations/boundaryEstablished);负面无 coverage → 验证后剪枝,报告仍 READY;限定范围文案 |
| 3 | Provider Mode | `MOCK`/`REAL` 显式受控;REAL preflight 抛 `REAL_PROVIDER_NOT_AUTHORIZED` / `PROVIDER_CANARY_REQUIRED`,绝不回退 MOCK;仅 env 决定,不受前端/用户输入;不进公共 payload/页面 |
| 4 | 竞品实体解析 | 5 状态;不拼接 .com;歧义无差距;删除固定域名 |
| 5 | SSRF 严格行为 Gate | 52 对抗用例行为测试(非关键词),默认 strict-on;修复 slowloris-body DoS |
| 6 | Next 安全升级 | 15.3.1 → 15.5.20(未上 16),清 CVE-2025-66478 等 24 项 Next 漏洞 |
| 7 | 公开文案冻结 | 单一程序来源 `src/product/customer-copy.ts`;OQ-1 全角逗号;OQ-4/5/6/8 待产品裁定 |

## 冻结架构不变量(未改变)

单网站 → 单 Diagnosis → 单 Canonical DiagnosisReport → Quick/Deep/Evidence。
唯一链路见 `docs/CLAIM_EVIDENCE_VERIFICATION.md`。

## 已删除的临时桩(Section 五 审计通过)

首方来源自动 DIRECT / 竞品自有页自动 DIRECT / 固定竞品域名(分类)/ live-seams 临时 support assessor / 前端自读 fixture / fixture 驱动生产路径。Mock Provider 保留但仅经**显式 Provider Mode** 注入;Canary 场景仅经测试专用配置(`CANARY_MODE` + 保留域名)选择,不经公开 API。

## Canary

见 `docs/qa/canaries/`。3 条 Canary(A 正面 DIRECT / B About-only 负面受限 / C 竞品歧义)均走真实应用边界 + Quick/Deep/Evidence 页面(vitest 数据层 + Playwright 页面层 390px)。

## 回归计数(Supervisor 实测)

- Test 文件数:**40**;Test 总数:**484**
- E2E:**16**(report.spec 10 + canary.spec 6;chromium mobile+desktop)
- SSRF 行为用例:**52**(`tests/security/crawler/ssrf-behavior-cases.ts`,与 security:check 共享)
- Canary:**3**(A/B/C)——vitest 数据层(4 测试含泄漏)+ Playwright 页面层(6 = 3×2 projects)
- Next 版本:**15.5.20**
- 八项 Gate:lint / typecheck / test / build / smoke:mock / security:check(SSRF strict)/ test:e2e 全绿

## Audit(单独记录,不执行破坏性 force)

`pnpm audit`(全量):**10**(1 low / 5 moderate / 2 high / 2 critical)。critical/部分 high 均为
**dev/build/test 工具链**(vitest UI server、playwright、esbuild、postcss、@eslint/plugin-kit),非生产运行面。

`pnpm audit --prod`(生产依赖):**3** —

| 包 | 级别 | 链路 | 生产影响评估 |
|---|---|---|---|
| `playwright` | high | `.>next>@playwright/test>playwright` | 仅 Next 可选 testmode peer 引入;生产不运行 Playwright。不影响运行时。修复:`>=1.55.1`(测试 lane)。 |
| `drizzle-orm` | high(SQL 注入) | `.>drizzle-orm` | 本仓存储走 **better-sqlite3 参数化预编译语句**;drizzle 仅用于 schema 定义 + 迁移 DDL,**不经其查询构造器处理用户输入**,注入向量不可达。修复:`>=0.45.2`(Agent E lane,需兼容核验)。 |
| `postcss` | moderate(XSS) | `.>next>postcss` | Next 构建期 CSS 处理的传递依赖,**构建时**运行,非运行时处理用户输入。修复:`>=8.5.10`(需 Next 传递升级/override)。 |

以上均 **Round-3 范围外**(不属本轮五阻塞),不可达/不影响生产运行时,未 force 升级,列为后续按 lane 处理。

## 状态

- 真实 Provider 调用:0
- 真实 Diagnosis:0
- main:未改变
- 下一阶段:`READY_FOR_PROVIDER_CANARY`(**不是** `READY_FOR_REAL_SAMPLE`)
