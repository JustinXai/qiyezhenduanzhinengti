# REQUIREMENTS_TRACEABILITY — 冻结产品需求 → 权威文档 → 契约类型/模块 → 负责 Agent

本文件由 Agent A（产品冻结与需求追踪）维护，把每条冻结产品需求映射到其权威文档、
`src/contracts/index.ts` 中的具体契约类型（或计划中的模块路径），以及负责实现/校验的
Agent（A–G）。目的：让任意 Agent 在动手前能一步定位「这条需求归谁、以哪份文档为准、
落在哪个类型上」，并把未冻结事项集中登记为 OPEN_QUESTION 交给 Supervisor。

约定：

- 「契约类型」列的 `等宽` 标识符指 `src/contracts/index.ts` 中已冻结的导出（只读）。
- 「计划模块」形如 `src/...`（尚未实现的目录）来自 `docs/ARCHITECTURE.md` +
  `docs/AGENT_FILE_OWNERSHIP.md`，归属以 `AGENT_FILE_OWNERSHIP.md` 为准。
- 「负责 Agent」列：**生成/写入 = 数据来源方**，**校验 = Guard 方**，**渲染 = 展示方**，
  **文档 = 冻结文本所有者**。同一行可能涉及多个 Agent，用角色标注区分。
- 冲突时以「权威文档」列所指文件为准；本表只做索引，不重复其规则正文。

---

## 1. 唯一事实源与展示投影

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| 只保存一份 Canonical `DiagnosisReport`，三视图为只读投影 | `AGENTS.md` §1、`docs/ARCHITECTURE.md` | `DiagnosisReport` | 生成 D；存储/编排 E；投影 F |
| 展示链路固定 `DiagnosisReport → ReportPresentationService → Quick/Deep/Evidence ViewModel` | `docs/ARCHITECTURE.md` | `QuickReportViewModel` / `DeepReportViewModel` / `EvidenceViewModel` + 计划 `src/report/presentation/` | 投影 F |
| 禁止为 Quick/Deep 重新调用 Provider、重算分数、重解释 AI 测试；切视图不产生费用 | `AGENTS.md` §1、`docs/ARCHITECTURE.md`「禁止」 | 计划 `src/report/presentation/`；E2E 守护 `tests/e2e/` | 投影 F；QA G |
| 「最优先」优势/问题/机会的选择逻辑在 PresentationService 完成，渲染层禁止 `array[0]` 兜底 | `docs/ARCHITECTURE.md`、`docs/PRODUCT_TRUTH_RULES.md` §4.7 | `QuickReportViewModel.{topStrength,topIssue,topOpportunity}` + 计划 `src/report/presentation/` | 投影 F |
| 契约版本锚点（报告/评分版本必须一致） | `src/contracts/index.ts` | `REPORT_CONTRACT_VERSION` / `SCORE_CONTRACT_VERSION` / `DiagnosisReport.reportContractVersion` / `.scoreContractVersion` | 校验 B |

## 2. 五项评分与权重（权重冻结）

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| 五维度固定权重 20/20/25/20/15，不得修改 | `AGENTS.md` §3、`docs/SCORE_CONTRACT.md` | `SCORE_DIMENSION_WEIGHTS`、`ScoreBlock`、`ScoreDimension` | 计算 D；校验 B；文档 A |
| 每维度 `score:number\|null`、`measurementStatus`、`confidence`、`evidenceIds` | `docs/SCORE_CONTRACT.md`「每项评分」 | `ScoreDimension`、`MeasurementStatus` | 计算 D；校验 B |
| `scoreCoverage` = 有效分数权重之和 | `docs/SCORE_CONTRACT.md`「scoreCoverage」 | `ScoreBlock.scoreCoverage` | 计算 D；校验 B |
| 综合分只用非 null 维度、重新归一化；`scoreCoverage<70%` 时 `overallScore=null`；null≠0 | `AGENTS.md` §3、`docs/SCORE_CONTRACT.md`「综合分规则」 | `ScoreBlock.overallScore`（nullable）、`QuickReportViewModel.overallScore`（nullable） | 计算 D；校验 B；渲染 F（见 OQ-5） |
| 客户页最多 1 位小数，内部可 2 位小数 | `docs/SCORE_CONTRACT.md`「综合分规则」 | 计划 `src/report/presentation/` | 渲染 F |
| 全 `ESTIMATED` 提示语、存在未测得维度提示语（逐字见 CTA 字符串 §7） | `docs/SCORE_CONTRACT.md`、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §7 | 文案常量（无类型）；`QuickReportViewModel.measurementStatusSummary` | 文案 A；渲染 F；扫描 G（见 OQ-7、OQ-8） |

## 3. Quick 视图（固定 8 模块）

| 模块 / 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| Quick 为默认视图、约 1800 中文可见字符、手机优先、CTA 首屏约 1.5 屏可见 | `docs/REPORT_CONTRACT.md`（抬头）、`docs/PROJECT_FREEZE.md` | `QuickReportViewModel`（整体）+ 计划 `src/report/presentation/` | 渲染 F；QA G |
| ①首屏决策摘要（9 必备字段 + 主 CTA + 完整诊断入口） | `docs/REPORT_CONTRACT.md` §1 | `QuickReportViewModel.{brandName,reportDate,headlineConclusion,overallScore,scoreCoverage,measurementStatusSummary,topStrength,topIssue,topOpportunity}` | 生成 D（结论）；渲染 F |
| 综合分统一命名「GEO可见度基础指数」，禁用 5 个别名 | `docs/REPORT_CONTRACT.md` §1、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §4 | 文案常量（无类型）；渲染于 `QuickReportViewModel.overallScore` 旁 | 文案 A；渲染 F；扫描 G |
| ②AI 现在怎么谈论企业：最多 2 个 VALID 测试 + 样本性质说明 | `docs/REPORT_CONTRACT.md` §2、`docs/PRODUCT_TRUTH_RULES.md` §8 | `QuickReportViewModel.aiVisibilitySamples`（`.max(2)`）、`AIVisibilityTest` | 计算 D；渲染 F |
| ③竞品差距：5 条件同时满足才显示，否则占位文案 | `docs/REPORT_CONTRACT.md` §3、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §6 | `QuickReportViewModel.competitorGapSummary`（available true/false union）、`CompetitorGap` | 生成 D；校验 B；渲染 F（见 OQ-3、OQ-4） |
| ④三个核心问题：每项 4 要点、约 120 字、不泄露 SOW/工时/规格 | `docs/REPORT_CONTRACT.md` §4 | `QuickReportViewModel.coreIssues`（`.max(3)`）、`CoreIssue` | 生成 D；渲染 F |
| ⑤示范修复：3 类型之一；证据不足则整模块 `null` 隐藏；固定免责声明 | `docs/REPORT_CONTRACT.md` §5、`docs/PRODUCT_TRUTH_RULES.md` §4 | `QuickReportViewModel.demonstrationFix`（nullable）、`DemonstrationFix`、`DemonstrationFixType`、`DemonstrationFix.disclaimer`（`z.literal`） | 生成 D；校验 B；渲染 F（见 OQ-1） |
| ⑥Top 3 GEO 机会：每项 5 要点；不足 3 项按实数、不补满 | `docs/REPORT_CONTRACT.md` §6、`docs/PRODUCT_TRUTH_RULES.md` §4.10–4.11 | `QuickReportViewModel.geoOpportunities`（`.max(3)`）、`GeoOpportunity` | 生成 D；校验 B；渲染 F |
| ⑦三阶段路线图：仅阶段目标与预期结果；固定阶段名 | `docs/REPORT_CONTRACT.md` §7、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §10 | 文案常量（无类型）；计划 `src/report/presentation/` | 文案 A；渲染 F |
| ⑧CTA：主/次 CTA、说明段落、30 分钟三点说明（逐字） | `docs/REPORT_CONTRACT.md` §8、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §1–3 | 文案常量（无类型）；计划 `src/report/validation/`（CTA Guard） | 文案 A；渲染 F；校验 B；扫描 G |

## 4. AI 可见度单一事实源

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| AI 可见度只来自 `aiVisibilityTests`；分数/理由/提及率程序计算，禁止 LLM 自由生成 | `AGENTS.md` §4、`docs/PRODUCT_TRUTH_RULES.md` §8、`docs/SCORE_CONTRACT.md`「AI 可见度计算」 | `AIVisibilityTest`、`ScoreBlock.aiVisibility` + 计划 `src/diagnosis/analysis/` | 计算 D；校验 B |
| 测试状态、准确度、推荐强度、问题类别枚举 | `docs/PRODUCT_TRUTH_RULES.md` §8 | `AIVisibilityTestStatus`、`AIVisibilityAccuracy`、`AIVisibilityRecommendationStrength`、`AIVisibilityQuestionCategory` | 计算 D；校验 B |
| 有效测试 <3 时 `score=null`、`confidence≤0.40` | `docs/PRODUCT_TRUTH_RULES.md` §8 | `ScoreBlock.aiVisibility`、`AIVisibilityTest.status` | 计算 D；校验 B |
| 打分公式：品牌提及率 50% / 准确度 30% / 推荐强度 20%，理由按真实计数生成 | `docs/PRODUCT_TRUTH_RULES.md` §8 | 计划 `src/diagnosis/analysis/`（AI 可见度计算器） | 计算 D；校验 B |
| 样本性质四事实（当前模型/时间/问题集样本、非多平台份额、非豆包元宝 Kimi 监测、非全网推荐率） | `docs/PRODUCT_TRUTH_RULES.md` §8、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §8 | 文案要点（无逐字模板）；渲染于 Quick ②/Deep | 文案要点 A；撰写 D/F；扫描 G |
| Quick 最多 2 个 VALID，优先级 购买决策>竞品比较>品牌直接>其他 | `docs/REPORT_CONTRACT.md` §2、`docs/PRODUCT_TRUTH_RULES.md` §8 | `AIVisibilityQuestionCategory`、`QuickReportViewModel.aiVisibilitySamples` | 投影 F |

## 5. Evidence、Claim 与发布 Guard

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| Evidence 来源类型 / Claim 类型 / 支持等级枚举 | `docs/PRODUCT_TRUTH_RULES.md` §1–3 | `EvidenceSourceType`、`ClaimType`、`EvidenceSupportLevel`、`EvidenceItem` | 生成 C；校验 B |
| 发布规则 11 条（DIRECT/PARTIAL 门槛、禁 `array[0]` 兜底、禁固定填满等） | `docs/PRODUCT_TRUTH_RULES.md` §4 | `ClaimBase.evidenceIds`（`.min(1)`）、`CoreIssue`/`Strength`/`GeoOpportunity` + 计划 `src/report/validation/`（Evidence Semantic Guard） | 校验 B；生成 C/D |
| Evidence 引用完整性（所有 evidenceId 必须存在） | `docs/PRODUCT_TRUTH_RULES.md` §4.6 | `EvidenceItem.id` × 各 `evidenceIds` + 计划 `src/report/validation/` | 校验 B |
| Evidence 视图字段固定、Drawer 默认折叠、URL 清洗（去 token/credential/auth 等） | `docs/REPORT_CONTRACT.md`「Evidence View」、`docs/PRODUCT_TRUTH_RULES.md` §6 | `EvidenceViewModel`（`EvidenceItem.pick`）+ 计划 `src/report/presentation/` | 清洗 B/C；渲染 F |
| 绝对禁止（把推断写成事实、虚构 URL/搜索量/份额、把公开搜索称多平台监测等） | `docs/PRODUCT_TRUTH_RULES.md` §5 | 计划 `src/report/validation/`（Trust Guard）+ `tests/e2e/` | 校验 B；QA G |

## 6. Provider 可靠性

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| 博查仅 `https://api.bocha.cn/v1/web-search`，经环境变量配置 | `AGENTS.md` §5、`docs/PROVIDER_RELIABILITY_CONTRACT.md`「博查」 | 计划 `src/providers/bocha/` | 实现 C |
| DeepSeek 默认 `deepseek-v4-flash`；`stream=false`、`json_object`、`thinking=disabled`、只解析 `choices[0].message.content` | `AGENTS.md` §5、`docs/PROVIDER_RELIABILITY_CONTRACT.md`「DeepSeek」 | 计划 `src/providers/deepseek/` | 实现 D |
| 错误分类 `ProviderErrorCode` 与重试白名单 | `docs/PROVIDER_RELIABILITY_CONTRACT.md`「错误分类」「重试策略」 | 计划 `src/providers/types.ts`（`ProviderErrorCode`、`RETRYABLE_PROVIDER_ERRORS`） | 实现 C/D；校验 B |
| 任务预算与 Checkpoint 复用/失效条件 | `docs/PROVIDER_RELIABILITY_CONTRACT.md`「预算与 Checkpoint」、`docs/ARCHITECTURE.md` | 计划 `src/diagnosis/orchestration/`、`src/storage/`（`analysis_checkpoints`） | 编排/存储 E；分析 D |
| 状态机 `CREATED→…→READY\|FAILED` | `docs/ARCHITECTURE.md`「状态机」 | 计划 `src/runtime/`、`src/diagnosis/orchestration/` | 编排 E |

## 7. 安全不变量

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| Crawler SSRF 防护（私网/link-local/metadata/DNS rebinding/重定向复验/含账密 URL/非 HTTP(S)） | `AGENTS.md` §6、`docs/SECURITY_INVARIANTS.md` | 计划 `src/security/crawler/` | 实现 C；测试 G（`tests/security/crawler/`） |
| Crawler 手工处理重定向、DNS 解析后校验 IP、限体积/超时/页数/Content-Type | `docs/SECURITY_INVARIANTS.md`「Crawler 必须」 | 计划 `src/security/crawler/` | 实现 C；测试 G |
| 日志脱敏（不输出 Key/Auth/密码/完整 Prompt/完整响应/完整 publicToken/手机号等） | `docs/SECURITY_INVARIANTS.md`「日志脱敏」 | 跨模块（Provider/Runtime/Storage 日志） | 各实现方；审查 G |
| 联系人/联系方式不得进入公开报告 Payload，也不得进入 Deep View | `docs/PROJECT_FREEZE.md`、`docs/SECURITY_INVARIANTS.md`「联系方式」 | `DiagnosisReport`（无联系人字段——结构性保证）、`DeepReportViewModel` | 编排/存储 E；渲染 F；审查 G |
| Public 仓库禁提交真实 Key/连接串/未脱敏 Artifacts；真实运行产物入私有目录 | `AGENTS.md` §9、`docs/SECURITY_INVARIANTS.md`「GitHub / 敏感数据」 | 流程约束 + `.gitignore` | 全体；CI G |

## 8. CTA / 禁用文案 / 真实性文案

| 需求 | 权威文档 | 契约类型 / 计划模块 | 负责 Agent |
|---|---|---|---|
| 主 CTA `预约报告解读` / 次 CTA `获取企业GEO优化方案`（逐字） | `docs/REPORT_CONTRACT.md` §8、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §1 | 文案常量（无类型）；计划 `src/report/validation/`（CTA Guard） | 文案 A；渲染 F；校验 B；扫描 G |
| CTA 说明段落、30 分钟解读会三点说明（逐字，含全角编号「1）2）3）」） | `docs/REPORT_CONTRACT.md` §8、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §2–3 | 文案常量（无类型） | 文案 A；渲染 F；扫描 G（见 OQ-6） |
| demonstrationFix 固定免责声明（`z.literal` 强制，半角逗号版本为运行时权威） | `docs/REPORT_CONTRACT.md` §5、`src/contracts/index.ts`、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §5 | `DemonstrationFix.disclaimer`（`z.literal`）、`DemonstrationFix.shape.disclaimer.value`（复用入口） | 生成 D；校验 B；渲染 F（见 OQ-1） |
| 竞品证据不足占位文案（逐字） | `docs/REPORT_CONTRACT.md` §3、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §6 | `QuickReportViewModel.competitorGapSummary`（`{available:false,reason}`） | 渲染 F（见 OQ-4） |
| 三阶段路线图固定阶段名（逐字） | `docs/REPORT_CONTRACT.md` §7、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §10 | 文案常量（无类型） | 文案 A；渲染 F |
| 文案禁用词 11 条扫描 | `docs/PRODUCT_TRUTH_RULES.md` §9、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §9 | 计划 Agent G 扫描器（`scripts/` / `tests/`） | 扫描 G；文案 A |
| 不承诺排名/流量/线索/收入、不恐吓式文案 | `AGENTS.md` §10、`docs/PROJECT_FREEZE.md`、`docs/PRODUCT_TRUTH_RULES.md` §9 | 计划 `src/report/validation/` + `tests/e2e/` | 校验 B；扫描 G |

---

## Needs Supervisor 决策（OPEN_QUESTIONS）

以下为 Agent A 在审校冻结文档时发现的、冻结文档之间或文档与 `src/contracts/index.ts`
之间存在张力/缺口的事项。**Agent A 不修改 `src/contracts/index.ts`，也不擅自裁定**；
在 Supervisor 给出结论前，实现方按「临时口径」执行并在各自 CHECKPOINT 标注未冻结。

| 编号 | 事项 | 冲突/缺口位置 | 影响 Agent | 临时口径（待 Supervisor 确认） |
|---|---|---|---|---|
| **OQ-1** | demonstrationFix 免责声明逗号：全角 `U+FF0C` vs 半角 `U+002C` | `docs/REPORT_CONTRACT.md` §5（全角）↔ `src/contracts/index.ts` `DemonstrationFix.disclaimer` `z.literal`（半角），其余码点一致（Agent A 已逐字节核验） | B（校验）、D（写入）、F（渲染） | 以 `index.ts` 半角版本为运行时权威（它是强制 schema）；复用 `DemonstrationFix.shape.disclaimer.value`，勿从文档重打。请 Supervisor 决定是否把 `REPORT_CONTRACT.md` §5 改为半角以对齐 |
| **OQ-2** | Deep 视图 GEO 机会数量「3–5 个」与「不得固定数量强行填满」矛盾 | `docs/REPORT_CONTRACT.md`「Deep View」(3–5) ↔ `docs/REPORT_CONTRACT.md` §6 / `docs/PRODUCT_TRUTH_RULES.md` §4.10–4.11（按实数、不补满） | D（生成）、F（渲染） | 证据充分时最多展示 5 个、优先展示可信度高者；可信机会不足时按实际数量显示，不补满，即「≤5 且不强填」 |
| **OQ-3** | 竞品差距的 Evidence 支持等级门槛未量化 | `docs/REPORT_CONTRACT.md` §3 仅定性「足够 Evidence / 达到语义支持要求」；`docs/PRODUCT_TRUTH_RULES.md` §4 的 1–3 条只覆盖核心问题/优势/机会，未列 `CompetitorGap` | B（Guard）、C（证据）、D（生成）、F | 暂比照优势口径：竞品差距至少 1 条 `DIRECT_SUPPORT` 或 2 条 `PARTIAL_SUPPORT`（`COMPETITOR_WEB_EVIDENCE`）方可展示，否则走占位文案 |
| **OQ-4** | 竞品占位文案预设「已收到竞品输入」，用户完全未填竞品时的行为未定义 | `docs/REPORT_CONTRACT.md` §3、`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §6 | F（渲染）、E（编排） | 用户未提交任何竞品时直接隐藏模块（`competitorGapSummary.available=false` 但不显示预设「已收到竞品输入」文案）；仅在有输入而证据不足时显示占位文案 |
| **OQ-5** | `overallScore=null`（`scoreCoverage<70%`）时 Quick 首屏「GEO可见度基础指数」的显示文案未冻结 | `docs/SCORE_CONTRACT.md`「综合分规则」+ `docs/REPORT_CONTRACT.md` §1；`QuickReportViewModel.overallScore` 可为 null 但无 null 态展示串 | F（渲染）、A（文案） | 暂显示「暂未测得（覆盖度不足 70%）」并配合 §7 未测得维度提示，绝不显示 0；最终文案待 Supervisor 冻结 |
| **OQ-6** | 服务方品牌名「凡间AI」是否为最终对客品牌名 | 仅见 `docs/REPORT_CONTRACT.md` §8、`docs/PROJECT_FREEZE.md`；`AGENTS.md` 冻结索引未确认 | D、F（会硬编码进 CTA 文案）、A | 抄写含「凡间AI」的 30 分钟说明时保留原字，不改写；是否替换为其他品牌名由 Supervisor 统一裁定后再全局替换 |
| **OQ-7** | `measurementStatusSummary` 如何由 5 个逐维 `measurementStatus` 汇总为一句首屏摘要，格式未冻结 | `docs/SCORE_CONTRACT.md`；`QuickReportViewModel.measurementStatusSummary` 为自由字符串，无模板 | D（生成）、F（渲染） | 暂由 PresentationService 按「优先级 PROVIDER_FAILED>INSUFFICIENT_EVIDENCE>ESTIMATED>MEASURED」选主状态并套用 §7 既有提示语；模板待冻结 |
| **OQ-8** | 「全 `ESTIMATED`」提示语与「存在未测得维度」提示语同时成立时显示哪条/是否都显示，未冻结 | `docs/SCORE_CONTRACT.md`「综合分规则」分别给出两句，未规定共存情形；`docs/product/CTA_AND_DISCLAIMER_STRINGS.md` §7 已记录 | F（渲染）、A（文案） | 暂两句都显示（先「本次结果主要基于公开网络信息估算。」后「部分维度暂未测得。」）；是否合并/取舍待 Supervisor 裁定 |

> 维护约定：Supervisor 裁定后，由 Agent A 把对应 OQ 行标注「已裁定 + 结论 + 落地位置」，
> 并同步更新 `docs/product/` 相关小节；未裁定前实现方不得把临时口径当作冻结事实。
