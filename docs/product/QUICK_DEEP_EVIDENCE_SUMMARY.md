# QUICK_DEEP_EVIDENCE_SUMMARY — 复核用检查清单

本文件不是权威规格，权威规格是 `docs/REPORT_CONTRACT.md` +
`docs/PRODUCT_TRUTH_RULES.md`（冲突时以它们为准）。本文件把它们压缩成一份可勾选的
Review Checklist，给 Agent B/D/E/F/G 在实现、代码评审、集成验收时快速自查，避免每次
都要重新通读长文档。

## 如何使用

在 PR / Checkpoint 自查、Supervisor 集成评审时，逐条勾选。任何一条打不上勾都必须在
`agent-output/<agent>/CHECKPOINT.md` 里说明原因或列为已知缺口。

## Quick 视图（默认视图，8 模块）

- [ ] 整体控制在约 2–3 分钟阅读、约 1800 中文可见字符以内、移动端优先布局
- [ ] 模块 1 首屏摘要含全部 9 个必须字段（品牌名/日期/一句话结论/GEO可见度基础指数/
      scoreCoverage/measurementStatus 摘要/一个优势/一个最优先问题/一个最优先机会）+
      主 CTA + 完整诊断入口，且 CTA 在约 1.5 屏内可见
- [ ] 综合分只叫「GEO可见度基础指数」，未出现任何禁用别名
- [ ] 模块 2 AI 可见度最多显示 2 个 `VALID` 测试，并明确样本性质（非多平台监测）
- [ ] 模块 3 竞品差距只在 5 个条件同时满足时显示；不满足时不展示空表格
- [ ] 模块 4 三个核心问题：每项只含「当前发现/Evidence标签/业务场景影响/修复方向」，
      每项约 120 字以内，未泄露完整页面规格/交付物清单/工时/验收/SOW
- [ ] 模块 5 demonstrationFix：类型限定 3 种之一；证据不足时整模块为 `null` 并隐藏，
      不强行生成；固定免责声明字面量与运行时 schema 完全一致（见字符串来源文件的
      OPEN_QUESTION 提示）
- [ ] 模块 6 Top 3 GEO 机会：每项含 5 个要点；不足 3 项按实际数量显示，不补满
- [ ] 模块 7 三阶段路线图：客户版只展示阶段目标和预期结果，不展示周任务/工时/物料/
      报价/验收标准/付费 SOW
- [ ] 模块 8 CTA：主/次 CTA 文案、说明段落、30 分钟解读会三点说明与
      `docs/product/CTA_AND_DISCLAIMER_STRINGS.md` 逐字一致
- [ ] 全文案未出现 `docs/product/CTA_AND_DISCLAIMER_STRINGS.md` 第 9 节列出的任一禁用词

## Deep 视图

- [ ] 允许内容全部展示：完整企业画像/待确认信息/五项评分/`score`/`confidence`/
      `measurementStatus`/`scoreCoverage`/全部 VALID AI 测试/全部可信优势/全部可信核心
      问题/证据充分的次要发现/条件性竞品分析/GEO 机会/测量说明/Evidence 附件
- [ ] 禁止内容全部未出现：完整 30 天 SOW/报价/销售异议脚本/内部主攻问题标记/完整内容
      建设规格/Provider 调用细节/Checkpoint/联系人和手机号
- [ ] GEO 机会数量处理方式已按 Supervisor 对 OQ-2 的裁定实现（当前冻结文本写的
      「3–5 个」与「不得强行填满」规则存在张力，实现前需要确认口径）

## Evidence 视图

- [ ] 发布前已清除 URL 中的 username/password/fragment/token/signature/credential/
      access_key/auth 参数
- [ ] Evidence Drawer 默认折叠
- [ ] 每条 Evidence 展示：标题/来源域名/来源类型/权威等级/支持等级/获取时间/摘要/
      清洗后的原始链接（且仅这些字段，不多不少）

## 跨视图不变量（ARCHITECTURE.md）

- [ ] Quick/Deep/Evidence 全部来自同一份 Canonical `DiagnosisReport`，未为任何视图
      重新调用 Provider、重新计算分数、重新解释 AI 测试
- [ ] 核心问题/优势/机会的「最优先」选择逻辑在 `ReportPresentationService`
      （`src/report/presentation/`）里完成，前端渲染层不做 `array[0]` 之类的兜底选择
- [ ] 切换 Quick/Deep/Evidence 视图不创建新任务、不产生新的 Provider 调用费用

## Evidence 发布规则速查（PRODUCT_TRUTH_RULES.md §4，完整规则见原文）

- [ ] 核心问题 ≥ 1 条 `DIRECT_SUPPORT`
- [ ] 优势 ≥ 1 条 `DIRECT_SUPPORT` 或 ≥ 2 条 `PARTIAL_SUPPORT`
- [ ] GEO 机会 ≥ 1 条 `DIRECT_SUPPORT` 或 ≥ 2 条 `PARTIAL_SUPPORT`
- [ ] 竞品差距的证据门槛口径已确认（当前冻结文档未给出具体等级，见 OQ-3）
- [ ] 未出现 `CONTEXT_ONLY` 单独支撑核心事实
- [ ] 未出现 `UNSUPPORTED` 证据进入客户报告
- [ ] 全部 Evidence ID 均可解析到真实存在的 Evidence 条目
- [ ] 未使用 `array[0]` 兜底选择证据
- [ ] 未出现 3 个以上机会复用完全相同 Evidence 集合仍发布的情况
- [ ] 抓取失败/Provider 失败/索引不足未被包装成客户核心问题

## OPEN_QUESTION 索引

本清单中引用的 `OQ-2`、`OQ-3` 等编号，完整定义、影响面与临时口径见
`docs/REQUIREMENTS_TRACEABILITY.md` 底部「Needs Supervisor 决策（OPEN_QUESTIONS）」表。
在 Supervisor 裁定前，涉及这些编号的勾选项应按该表给出的「临时口径」实现，并在
`agent-output/<agent>/CHECKPOINT.md` 标注仍为未冻结事项。
