# Round-5.2C Frozen-Evidence Reanalysis — Execution Record

## Final status

`PASS_WITH_PRODUCT_YIELD_BLOCKER`

Strict Checkpoint Resume 仍因历史 query plan 与 competitor resolution hash 不可验证而阻塞。
本轮使用独立、显式的 `FROZEN_EVIDENCE_REANALYSIS`，没有伪装为 strict resume，也没有
合成两个缺失 hash。

## One-shot execution

- Diagnosis：`diag_d9d81ba3428f4696b088870ca7416e49`
- Repair Attempt：1（唯一）
- 原失败：`REPORT_CLAIMS_FAILED`，失败摘要与 run-lock 未修改
- Snapshot：22 条冻结 Evidence；registry `9b4ca22d…`；normalized `b55c9c77…`
- Recovery stages：Profile、Scoring、AI Visibility、Claims，全部 `SUCCEEDED`
- Provider delta：Bocha 0 / Crawler 0 / DeepSeek 4 / retries 0
- Finalizer：Canonical、Claim–Evidence verifier、Publish Guard、中文 Guard、
  Frozen-Evidence Guard 全部通过；同一 Diagnosis 转为 `READY`

真实 Recovery 仅执行一次。首次后置 UI 服务因构建产物被先前 E2E dev server 替换而未启动；
没有重跑 Recovery。重新生成生产构建后，对已经持久化的 READY 报告做独立只读验证：Public API
200，Quick/Deep/Evidence 均渲染，390px 无横向溢出，Evidence=22，页面切换零 Provider 调用。
QA 选择器随后收紧为精确匹配，属于审计接缝修复，不触发分析或 Provider。

## Deterministic degradation

- coverageMode：`FROZEN_EVIDENCE_SCOPE_ONLY`
- queryPlanProvenance：`UNAVAILABLE`
- competitorResolutionProvenance：`UNAVAILABLE`
- competitorResolutionStatus：`UNVERIFIED_LEGACY_STATE`
- competitorGaps：`[]`
- 负面主张只保留冻结范围限定语，至多 PARTIAL；不足两条独立边界关系则剪枝
- Demonstration Fix 仅可来源于最终已发布 Issue；本次为 null

## Yield decision

技术链路通过，发布 Issue=3；但可信 GEO Opportunity=0。没有降低 Claim–Evidence 阈值、
没有模板补位、没有重跑 Claims。因此按冻结规则停止在
`PASS_WITH_PRODUCT_YIELD_BLOCKER`：不合 integration、不创建
`rebuild-technical-company-canary-zh-v2`、不进入三企业样本。

## Frozen product contract

本轮没有修改 Canonical/Quick/Deep/Evidence 产品契约、Quick 默认与 1800 字上限、评分权重、
AI Visibility 公式、Claim–Evidence 发布阈值、固定免责声明、CTA、SSRF 或系统失败呈现规则。
