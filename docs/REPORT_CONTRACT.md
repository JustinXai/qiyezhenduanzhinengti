# REPORT_CONTRACT — Quick / Deep / Evidence 冻结结构

> **Round-3**:负面/缺失型核心问题需 EvidenceCoverage 测量边界 + 限定范围文案
> (「本次已检查的公开页面和搜索结果中未发现……」);无 coverage 则验证后移除、不进
> Quick 核心问题。见 [CLAIM_EVIDENCE_VERIFICATION.md](CLAIM_EVIDENCE_VERIFICATION.md) §6。

默认视图：**Quick**。目标：2–3 分钟，约 1800 个中文可见字符以内，手机优先。

## Quick（固定 8 模块）

### 1. 首屏决策摘要

必须包含：品牌名称、报告日期、一句话企业特定结论、**GEO可见度基础指数**、
`scoreCoverage`、`measurementStatus` 摘要、主 CTA、完整诊断入口。已有优势、最优先问题、
最优先机会仅在各自通过发布 Guard 时显示；不足时隐藏，不得补齐。首屏约 1.5 个手机屏内
必须看到 CTA。

综合分统一命名 **GEO可见度基础指数**。不得命名为：AI排名 / AI推荐分 / AI平台排名 /
企业经营分 / 市场权威指数。

### 2. AI 现在怎么谈论企业

最多展示 2 个 VALID 测试。必须明确这是当前模型/时间/问题集的诊断样本，不是多平台市场
份额监测。规则详见 [PRODUCT_TRUTH_RULES.md](PRODUCT_TRUTH_RULES.md) §8。

### 3. 竞品差距

仅在满足以下条件时显示：用户输入竞品 / 竞品被 Query Plan 处理 / 竞品有足够 Evidence /
差距与真实购买决策问题有关 / Evidence 达到语义支持要求。证据不足时不展示空表格，显示：
"已收到竞品输入，但本次公开证据不足，暂不做确定性比较。"

### 4. 三个核心问题

每个只显示：当前发现、Evidence 标签、具体业务场景影响、修复方向。每项约 120 字以内。
不得公开完整页面规格、全部交付物、全部材料清单、人员工时、详细验收、完整 SOW。

进入 Quick 的每个核心问题必须至少有 1 条逐 Claim–Evidence 关系验证的
`DIRECT_SUPPORT`。两条或更多 `PARTIAL_SUPPORT` 不能自动升级为 Quick 核心问题；
`CONTEXT_ONLY` 不能单独支撑问题。没有可信核心问题时本模块隐藏，允许数量为 0。

### 5. 示范修复（demonstrationFix）

允许类型：`ENTITY_DESCRIPTION` / `FAQ_EXAMPLE` / `BEFORE_AFTER_STRUCTURE`。必须包含：
当前问题、建议资产类型、修复前表现、修复后结构示意、为什么更利于客户和 AI 理解、
客户需要确认什么、GEO 团队可以交付什么、Evidence 标签、固定免责声明：

> "示范内容仅用于展示优化方向，正式发布前需结合企业真实材料确认。"

不得虚构客户名称/案例/产品参数/资质/业绩/合作品牌/效果承诺。**Evidence 不足时
`demonstrationFix = null`，模块隐藏，不得为了模块完整强行生成。**

### 6. Top 3 GEO 机会

每项只显示：客户正在问什么、企业为什么有资格回答、当前内容空位、对应业务场景、
Evidence 标签。可信机会不足 3 项时展示实际数量，不得补满。

### 7. 三阶段路线图

阶段一：统一品牌与业务表达。阶段二：覆盖高意向客户问题。阶段三：持续测试和更新。
客户版只展示阶段目标和预期结果，不展示详细每周任务、人员工时、完整材料清单、报价、
完整验收标准、付费 SOW。

### 8. CTA

主 CTA 固定：**预约报告解读**。次 CTA 固定：**获取企业GEO优化方案**。

说明固定为：

> "我们将结合本报告与您的实际业务，进一步核验关键问题，并明确可实施的官网内容、
> 客户问题覆盖、品牌知识和持续监测方案。"

30 分钟解读会说明：1）核验报告中的关键结论是否符合企业实际；2）确定最值得优先处理的
3 件事；3）明确企业需提供什么、凡间AI可以交付什么，以及如何验收。

禁用文案见 [PRODUCT_TRUTH_RULES.md](PRODUCT_TRUTH_RULES.md) §9。

## Deep View

允许展示：完整企业画像、待确认信息、五项评分、`score`、`confidence`、
`measurementStatus`、`scoreCoverage`、全部 VALID AI 测试、全部可信优势、全部可信核心
问题、证据充分的次要发现、条件性竞品分析、3–5 个可信 GEO 机会、测量说明、Evidence
附件。

**仍不得展示**：完整 30 天 SOW、报价、销售异议脚本、内部主攻问题、完整内容建设规格、
Provider 调用细节、Checkpoint、联系人和手机号。

只有 `PARTIAL_SUPPORT` 的负面/缺失型观察不得列入 Deep 的确定性核心问题；如保留在
“待确认信息”，必须同时明确“待进一步确认”“仅限本次保存的公开证据范围”和
“不作为确定性结论”。`CONTEXT_ONLY` 观察不得作为问题结论展示。

## Evidence View

见 [PRODUCT_TRUTH_RULES.md](PRODUCT_TRUTH_RULES.md) §6。


## Round-5.1 中文语言契约

公开报告语言冻结 zh-CN;测量构成(实测/公开网页估算)必须与覆盖率同屏展示;
Quick 模块动态渲染(空模块省略、编号连续、标题随实际数量)。详见
[CHINESE_REPORT_CONTRACT.md](CHINESE_REPORT_CONTRACT.md)。
