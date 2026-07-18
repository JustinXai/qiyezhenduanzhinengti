# Agent F — CHECKPOINT (Round-1)

分支：`cursor/rebuild-frontend-report`（基线 `31972e3`）
状态：**本地已 commit，未 push**（按纪律绝不 push）

## 1. 交付物与文件清单

### Presentation service（选择逻辑唯一归属地，纯函数）
- `src/report/presentation/report-presentation-service.ts`
  — `presentReport` / `toQuickReportViewModel` / `toDeepReportViewModel` /
  `toEvidenceViewModel`
- `src/report/presentation/evidence-url.ts` — `sanitizeEvidenceUrl`（§6 链接脱敏）
- `src/report/presentation/index.ts` — 对外 barrel

### 页面（非 API）
- `app/report/[token]/page.tsx` — Server Component，投影样例报告 → 渲染体验
- `app/page.tsx` — 首页加“查看示例诊断报告”入口

### 复用组件（`components/report/`）
- `report-experience.tsx`（`"use client"`，Quick/Deep/Evidence tab 切换）
- `quick-report.tsx`（Quick 8 模块）、`deep-report.tsx`、`evidence-view.tsx`
- `section.tsx`、`badges.tsx`（含 `EvidenceTag` 证据标签）、`score-card.tsx`
  （`ScoreHeadline` + `ScoreBreakdown`）、`claim-card.tsx`（优势/问题/机会卡）、
  `ai-test-card.tsx`、`demonstration-fix.tsx`、`roadmap.tsx`、`cta-section.tsx`、
  `evidence-list.tsx`、`labels.ts`（枚举→中文 + 格式化）

### 测试
- `tests/report-presentation/report-presentation-service.test.ts`（22）
- `tests/report-presentation/evidence-url.test.ts`（6）
- `tests/report-presentation/forbidden-copy.ts`（§9 禁用词清单，供自查）
- `tests/ui/report-render.test.ts`（15，`renderToStaticMarkup` 静态断言）

## 2. Commit 哈希（基线 → HEAD）
- `e810511` feat(presentation): ReportPresentationService → Quick/Deep/Evidence VM
- `220ed17` feat(report-ui): Quick/Deep/Evidence 报告页 + tab 体验
- `918dbb9` feat(home): 样例报告入口链接

## 3. Gate 结果（HEAD）
- `pnpm typecheck`：**PASS**（tsc --noEmit 无错）
- `pnpm vitest run`：**PASS** — 4 文件 / 44 用例全绿
  （新增 43：presentation 28 + ui 15；含既有 contracts 1）
- `pnpm build`：**PASS** — `/report/[token]` 动态路由构建成功，lint 无错
- 浏览器实测：Quick/Deep/Evidence 三视图渲染正确，tab 切换为纯客户端状态
  （无重新请求 / 不重算分数 / 不触发新任务）

## 4. 与 Agent E 的数据源接缝（关键）
- 唯一数据入口在 `app/report/[token]/page.tsx` 的 `loadReport(token)`，已用
  `// INTEGRATION SEAM (Agent E API)` 标注。
- 本轮：`loadReport` 返回共享 `SAMPLE_DIAGNOSIS_REPORT`（`src/fixtures`，只读引用），
  经 `presentReport` 投影后渲染。**E 接入时只需把 `loadReport` 换成按 `publicToken`
  的 StorageAdapter / API 查询，其余组件零改动**（它们只消费 view model）。
- 已按 Agent G 的 e2e 契约落地 DOM 钩子：
  `data-testid="quick-module-1..8"`（模块编号固定，`quick-module-5` 示范修复为
  null 时整块隐藏且编号不复用）、`primary-cta`、`secondary-cta`、`geo-index`。
- 关于 `DIAGNOSIS_SMOKE_MODE`：本轮页面在任何情况下都以样例经 service 渲染，
  已满足 G“真时用 SAMPLE 渲染”的约定；接入 E 后保留该 smoke 分支即可。

## 5. 关键实现约束（对齐 ARCHITECTURE “禁止”清单）
- 选择逻辑全部在 service，渲染层零选择：
  - `topStrength/topIssue/topOpportunity` 按（claimType → DIRECT_SUPPORT 数 →
    PARTIAL_SUPPORT 数 → 证据总数 → 原序）稳定排序，**非 `array[0]`**（有专测）。
  - Quick 最多 2 个 `VALID` AI 测试，按 采购决策>竞品比较>品牌直接>其他 优先级。
  - 竞品差距条件可用：竞品有输入且 gap 有 DIRECT/PARTIAL 证据支撑才 `available:true`；
    否则 `{available:false, reason}`（证据不足用 §3 冻结文案；未提供竞品另有文案）。
  - `coreIssues`/`geoOpportunities` 上限裁剪（Quick 3 / Deep 机会 5），不足不补满。
  - `demonstrationFix=null` → Quick 模块整块隐藏。
- 分数不重算、AI 测试不重解释；Quick 与 Deep 用同一 `scores`/证据。
- 文案：主/次 CTA、CTA 说明、30 分钟三点、路线图目标均逐字来自 REPORT_CONTRACT；
  免责声明直接渲染 Canonical 值（`demonstrationFix.disclaimer`，与 contracts 的 Zod
  literal 字节一致，未二次手打）；`GEO可见度基础指数` 命名到位，无禁用别名/禁用词
  （有自查测试）。
- Evidence 链接经 `sanitizeEvidenceUrl` 脱敏（去凭据/fragment/token/signature/
  access_key/auth 等），Drawer 用原生 `<details>` 默认折叠（零客户端 JS）。

## 6. 假设
- 报告日期取 `generatedAt`，展示层格式化为 `YYYY-MM-DD`（UTC）。
- `headlineConclusion` / `measurementStatusSummary` / Deep `measurementNotes`
  由 service 依据既有数据确定性拼装，不引入新事实、不含承诺性措辞。
- `authorityLevel` 为自由字符串（契约如此），Evidence 直接展示原值（如 `OWNED`/
  `MEDIA`）；如需中文映射需产品侧给出枚举，届时加 label。
- Deep 的 AI 测试按契约只展示 `VALID`；被排除数量在“测量说明”中说明。

## 7. 遗留 / 待后续
- CTA 按钮为展示态，未接线（预约/获取方案的落地端点属 Agent E，接缝注释已就位）。
- `tests/ui` 用 `renderToStaticMarkup` 做静态断言（node 环境、classic JSX runtime，
  测试内以 `globalThis.React` 兜底）；交互态（点击切 tab）已由浏览器实测覆盖，
  自动化交互测试需 `@testing-library/react`+`jsdom`（见 DEPENDENCIES.md，未申请）。
- Quick 可见字符已控制在移动优先、约 1800 中文字符量级；如产品要更严格计数，可加
  一个字符预算测试。
- 无新增依赖（见 `agent-output/agent-f/DEPENDENCIES.md`）。
