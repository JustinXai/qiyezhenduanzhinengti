# AGENTS.md — 企业诊断智能体 Clean-Room Rebuild

本文件是所有 Agent（人类或 AI）在本仓库工作时必须遵守的冻结不变量索引。
详细契约拆分在 `docs/` 下；本文件只做速查，冲突时以对应 `docs/*.md` 为准。

## 0. 本项目是什么

单网站 + 单诊断智能体 + 单 Canonical Report + 单诊断流程。
不是聊天机器人、不是多智能体运行时、不是工作流编辑器、不接飞书/扣子/Dify。
详见 [docs/PROJECT_FREEZE.md](docs/PROJECT_FREEZE.md)。

## 1. 唯一事实源

只保存一份 Canonical `DiagnosisReport`（类型定义于 `src/contracts/index.ts`，Supervisor 独占）。
展示链路固定：

```
Canonical DiagnosisReport → ReportPresentationService → QuickReportViewModel / DeepReportViewModel / EvidenceViewModel
```

禁止为 Quick/Deep 重新调用 Provider、重新计算分数、重新解释 AI 测试。
详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 2. 报告结构（Quick 8 模块 / Deep / Evidence）

详见 [docs/REPORT_CONTRACT.md](docs/REPORT_CONTRACT.md)。

## 3. 评分契约（5 项固定权重，不得修改）

companyClarity 20% / websiteCompleteness 20% / customerQuestionCoverage 25% /
trustEvidence 20% / aiVisibility 15%。

`scoreCoverage < 70%` 时 `overallScore = null`。null ≠ 0。
详见 [docs/SCORE_CONTRACT.md](docs/SCORE_CONTRACT.md)。

## 4. AI 可见度单一事实源

只能来自 `aiVisibilityTests`；分数、理由必须由程序计算，禁止 LLM 自由生成。
详见 [docs/PRODUCT_TRUTH_RULES.md](docs/PRODUCT_TRUTH_RULES.md) 第 8 节。

## 5. Provider 可靠性

博查仅 `https://api.bocha.cn/v1/web-search`；DeepSeek 默认模型 `deepseek-v4-flash`，
`stream=false`，`response_format=json_object`，`thinking=disabled`，只解析
`choices[0].message.content`。错误分类与重试策略见
[docs/PROVIDER_RELIABILITY_CONTRACT.md](docs/PROVIDER_RELIABILITY_CONTRACT.md)。

## 6. 安全不变量

Crawler SSRF 防护、日志脱敏规则见 [docs/SECURITY_INVARIANTS.md](docs/SECURITY_INVARIANTS.md)。

## 7. 文件所有权

严格按 [docs/AGENT_FILE_OWNERSHIP.md](docs/AGENT_FILE_OWNERSHIP.md) 执行。不得修改其他
Agent 目录、不得修改共享配置、不得 `reset --hard` / `clean -fdx`、不得直接合并到 main。

## 8. Checkpoint 与交付

每个 Agent 完成可验证阶段后：跑自身测试 → commit → push 远程分支 →
写 `agent-output/<agent-name>/CHECKPOINT.md`。Supervisor 复核实际 diff 与测试结果后
才更新 [docs/DELIVERY_BOARD.md](docs/DELIVERY_BOARD.md)。Agent 自报 PASS 不等于通过。

## 9. 真实样本限制

第一轮 Mock Vertical Slice 全部通过前，禁止调用真实博查/DeepSeek。真实样本运行前必须：
代码已 push、工作区干净、`DIAGNOSIS_SMOKE_MODE` 在进程级设为 `false`、每家企业只建一个
Diagnosis、严格顺序执行、Artifacts 进入 `E:\企业诊断智能体_private` 或 `.gitignore` 目录。

## 10. 禁止事项（贯穿全部工作）

不恶意压分、不夸大竞品、不伪造搜索结果、不 Evidence 错配、不虚假精度、不恐吓式文案、
不承诺排名/流量/线索/收入。发现问题按「现象→根因→影响范围→上下游依赖→同类问题→
系统不变量→通用 Guard→回归测试」处理，不得围绕单个报错连续堆补丁。
