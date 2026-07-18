# Round-3 Mock Canary 运行摘要(脱敏)

> Mock Provider 运行,零真实网络、零真实 Provider、零真实 Diagnosis。不含真实 Token 或数据库。
> 场景经测试专用配置注入(`CANARY_MODE=1` + 保留域名 / 竞品输入),不经公开 API。
> 数据层断言:`tests/canary/pre-real-sample-canary.test.ts`;页面层(390px):`tests/e2e/canary.spec.ts`。

链路:`POST /api/diagnoses → 状态机 → 竞品解析 → Evidence → Claim → CLAIM_EVIDENCE_VERIFICATION → Publish Guard → Storage → GET → /report/[token] → Quick/Deep/Evidence`。Provider Mode = MOCK,真实网络调用 = 0。

## Canary A — 正面直接支持

- 输入:普通企业(工业自动化设备),用户确认竞品。
- 预期 & 观察:产品能力 Claim 存在;对应关系 `DIRECT_SUPPORT`,`verifierMode=MOCK_DETERMINISTIC`,evidenceId 真实存在;报告 READY;Quick 展示优势/结论;Quick/Deep 同源、Evidence id 一致;Quick 字符 ≤ 1800。**非因"首方来源"自动 DIRECT,而因正文内容匹配。**

## Canary B — 负面缺失 Claim 受限

- 输入:仅 About 页可发现(保留域名 `about-only.canary.test`,空检索计划)。系统试图生成「官网缺少面向采购决策的验收说明」。
- 预期 & 观察:About 页不能支持该负面 Claim(无测量边界 → CONTEXT_ONLY);该 Claim **验证后被剪枝**,不进入 Quick 核心问题、不作为销售焦虑文案;一条内容支持的 About 优势存活,报告仍 READY;页面无「缺少面向采购决策的验收说明」字样;Public API 不泄漏 Verifier 拒绝详情。

## Canary C — 竞品歧义

- 输入:竞品名「星辰科技」(同名歧义 fixture)。
- 预期 & 观察:`CompetitorResolution=AMBIGUOUS`;不生成确定性竞品差距(`competitorGaps=[]`);不猜测域名;不静默丢弃;Quick 模块 3 展示克制说明「证据不足」;其它模块可信 → 报告 READY。

## 每条 Canary 均验证

Diagnosis 最终状态 READY · 状态链含 `CLAIM_EVIDENCE_VERIFICATION` · Provider Mode=MOCK · 真实网络=0 · ClaimEvidenceRelation 数量与 DIRECT/PARTIAL/CONTEXT/UNSUPPORTED 分布 · Quick 字符量 · Quick 核心问题 · 竞品显示状态 · Demonstration Fix 显/隐 · Public API 边界无泄漏 · 390px 页面 · Quick/Deep Evidence id 一致 · CTA 无禁用词。
