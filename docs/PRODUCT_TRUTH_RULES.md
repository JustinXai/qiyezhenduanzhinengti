# PRODUCT_TRUTH_RULES — 真实性、证据与 AI 可见度契约

## 1. Evidence 来源类型

- `FIRST_PARTY_EVIDENCE`：企业官网、企业明确提供的资料。
- `OBSERVED_WEB_EVIDENCE`：本次博查真实搜索返回的公开内容。
- `COMPETITOR_WEB_EVIDENCE`：使用相同搜索口径获得的竞品公开内容。

## 2. Claim 类型

- `DIAGNOSTIC_INFERENCE`：基于 Evidence 形成的专业推断。
- `UNVERIFIED_HYPOTHESIS`：证据不足、需要企业确认的假设。

## 3. Evidence 支持等级

`DIRECT_SUPPORT` / `PARTIAL_SUPPORT` / `CONTEXT_ONLY` / `UNSUPPORTED`

## 4. 发布规则（由 Evidence Semantic Guard 强制，src/report/validation/，Agent B）

1. 核心问题至少需要 1 条 `DIRECT_SUPPORT`。
2. 优势至少需要 1 条 `DIRECT_SUPPORT`，或 2 条 `PARTIAL_SUPPORT`。
3. GEO 机会至少需要 1 条 `DIRECT_SUPPORT`，或 2 条 `PARTIAL_SUPPORT`。
4. `CONTEXT_ONLY` 不能单独支撑核心事实。
5. `UNSUPPORTED` 不能进入客户报告。
6. 所有 Evidence ID 必须存在（引用完整性）。
7. 不允许使用第一条 Evidence 自动补位（禁止 `array[0]` 兜底逻辑）。
8. 三个以上机会复用完全相同 Evidence 集合时阻止发布。
9. 系统抓取失败、Provider 失败、索引不足不能成为客户核心问题。
10. 证据不足时允许减少优势、问题和机会数量。
11. 不得固定数量强行填满。

## 5. 绝对禁止

把推断写成事实 / 虚构 URL / 虚构搜索量 / 虚构平台推荐率 / 虚构 AI 份额 /
把公开搜索称为多 AI 平台监测 / 把启发式评分包装成第三方认证 /
把弱第三方信息写成确定企业事实。

## 6. Evidence 清洗（Evidence View，Agent B + F）

发布前必须清除 URL 中的：username / password / fragment / token / signature /
credential / access_key / auth 参数。Evidence Drawer 默认折叠，展示：标题、来源域名、
来源类型、权威等级、支持等级、获取时间、摘要、清洗后的原始链接。

## 7. 评分契约

见 [docs/SCORE_CONTRACT.md](SCORE_CONTRACT.md)。

## 8. AI 可见度单一事实源

AI 可见度只能来自 `aiVisibilityTests`。模型不得自由生成 AI 可见度分数、理由、提及次数、
推荐率、CTA。

测试状态：`VALID` / `INSUFFICIENT_EVIDENCE` / `PROVIDER_FAILED`。

有效测试少于 3 项时：`aiVisibility.score = null`，`confidence` 不高于 0.40。

达到 3 项后按程序计算（禁止 LLM 自由解释分数）：

- 品牌提及率：50%
- 回答准确度：30%（`ACCURATE=100 / PARTIAL=60 / INACCURATE=0 / 未提及=0`）
- 推荐强度：20%（`STRONG=100 / MODERATE=60 / WEAK=25 / NONE=0`）

理由必须由程序根据真实计数生成。

V1 允许使用当前配置的 DeepSeek 模型完成有限 AI 问答样本，但必须明确：这是当前模型、
当前时间、当前问题集的诊断样本；不是多平台市场份额；不是豆包、元宝、Kimi 等平台监测；
不代表全网 AI 推荐率。Quick 最多展示 2 个 VALID 测试，优先级：购买决策问题 > 竞品比较
问题 > 品牌直接问题 > 其他问题。不得把 `INSUFFICIENT_EVIDENCE` / `PROVIDER_FAILED`
展示为冲击案例。

## 9. 文案禁用词（Agent G 建立扫描）

提升AI推荐概率 / 显著提升 / 保证提升 / 转化为实际商机 / 快速获得客户 / 保证排名 /
保证流量 / 保证线索 / 保证收入 / 不优化就会失去市场 / 竞品正在抢走你的客户。
