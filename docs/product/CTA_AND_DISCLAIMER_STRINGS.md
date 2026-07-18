# CTA_AND_DISCLAIMER_STRINGS — 冻结文案原文（供各 Agent 直接复用，禁止改写）

本文件只做「复制粘贴源」，不重复解释规则。规则见 `docs/REPORT_CONTRACT.md` 第 8 节、
`docs/SCORE_CONTRACT.md`、`docs/PRODUCT_TRUTH_RULES.md`。

字符必须逐字复制（包括全角/半角标点），不得凭记忆重打。使用者：Agent D（生成阶段写入
report 字段/常量）、Agent F（渲染层）、Agent B（Guard 校验字面量）、Agent G（禁用词/一致性
扫描）。

> **单一程序来源（Agent L，2026-07-18）**：本文件所列客户可见文案已集中到唯一程序常量
> 文件 `src/product/customer-copy.ts`。守卫（`src/report/validation/cta-guard.ts`）与
> 报告组件（`components/report/*`）均从该文件 import，不再各自硬编码。
> `tests/product/customer-copy.test.ts` 逐字（去空白）校验「本文档 ↔ 程序常量」一致，
> 任一方漂移即测试失败。**标点裁定**：客户可见中文文案统一使用**全角中文标点**
> （，。；、：），与本文件逐字一致（含 OQ-1，见 §5）。

## 1. 主 / 次 CTA（REPORT_CONTRACT.md §8）

- 主 CTA：`预约报告解读`
- 次 CTA：`获取企业GEO优化方案`

## 2. CTA 说明段落（REPORT_CONTRACT.md §8，逐字）

```
我们将结合本报告与您的实际业务，进一步核验关键问题，并明确可实施的官网内容、
客户问题覆盖、品牌知识和持续监测方案。
```

（原文档中此段落跨两行书写，实际渲染时应作为一个连续段落，不含换行符。）

## 3. 30 分钟解读会说明（REPORT_CONTRACT.md §8，逐字，含全角括号数字编号）

```
30 分钟解读会说明：1）核验报告中的关键结论是否符合企业实际；2）确定最值得优先处理的
3 件事；3）明确企业需提供什么、凡间AI可以交付什么，以及如何验收。
```

编号使用的是全角括号数字「1）2）3）」，不是「(1)」或「1.」。

> **注意（品牌名）**：本段含服务方品牌名「凡间AI」。该名称目前仅出现在
> `docs/REPORT_CONTRACT.md` §8 与 `docs/PROJECT_FREEZE.md`，尚未在 `AGENTS.md` 冻结索引中
> 确认为最终对客品牌名，见 `docs/REQUIREMENTS_TRACEABILITY.md` OQ-6。在 Supervisor 裁定前，
> 抄写本段必须保留「凡间AI」原字，不得改写为「GEO 团队」或其他称谓。

## 4. 综合分名称（REPORT_CONTRACT.md §1）

- 固定命名：`GEO可见度基础指数`
- 禁止使用的替代名称（不得出现在任何客户可见文案中）：
  - `AI排名`
  - `AI推荐分`
  - `AI平台排名`
  - `企业经营分`
  - `市场权威指数`

## 5. demonstrationFix 固定免责声明 — ✅ OQ-1 已裁定为全角

**权威字面量（全角逗号 U+FF0C，逐字）：**

```
示范内容仅用于展示优化方向，正式发布前需结合企业真实材料确认。
```

**OQ-1 裁定（Agent L，2026-07-18）**：逗号统一为**全角 `U+FF0C`**。落地：
`src/contracts/index.ts` 的 `DemonstrationFix.disclaimer` `z.literal(...)` 已改为全角，
与 `docs/REPORT_CONTRACT.md` §5 逐字对齐。此前 `index.ts` 为半角 `U+002C` 的历史不一致
已消除。

**实现规则（唯一正确写法）**：运行时代码与测试**不得手打**这段中文，一律复用
Zod 字面量 `DemonstrationFix.shape.disclaimer.value`（`src/product/customer-copy.ts` 以
`DEMONSTRATION_FIX_DISCLAIMER` 名再导出该值）。`src/fixtures/sample-report.ts`
（`FROZEN_DEMO_DISCLAIMER`）与 `tests/security/banned-copy.test.ts` 均已采用此写法，
故随 `z.literal` 全角化自动跟随，永远逐字节一致。

## 6. 竞品差距证据不足占位文案（REPORT_CONTRACT.md §3，逐字）

```
已收到竞品输入，但本次公开证据不足，暂不做确定性比较。
```

注意：此文案假设用户已经提交过竞品名称。用户完全未填写竞品时是否仍显示此文案，
是否应改为直接隐藏模块，属于未冻结事项，见 OQ-4。

## 7. 评分覆盖度提示语（SCORE_CONTRACT.md「综合分规则」，逐字）

全部维度均为 `ESTIMATED` 时：

```
本次结果主要基于公开网络信息估算。
```

存在未测得维度（`INSUFFICIENT_EVIDENCE` / `PROVIDER_FAILED`）时：

```
部分维度暂未测得。
```

两种状态同时出现时应显示什么尚未冻结，见 OQ-8。

## 8. AI 可见度样本免责说明（PRODUCT_TRUTH_RULES.md §8，要点，非逐字模板）

冻结文档没有给出这段说明的最终客户文案模板，只规定了**必须传达的四个事实**，Agent F /
Agent D 撰写具体文案时必须逐一覆盖，不得省略：

1. 这是当前模型、当前时间、当前问题集的诊断样本；
2. 不是多平台市场份额监测；
3. 不是豆包、元宝、Kimi 等平台监测；
4. 不代表全网 AI 推荐率。

## 9. 文案禁用词列表（PRODUCT_TRUTH_RULES.md §9，逐字，供 Agent G 扫描器直接使用）

```
提升AI推荐概率
显著提升
保证提升
转化为实际商机
快速获得客户
保证排名
保证流量
保证线索
保证收入
不优化就会失去市场
竞品正在抢走你的客户
```

## 10. 三阶段路线图固定阶段名（REPORT_CONTRACT.md §7，逐字）

- 阶段一：`统一品牌与业务表达`
- 阶段二：`覆盖高意向客户问题`
- 阶段三：`持续测试和更新`
