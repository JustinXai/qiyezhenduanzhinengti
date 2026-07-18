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

## 待 review 决策(等待人工验收)

1. **支持等级评估归属(重要)**:C 的 `normalizeEvidence` 保守输出 `CONTEXT_ONLY`,B §4 要求
   claim 引 `DIRECT_SUPPORT`。当前 C/D 代码无人负责"按 claim 判定支持等级"。本轮由
   `live-seams.ts` 的 `assessSupport` 桩代之(首方/竞品自有页判 DIRECT)。**是否应下沉到
   Agent D 的分析阶段(由 DeepSeek 评估)?**
2. **竞品名→域名解析**(C 遗留①):`CompanyProfile` 只有竞品名;本轮 EvidencePipeline 用
   固定场景域名。真实样本前需补名→域名解析。
3. **SSRF strict**:G 的 token 词表与 C 的数值 IP 实现未对齐;对齐后开 `SECURITY_CHECK_SSRF_STRICT=1`。
4. **OQ-1..8** 产品文案裁定(免责声明标点等,见 `docs/REQUIREMENTS_TRACEABILITY.md`)。
5. **升级 `next@15.3.1`**(CVE-2025-66478)。
6. 本轮**未合入 main**(按指令);integration 分支为当前有效交付。

## 抗中断纪律（每个 Agent 必须遵守）

1. 切片一绿立即本地 `commit`（先 typecheck+自身测试，再 commit），不攒大改动。
2. 只本地提交，**不 `push`**（远程推送由 Supervisor 审核后统一处理，仓库为 Public）。
3. Mock 接缝一律对着 `src/fixtures/sample-report.ts` 的 `SAMPLE_DIAGNOSIS_REPORT` 编码。
4. 严守 [AGENT_FILE_OWNERSHIP.md](AGENT_FILE_OWNERSHIP.md)，不碰他人目录与共享配置。

## 集成顺序

A → B → C → D → E → F → G，按依赖顺序合入 `integration/enterprise-diagnosis-rebuild`。
每次集成后运行：`pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm smoke:mock && pnpm security:check`，通过后立即 commit + push。

## 里程碑 Tag

- `rebuild-baseline-v0` — Supervisor 基线（已创建）
- `rebuild-vertical-slice-v1` — 第一轮 Mock Vertical Slice 全部 Gate 通过后
