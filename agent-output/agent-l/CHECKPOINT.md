# READY_FOR_PRODUCT_COPY_INTEGRATION

Agent L — 产品公开文案冻结（product-copy-freeze）
分支 `cursor/product-copy-freeze` / worktree `E:\企业诊断智能体_worktrees\product-copy-freeze`
基线 `b0e36dd`。轮次：Round-3。日期：2026-07-18。

## Gate 结果（切片绿）

- `pnpm typecheck`：**PASS**（tsc --noEmit 无错）
- `pnpm test`（vitest）：**PASS** — 29 files / 350 tests（基线 300 + 新增 50）
- `pnpm security:check`（Agent G 门禁）：**OK** — 150 tracked files，无 secret、无 banned-copy；
  SSRF 一项为**既有 WARNING**（Agent C crawler token，非致命、非本 Agent 引入）
- 工作区干净，两个 slice 已 push。

## 做了什么

1. **新建唯一程序来源 `src/product/customer-copy.ts`** — 客户可见冻结文案的单一常量文件：
   主/次 CTA、CTA 说明段落、30 分钟三点（含「凡间AI」逐字）、综合分命名「GEO可见度基础指数」+
   禁用别名、demonstrationFix 免责声明（经 `.value` 再导出）、竞品证据不足占位、评分覆盖度两句
   提示、AI 样本四事实免责说明、11 条禁用营销词、三阶段路线图阶段名。
2. **OQ-1 直接裁定落地**：`src/contracts/index.ts` 的 `DemonstrationFix.disclaimer` `z.literal`
   逗号由半角 `U+002C` 改为**全角 `U+FF0C`**（仅此一处），与 `REPORT_CONTRACT.md` §5 对齐；
   fixture 经 `.value` 自动跟随。
3. **统一客户可见中文标点为全角**（，。；、：），与冻结「复制粘贴源」逐字一致。
4. **消除重复、改引用单一来源**：`cta-guard.ts`、`components/report/{cta-section,quick-report,
   labels,roadmap,ai-test-card}` 全部从 `src/product` import，不再各自硬编码。
5. **文档由程序常量生成测试**：`tests/product/customer-copy.test.ts`（50 tests）锁定
   「文档↔常量逐字一致 / 全角标点 / AI 四事实覆盖 / 消费方零重打」。
6. 更新 `docs/product/CTA_AND_DISCLAIMER_STRINGS.md`、`docs/REQUIREMENTS_TRACEABILITY.md`、
   `docs/PROJECT_FREEZE.md`：标注单一来源、全角裁定、OQ-1 解决、Agent L 逐项裁定表。

## 文件清单

| 文件 | 动作 |
|---|---|
| `src/product/customer-copy.ts` | 新建（唯一程序来源） |
| `tests/product/customer-copy.test.ts` | 新建（doc↔code / 标点 / 四事实 / 零重打） |
| `src/contracts/index.ts` | 改（OQ-1：z.literal 逗号→全角，仅此一处；例外授权范围内） |
| `src/report/validation/cta-guard.ts` | 改引用（CTA 标签 + BANNED_PHRASES 来自 src/product） |
| `components/report/cta-section.tsx` | 改引用（CTA 全部 import） |
| `components/report/quick-report.tsx` | 改引用（首屏主 CTA 用常量） |
| `components/report/labels.ts` | 改引用（OVERALL_SCORE_LABEL 再导出自 src/product） |
| `components/report/roadmap.tsx` | 改引用（阶段名来自 ROADMAP_PHASE_GOALS） |
| `components/report/ai-test-card.tsx` | 改引用（AI 免责说明来自 AI_SAMPLE_DISCLAIMER） |
| `tests/security/banned-copy.test.ts` | 改（断言 `.value` 而非重打半角字面量；随 OQ-1 自动跟随）— **跨 Agent（G）接缝** |
| `docs/product/CTA_AND_DISCLAIMER_STRINGS.md` | 改（单一来源note + §5 OQ-1 解决） |
| `docs/REQUIREMENTS_TRACEABILITY.md` | 改（OQ-1 标记已裁定 + Agent L 裁定表） |
| `docs/PROJECT_FREEZE.md` | 改（客户可见文案单一来源 + 全角标点小节） |
| `agent-output/agent-l/CHECKPOINT.md` | 新建（本文件） |

未触碰：`.env`、`src/report/presentation/*`（Agent F）、`tests/fixtures/banned-terms.ts`（G）、
`scripts/security-check.ts`（G）、`src/contracts/index.ts` 除 OQ-1 一处外的任何内容。

## Commits（已 push origin cursor/product-copy-freeze）

- `844c25f` feat(product): single-source customer copy + OQ-1 full-width disclaimer
- `5776231` docs(product): freeze customer-copy single source + OQ-1..8 ruling table
- （本 CHECKPOINT 提交见下一个 commit）

## OQ-1..8 逐项裁定表

| 编号 | 裁定 | 结论 / 落地 |
|---|---|---|
| **OQ-1** | ✅ 已裁定（全角 `U+FF0C`） | index.ts z.literal 已全角；src/product 经 `.value` 再导出；fixture/组件/守卫/测试全部跟随。运行时权威 = Zod 字面量。 |
| **OQ-2** | ➖ 无文案影响 | GEO 机会「3–5 vs 不强填」是数量/生成逻辑（D/F/B），非公开文案；临时口径「≤5 且不强填」维持。 |
| **OQ-3** | ➖ 无文案影响 | 竞品 Evidence 支持门槛是 B 的语义守卫阈值；§6 占位文案已冻结集中。 |
| **OQ-4** | ⚠️ NEEDS_PRODUCT_OWNER_DECISION | 「完全未提交竞品」时隐藏模块 vs 显示 F 现有「本次未提供竞品，暂不做竞品比较。」——不同客户可见行为，待定。§6「已收到竞品输入…」占位仅适用「有输入但证据不足」，已冻结。 |
| **OQ-5** | ⚠️ NEEDS_PRODUCT_OWNER_DECISION | `overallScore=null` 首屏展示串未冻结。现状临时串「覆盖不足，暂不评分」（可读、绝不显示 0，非 UNKNOWN）；属测量免责/评分命名商业含义，Agent L 不定稿。 |
| **OQ-6** | ⚠️ NEEDS_PRODUCT_OWNER_DECISION | 品牌名「凡间AI」是否最终对客名。已逐字保留并集中到 src/product（未来改名只改一处）。 |
| **OQ-7** | 🟡 部分冻结 | §7 两句提示语已冻结集中（SCORE_HINT_*）；`measurementStatusSummary` 汇总模板 = F 运行时逻辑 + 待产品定稿。 |
| **OQ-8** | ⚠️ NEEDS_PRODUCT_OWNER_DECISION | 两句 §7 提示共存显示规则未定；两句串已冻结集中；临时口径（都显示）维持。 |

## NEEDS_PRODUCT_OWNER_DECISION 汇总（不得用 UNKNOWN 文案进入客户报告）

1. **OQ-4** 竞品「完全未提交」的展示行为（隐藏 vs「未提供竞品」文案）。若选文案，需把该串纳入 src/product 冻结。
2. **OQ-5** 综合分 null 态首屏展示串定稿（现为临时「覆盖不足，暂不评分」）。定稿后集中到 src/product 并按全角冻结。
3. **OQ-6** 服务方对客品牌名「凡间AI」是否最终。
4. **OQ-7** `measurementStatusSummary` 汇总模板定稿。
5. **OQ-8** 全 ESTIMATED 与存在未测得两句共存显示规则。

> 以上均涉及商业含义（CTA 承诺 / 评分命名 / 测量免责 / 品牌名 / AI 平台覆盖），Agent L 未自行决定。

## 与其他 Agent 的接缝

- **Agent B（cta-guard）**：`PRIMARY_CTA_LABEL` / `SECONDARY_CTA_LABEL` / `BANNED_PHRASES`
  现从 `src/product/customer-copy.ts` 取值并**再导出**，外部 import 路径与名称不变（零破坏）。
- **Agent F（components + presentation）**：
  - 组件已全部改引用 src/product（本 Agent 已完成）。
  - **presentation-service（F 所有）仍本地定义** `COMPETITOR_INSUFFICIENT_EVIDENCE_REASON`
    等（半角逗号）。建议 F 改为 import `COMPETITOR_INSUFFICIENT_EVIDENCE`（全角）以收敛单一来源；
    在 F 收敛前，运行时竞品占位由 F 的串渲染（半角），与本 Agent 全角常量不一致——**待 F 对齐**。
  - `SCORE_HINT_*`、`AI_SAMPLE_DISCLAIMER` 等若 F/ D 运行时需用，也应 import 自 src/product。
- **Agent G（qa-ci）**：
  - `tests/security/banned-copy.test.ts:116` 已由本 Agent 改为断言 `DemonstrationFix.shape.
    disclaimer.value`（原为重打半角字面量，OQ-1 后必失败）——**已代为修复，请 G 复核**。
  - `tests/fixtures/banned-terms.ts` 与 `scripts/security-check.ts` 仍各自持有禁用词/别名清单
    （G 所有，本 Agent 未改）。建议 G 后续 import 自 `src/product`（BANNED_MARKETING_PHRASES /
    BANNED_SCORE_ALIASES）以彻底单一来源。
  - `src/product/customer-copy.ts` 的禁用词/别名定义行已加 `security-check:allow` 标记，
    Agent G 的 banned-copy 扫描已放行（同 cta-guard.ts 的按路径豁免）。G 亦可改为在
    `BANNED_COPY_EXCLUDED_PREFIXES` 增加 `src/product/` 整体豁免。
- **src/contracts/index.ts（Supervisor 独占）**：仅 OQ-1 一处逗号改动（授权范围内），其余未动。

## 纪律确认

不调用真实博查/DeepSeek；未设 `DIAGNOSIS_SMOKE_MODE=false`；未改 `.env`；未合 main；
未提交敏感文件；小步 commit + 每切片绿即 push；工作区干净。
