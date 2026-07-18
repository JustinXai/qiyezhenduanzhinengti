# SCORE_CONTRACT — 五项评分（权重冻结）

| 维度 | key | 权重 |
|---|---|---|
| 企业信息清晰度 | `companyClarity` | 20% |
| 官网内容完整度 | `websiteCompleteness` | 20% |
| 客户问题覆盖度 | `customerQuestionCoverage` | 25% |
| 信任证据完整度 | `trustEvidence` | 20% |
| 当前 AI 问答样本可见度 | `aiVisibility` | 15% |

**不得修改权重。** 定义见 `src/contracts/index.ts` 的 `SCORE_DIMENSION_WEIGHTS`
（Supervisor 独占，如需调整必须走 Supervisor）。

## 每项评分

`score: number | null`

`measurementStatus`: `MEASURED` / `ESTIMATED` / `INSUFFICIENT_EVIDENCE` /
`PROVIDER_FAILED`

`confidence`: 0 到 1

## scoreCoverage

按存在有效分数的权重总和计算。

## 综合分规则

- 只使用非 null 维度；
- 对非 null 权重重新归一化；
- `scoreCoverage < 70%` 时 `overallScore = null`；
- 不得把 null 解释为 0；
- 客户页面最多显示 1 位小数；内部可保留 2 位小数。

全部 `ESTIMATED` 时必须明显提示："本次结果主要基于公开网络信息估算。"
存在未测得维度时提示："部分维度暂未测得。"

## AI 可见度计算

见 [PRODUCT_TRUTH_RULES.md](PRODUCT_TRUTH_RULES.md) §8。`aiVisibility` 维度的
`score`/`confidence` 必须与 `aiVisibilityTests` 程序计算结果一致，禁止 LLM 自由生成。
