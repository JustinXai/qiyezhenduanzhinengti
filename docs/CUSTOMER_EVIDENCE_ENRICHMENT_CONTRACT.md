# Customer Evidence Enrichment Contract V1

## 1. 两阶段产品边界

阶段 1 是公共诊断：只使用公开网络，沿用 Canonical → Quick / Deep / Evidence 的冻结链路，真实性
优先，允许稀疏，不强制 Opportunity。

阶段 2 是报告解读后的企业资料补充：展示 Evidence Gap，请客户确认事实或提供可脱敏材料，之后再
进行独立验证，才可能形成可信 Opportunity 或正式 GEO 优化方案。

阶段 2 不是阶段 1 的自动修订。本轮只实现 Contract、Planner、Mock、QA 与文档，不实现上传、
对象存储或审批后台。`CUSTOMER_EVIDENCE_ENRICHMENT_ENABLED=false`，且没有 URL/表单启用路径。

## 2. CustomerEvidenceRequestPackV1

请求包：

- 仅用于 `POST_REPORT_ENRICHMENT`；
- 不显示在免费 Quick 报告；
- 每家公司最多 5 项；
- 每项关联 Candidate、Slot、客户问题和潜在 GEO 机会；
- 说明要确认的事实、建议材料、材料验证目标、敏感性、是否允许口头确认；
- 每项固定 `requiresApprovalBeforePublication=true`。

允许建议的材料类型包括产品参数、服务流程、客户案例、资质、售后网络、FAQ、招商/采购说明、
内部品牌口径或口头确认。

禁止索取 API Key、密码、客户个人数据、未脱敏合同、财务机密和无关内部文件。请求包只表达验证
需求，不代表客户必须提供材料。

## 3. DiagnosisEnrichmentSession

阶段 2 必须创建新的 append-only `DiagnosisEnrichmentSession`，包含：

- 独立 Session ID 与递增 `sequence`；
- `diagnosisId`、`baseReportId`、`baseCanonicalHash`；
- `appendOnly=true`；
- `canonicalMutationAllowed=false`；
- 客户确认/材料 Contribution 的来源、接收时间、确认状态、证据评估状态与审批 ID。

原 Canonical 永远是 Session 的只读基线。若未来需要发布新报告，必须经独立验证、Publication
Policy 和人工审批后形成新的 append-only 版本；不得覆盖历史 Canonical。

## 4. 客户确认不等于 DIRECT

新收到的确认或材料初始必须是：

- `evidenceEvaluationStatus=NOT_EVALUATED`；
- `supportLevel=UNASSIGNED`；
- `verifierApprovalId=null`。

即使客户将事实标记为 `CONFIRMED`，也不能自动变为 `DIRECT_SUPPORT`。只有独立语义验证通过且
记录 `verifierApprovalId` 后，Contract 才允许记录 DIRECT；这仍不代表 Claim 自动发布。

以下情况确认后仍不能修复：

- 无效 `sourceIssueId`；
- 禁用或过度承诺文案；
- 缺失 Coverage 限定；
- 竞品实体/关系未验证；
- 系统失败。

## 5. Round-6B 私有请求包

私有最终产物位于：

`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\evidence-closure-agent-ah-final`

- 洽洽：4 项请求；
- 科大讯飞：3 项请求；
- 安徽合力：0 项（没有候选，不虚构请求）。

所有请求包均为 `featureEnabled=false`、`visibleInFreeQuickReport=false`，没有执行上传或客户试用。
