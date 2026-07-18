# PROVIDER_RELIABILITY_CONTRACT

## 博查（Web Search）

仅允许 `https://api.bocha.cn/v1/web-search`。通过环境变量配置：
`BOCHA_API_KEY`、`BOCHA_BASE_URL`。

## DeepSeek

通过环境变量配置：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
默认模型：`deepseek-v4-flash`。

结构化调用默认：

- `stream=false`
- `response_format={"type":"json_object"}`
- `thinking={"type":"disabled"}`
- 只解析 `choices[0].message.content`
- `reasoning_content` 不得作为最终 JSON
- 不从自然语言中截取 JSON
- 不自动修复引号、逗号或括号；只允许 trim 和去除 BOM
- `maxTokens` 按阶段配置；Smoke 使用 256；生产阶段不得全部继承 256

## 错误分类（`ProviderErrorCode`，见 `src/providers/types.ts`）

`PROVIDER_AUTH_FAILED` / `PROVIDER_QUOTA_EXCEEDED` / `PROVIDER_RATE_LIMITED` /
`PROVIDER_TIMEOUT` / `PROVIDER_CONNECTION_FAILED` / `PROVIDER_CONTEXT_LIMIT` /
`PROVIDER_REQUEST_TOO_LARGE` / `PROVIDER_INVALID_REQUEST` / `PROVIDER_EMPTY_CHOICES` /
`PROVIDER_EMPTY_FINAL_CONTENT` / `PROVIDER_TRUNCATED_OUTPUT` /
`PROVIDER_CONTENT_FILTERED` / `PROVIDER_INSUFFICIENT_RESOURCE` /
`PROVIDER_INVALID_RESPONSE_SHAPE` / `PROVIDER_INVALID_JSON` /
`PROVIDER_SCHEMA_MISMATCH` / `PROVIDER_UPSTREAM_5XX` / `PROVIDER_MODEL_UNAVAILABLE` /
`PROVIDER_UNKNOWN`

## 重试策略

**只自动重试**：timeout / connection failure / rate limit / upstream 5xx /
临时 model unavailable（`RETRYABLE_PROVIDER_ERRORS`，见 `src/providers/types.ts`）。

**不得自动重试**：auth / quota / invalid request / context limit /
request too large / invalid JSON / schema mismatch / 永久 model unavailable。

## 预算与 Checkpoint

默认任务预算（全部可通过环境变量覆盖）：

- 博查最多 120 次
- DeepSeek 最多 30 次
- 自动重试最多 18 次
- 总墙钟时间 20 分钟
- Evidence 最多 300 条
- 单阶段输入估算 Token 最多 20000

每个分析阶段保存 Checkpoint：`stage` / `inputHash` / `outputJson` /
`reportContractVersion` / `scoreContractVersion` / `providerModel` / `promptVersion` /
`trustGuardVersion` / `completedAt`。

Checkpoint 复用要求全部一致：`inputHash`、契约版本、模型、Prompt 版本、Trust Guard
版本、Evidence Guard 版本。任何变化都必须失效。

从 Checkpoint 恢复后仍必须重新执行：AI 可见度程序计算、CTA 固定模板、Cross-field
Guard、Evidence Semantic Guard、最终发布 Guard。
