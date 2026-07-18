# DELIVERY_BOARD

Supervisor 维护。每个 Agent 自报 PASS 不等于通过 — 只有 Supervisor 复核实际 diff、
重新运行测试、确认未越权修改、未提交敏感数据、未削弱不变量之后才更新本表状态为
`VERIFIED`。

基线：`764283b`（`main`），六项 Gate 全绿（typecheck / lint / test / build /
smoke:mock / security:check，Supervisor 实测）。共享锚点：`src/fixtures/sample-report.ts`。
全部 7 个 worktree 分支已 fast-forward 到该基线。

Round-2（本轮再派发 + 集成，2026-07-18）:

| Agent | 分支 | 状态 | 交付 | Supervisor 复核 |
|---|---|---|---|---|
| A 产品冻结 | `cursor/rebuild-product-contract` | INTEGRATED | docs/product ×2 + 需求追踪表 + OQ-1..8 | 所有权干净;OQ-1 已处置 |
| B 契约/Guard | `cursor/rebuild-contracts-guards` | INTEGRATED | 5 计算器 + Evidence/CrossField/CTA/publish Guard(54 测试) | 所有权干净;发现并修正 fixture §4 违规 |
| C 搜索/Evidence | `cursor/rebuild-search-evidence` | INTEGRATED | 博查Adapter + QueryPlanner + 归一化 + SSRF(~97 测试) | 所有权干净 |
| D DeepSeek/诊断 | `cursor/rebuild-diagnosis-engine` | INTEGRATED | DeepSeek Adapter + 阶段分析 + 报告组装(64 测试) | 所有权干净;score 接缝待换 B |
| E Runtime/API | `cursor/rebuild-runtime-api` | INTEGRATED | SQLite 存储 + 状态机 + API 路由(30 测试) | 所有权干净;扩展 StorageAdapter |
| F 前端/报告 | `cursor/rebuild-frontend-report` | INTEGRATED | PresentationService + Quick/Deep/Evidence 页面(43 测试) | 所有权干净;落地 e2e testid 契约 |
| G QA/CI | `cursor/rebuild-qa-ci` | INTEGRATED | 安全扫描 + e2e(门控) + CI + 全链 smoke(27 测试) | 所有权干净 |

状态取值：`DISPATCHED` → `CHECKPOINT_SUBMITTED` → `VERIFIED` → `INTEGRATED`。

## 集成结果（`integration/enterprise-diagnosis-rebuild` @ `443215a`）

7 个分支**零冲突**合入(严格文件所有权生效)。Supervisor 集成对齐:补全 smoke 的
StorageAdapter 到 E 的扩展接口、security-check 排除 Guard 定义层、测试重锚到修正后的
fixture(59.15→62.53 / coverage 1.0→0.85)。

**六项 Gate 全绿(Supervisor 实测)**:typecheck / lint / test **300** / build /
smoke:mock(7 步 mock 全链)/ security:check。构建路由:`/`、`/api/diagnoses`、
`/api/diagnoses/[id]`、`/report/[token]`。

Round-1 首次派发(同日更早)全 7 Agent 并行撞 session limit、带未提交改动被掐断,几乎
无落盘。本轮以「抗中断纪律」纠正,全部落盘且集成绿。

## Round-2 真实接缝焊接(已完成,`6976804`)

表单提交 → `POST /api/diagnoses` → 状态机(真实 C 搜索规划+证据归一化,真实 D 阶段分析+
报告组装,B 的 `publishGuard`)→ SQLite 存储 → `GET`/报告页(F)完整跑通,**Provider 层
全 mock**(无真实博查/DeepSeek、无网络、无真实 diagnosis)。前端不再自读 fixture。

**七项 Gate 全绿(Supervisor 实测)**:typecheck / lint / test **300** / build /
smoke:mock / security:check / **test:e2e 10**(mobile+desktop 真端到端)。远程
`origin/integration` HEAD 与本地一致。

## Round-3 Pre-Real-Sample Hardening(已完成)

基线 tag `rebuild-live-seams-v1` @ `b0e36dd`。5 个 Agent(H/I/J/K/L)并行交付并按
L→H→I→J→K→Supervisor 顺序集成。**Round-2 的 5 项待 review 全部被本轮解决:**

1. ✅ **支持等级评估归属** → Agent H:`assessSupport` 桩已删除。新增
   `CLAIM_EVIDENCE_VERIFICATION` 阶段 + `ClaimEvidenceRelation`;链路变为
   `C(来源属性)→ D(候选 Claim+Links)→ ClaimEvidenceVerifier(判语义支持)→ B(确定性 Guard)`。
   模型输出不再直接决定 READY;负面/缺失 Claim 需 EvidenceCoverage 测量边界。
2. ✅ **竞品名→域名解析** → Agent I:`CompetitorResolution`
   (USER_CONFIRMED/RESOLVED/AMBIGUOUS/NOT_FOUND/INVALID_DOMAIN);删除固定场景竞品域名;
   不拼接 `.com`;歧义不生成确定性差距;每个竞品状态可审计不静默丢弃。
3. ✅ **SSRF strict** → Agent J:grep 关键词 Gate 改为**真实行为测试**(52 对抗用例),
   默认 strict-on;并修复了一个真实 slowloris-body DoS 缺陷。
4. ✅ **OQ-1..8 文案** → Agent L:单一程序来源 `src/product/customer-copy.ts`;OQ-1 免责声明
   改全角逗号;OQ-4/5/6/8 标 `NEEDS_PRODUCT_OWNER_DECISION`(见 `REQUIREMENTS_TRACEABILITY.md`)。
5. ✅ **Next 升级** → Agent K:`15.3.1 → 15.5.20`(未上 16),清 CVE-2025-66478 等 24 项 Next 漏洞。

Supervisor 接缝:显式 **Provider Mode**(`mock` 注入场景 provider;`real` 抛错,本轮禁止真实调用);
3 个 Canary(A DIRECT / B 负面无 coverage 拒绝 / C 歧义竞品无差距)走完整链路。

**八项回归(Supervisor 实测)**:lint ✅ / typecheck ✅ / test ✅ **475** / build ✅ /
smoke:mock ✅ / security:check ✅(SSRF 行为 Gate strict-on)/ test:e2e ✅ **10** / audit(见下)。

## Round-3 待 review / 待办(等待人工验收,尚未 READY_FOR_REAL_SAMPLE)

1. **竞品解析状态可见性**:`CompanyProfile.competitors` 仍为 `string[]`,解析状态
   (RESOLVED/AMBIGUOUS/…)未落入 Canonical 报告或持久化,仅在 pipeline 内。若需对客/审计可见,
   需契约决策。
2. **OQ-4/5/6/8** 待产品负责人裁定(竞品占位显示、null 综合分首屏串、品牌名「凡间AI」、
   measurementStatusSummary 模板、两句提示共存规则)。
3. **`pnpm audit` 残留 10 项**:critical/high 均在 dev/build/test 工具链
   (vitest/playwright/esbuild/postcss/eslint-plugin-kit);另 `drizzle-orm` 一个 high
   SQL-injection(查询构造器,本仓存储走 better-sqlite3 参数化,drizzle 仅用于迁移 DDL)。
   均 Round-3 范围外,建议后续按 lane 升级。
4. **真实 Verifier / 真实 Provider** 仅实现接口,未激活(`PROVIDER_MODE=real` 抛错)。
5. 本轮**未合入 main**(按前文反复强调的约束);main 合并待人工明确授权。

下一阶段目标:`READY_FOR_PROVIDER_CANARY`(不是 `READY_FOR_REAL_SAMPLE`)。

## 抗中断纪律（每个 Agent 必须遵守）

1. 切片一绿立即本地 `commit`（先 typecheck+自身测试，再 commit），不攒大改动。
2. 只本地提交，**不 `push`**（远程推送由 Supervisor 审核后统一处理，仓库为 Public）。
3. Mock 接缝一律对着 `src/fixtures/sample-report.ts` 的 `SAMPLE_DIAGNOSIS_REPORT` 编码。
4. 严守 [AGENT_FILE_OWNERSHIP.md](AGENT_FILE_OWNERSHIP.md)，不碰他人目录与共享配置。

## 集成顺序

A → B → C → D → E → F → G，按依赖顺序合入 `integration/enterprise-diagnosis-rebuild`。
每次集成后运行：`pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm smoke:mock && pnpm security:check`，通过后立即 commit + push。

## Round-3 Pre-Real-Sample Hardening — 自主完成(Supervisor)

在 5 个 Agent(H/I/J/K/L)集成之上,Supervisor 自主完成:Provider Mode 正式化
(MOCK/REAL,REAL preflight 抛错不回退)、Coverage Context 扩展、负面 Claim 验证后剪枝
(`prune-claims.ts`)、公共边界防泄漏、3 条 Canary 走真实应用边界(vitest 数据层 +
Playwright 页面层 390px)、治理文档(新增 `CLAIM_EVIDENCE_VERIFICATION.md`、
`COMPETITOR_RESOLUTION.md`、`qa/ROUND_3_PRE_REAL_SAMPLE_HARDENING.md`、`qa/canaries/`)。

八项回归实测:lint / typecheck / test **484** / build / smoke:mock /
security:check(SSRF strict)/ test:e2e **16**(含 3 Canary)/ audit + audit --prod。
真实 Provider 调用 0、真实 Diagnosis 0、main 未改变。下一阶段仅 `READY_FOR_PROVIDER_CANARY`。

## 里程碑 Tag

- `rebuild-baseline-v0` — Supervisor 基线（已创建）
- `rebuild-vertical-slice-v1` — 第一轮 Mock Vertical Slice 全部 Gate 通过后
- `rebuild-live-seams-v1` — 真实接缝切片(Round-3 基线,`b0e36dd`)
- `rebuild-pre-real-sample-v1` — Round-3 真实样本前加固完成(指向最终 integration HEAD)
- `rebuild-provider-canary-v1` — Round-4B 真实 Provider Canary 双 PASS(`522d8c0`)
- `rebuild-technical-company-canary-v1` — Round-5 单企业真实诊断 PASS(integration `9777e7c`)
- `rebuild-chinese-conversion-hardening-v1` — Round-5.1 中文成交版硬化(分支最终 HEAD)
