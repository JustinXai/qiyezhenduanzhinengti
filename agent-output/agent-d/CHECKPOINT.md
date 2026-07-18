# Agent D CHECKPOINT — DeepSeek 与诊断引擎 (Round-1 Mock)

分支 `cursor/rebuild-diagnosis-engine`,基线 `31972e3`。全程 Mock,**未真实调用 DeepSeek**。

## 1. 交付物与文件清单

### DeepSeek 适配器 (`src/providers/deepseek/`)
- `deepseek-adapter.ts` — `createDeepSeekProvider(config, {fetch})` 实现
  `StructuredCompletionProvider`。冻结默认:`deepseek-v4-flash` / `stream=false` /
  `response_format={type:"json_object"}` / `thinking={type:"disabled"}` /
  `max_tokens=<按阶段>`。只解析 `choices[0].message.content`。`fetch` 注入。
  `deepSeekConfigFromEnv()` 读取 `DEEPSEEK_API_KEY/BASE_URL/MODEL`。
- `parse-json.ts` — 严格 JSON:仅 trim + 去 BOM,不修复引号/逗号/括号,不从自然语言截取。
- `envelope.ts` — 2xx 信封分类。顺序:shape → empty choices → finish_reason(length→
  TRUNCATED / content_filter→FILTERED) → 空 content(EMPTY_FINAL,`reasoning_content`
  绝不兜底)→ INVALID_JSON。
- `error-classification.ts` — 传输错误(AbortError→TIMEOUT,TypeError→CONNECTION_FAILED)
  与 HTTP 状态映射。`retryable` **一律**由 `RETRYABLE_PROVIDER_ERRORS` 派生,杜绝漂移。
- `stage-schema.ts` — `parseStageJson(stage, zodSchema, json)` → 成功值 或
  `PROVIDER_SCHEMA_MISMATCH`(不可重试)。
- `index.ts` — barrel。

### 阶段化分析 (`src/diagnosis/analysis/`)
- `stage-schemas.ts` — 各阶段 DeepSeek 输出的 Zod 形状(company_profile /
  dimension_signals / ai_visibility / claims),复用 contracts 的枚举保持线对齐。
- `evidence-index.ts` — evidence 索引 + `resolveEvidenceIds`(只过滤未知 id,**绝不**
  `array[0]` 兜底)+ round2/clamp。
- `company-profile.ts` — `extractCompanyProfile`:website/用户品牌名/用户竞品为权威输入,
  不让模型覆盖已知事实;合并去重竞品与开放问题。
- `dimension-scoring.ts` — `scoreNonAiDimensions`:每维度固定 rubric,模型只给
  PRESENT/PARTIAL/ABSENT,**score/measurementStatus/confidence 全程序化**。无可解析
  evidence → score=null + INSUFFICIENT_EVIDENCE(null≠0)。有 DIRECT 或一方 PARTIAL →
  MEASURED,否则 ESTIMATED(confidence 上限 0.6)。
- `ai-visibility.ts` — `buildAiVisibilityTests` + `computeAiVisibilityDimension`:
  `brandMentioned` **程序化**(答案文本子串匹配,覆盖模型自述);未提及则强制
  accuracy=NOT_MENTIONED / recommendation=NONE。<3 VALID → score=null 且
  confidence≤0.40;≥3 VALID → §8 公式 `0.5*提及率 + 0.3*准确度 + 0.2*推荐强度`。
- `claims.ts` — `buildClaims`:strengths/coreIssues/geoOpportunities/competitorGaps/
  demonstrationFix。确定性 id;referential integrity(过滤未知 id,过滤后为空则**丢弃**
  该 claim,不补位);demonstrationFix 无可解析 evidence → null(不为凑模块造假);
  disclaimer 从 `DemonstrationFix.shape.disclaimer.value` 冻结字面量盖章,忽略模型输出。
- `index.ts` — barrel。

### 报告组装 (`src/report/generation/`)
- `score-seam.ts` — `computeOverall(5 维)`。**已用 `// INTEGRATION SEAM (Agent B
  score-calculator) — replace at integration` 明确标注**。按 SCORE_CONTRACT:非 null 维度
  权重归一化;coverage<70% → overallScore=null;null 不当 0。仅此一个 helper,未复制 B 的
  其它 Guard。
- `assemble-report.ts` —
  - `assembleReport(input)`:组装 → `DiagnosisReport.safeParse` → 成功返回 report,
    失败返回 Zod issue 列表(不抛)。
  - `buildReportFromStageOutputs(input)`:串联 4 个分析阶段(消费**已获取**的各阶段
    DeepSeek JSON)+ 组装;阶段 schema 不符时回传出错阶段名与 ProviderFailure。
- `index.ts` — barrel。

### 测试与 fixtures
- `tests/providers/fixtures/{company-profile,dimension-signals,ai-visibility,claims}.json`
  — 确定性 mock DeepSeek 输出,锚定 SAMPLE 的 evidence id。
- `tests/providers/deepseek-adapter.test.ts`(27)+ `stage-schema.test.ts`(3)
- `tests/analysis/{company-profile,dimension-scoring,ai-visibility,claims}.test.ts`(4+6+6+6)
- `tests/report-generation/{score-seam,assemble-report}.test.ts`(5+7)

## 2. Commit 哈希(小步多次,均本地,**未 push**)
- `385b1e0` feat(deepseek): adapter + error classification
- `621644d` feat(analysis): 4 阶段分析函数 + fixtures
- `5d9d831` feat(report-gen): assemble + score seam

## 3. Gate 结果
- `pnpm typecheck` — **绿**。
- `pnpm vitest run tests/providers tests/analysis tests/report-generation` — **绿,64/64**。
- 全量 `pnpm vitest run` — **绿,65/65**(含基线 contracts 测试)。
- `pnpm lint` — **红,但与本 Agent 无关**:`eslint-config-next` 无法解析
  `@next/eslint-plugin-next`(未 hoist 到顶层 node_modules),在**加载配置阶段**即失败,
  未触及任何源文件。eslint 配置 / package.json / pnpm-lock 均 Supervisor 独占,需
  Supervisor 修复(基线曾有 `764283b` 做过同类 hoist 修复,此 worktree 需同样处理)。

## 4. 与其它 Agent 的接缝与假设

### 与 Agent B(评分 Guard)
- **评分接缝**:`src/report/generation/score-seam.ts` 的 `computeOverall` 是**临时**实现,
  已标注 `// INTEGRATION SEAM (Agent B score-calculator) — replace at integration`。
  集成时 Supervisor 换成 B 的 `src/report/validation/score-calculator.ts`。函数签名:
  输入 5 个 `ScoreDimension`,输出 `{overallScore, scoreCoverage}`。已用 SAMPLE 复现
  `59.15 / coverage 1.0` 做锚点测试。
- **Evidence Semantic Guard 接缝**:我只保证结构合法 + 引用完整(所有 evidenceId 存在)
  + 无 `array[0]` 兜底 + claim 无证据即丢弃。B 的语义支持阈值(核心问题≥1 DIRECT、优势
  ≥1 DIRECT 或 2 PARTIAL、机会同理、CONTEXT_ONLY 不单独支撑、≥3 机会复用同一 evidence
  集合阻止发布等)由 B 在发布 Guard 强制,**我不实现**。

### 与 Agent C(搜索 / 抓取 / Evidence)
- **Evidence 输入接缝**:所有分析函数消费 `EvidenceItem[]`(即 `src/contracts` 的
  canonical `EvidenceItem`,含 `id/sourceType/supportLevel/authorityLevel/url` 等)。
  假设:C 产出的 `EvidenceItem.id` 稳定且唯一;`supportLevel`/`sourceType` 已按
  PRODUCT_TRUTH_RULES 赋值(我用它们判定 MEASURED/ESTIMATED 与 confidence)。未知 id
  一律过滤,不构成硬错误。测试用 `SAMPLE_DIAGNOSIS_REPORT.evidence` 作为 C 的替身。

### 与 Agent E(Runtime / Storage / API / Orchestration)
- **编排接缝**:`buildReportFromStageOutputs` 只消费**已获取**的各阶段 DeepSeek JSON 与
  evidence;**真实 Provider 调用、重试、预算、Checkpoint 恢复归 E**
  (`src/diagnosis/orchestration/`)。`diagnosisId/publicToken/generatedAt`
  (`ReportIdentity`)与 `AiVisibilityInput.testedAt/modelUsed` 由 E 注入,我不臆造。
- E 可直接用注入的 `createDeepSeekProvider(deepSeekConfigFromEnv(), {fetch})`
  逐阶段调用,再把 `json` 交给我的 `buildReportFromStageOutputs`。

### 与 Agent F(前端 / 展示)
- 我只产出 canonical `DiagnosisReport`。Quick/Deep/Evidence 视图、AI 可见度人类可读理由、
  URL 清洗均在 F 的 `ReportPresentationService`,**不在本 Agent**。`ScoreDimension` 无
  reason 字段,故无「LLM 自由生成理由」风险。

## 5. 设计决策 / 假设(供复核)
- 分数「程序化」= 模型仅输出离散信号(rubric PRESENT/PARTIAL/ABSENT、答案文本、自评
  accuracy/recommendation),数字分由本地公式派生;模型从不输出 72/51 之类数字或百分比。
- rubric 固定键决定分数:模型漏报的 criterion 记 ABSENT,分数不随返回条数漂移。
- measurementStatus/confidence 用自定义、可辩护的程序化公式,**未**刻意复刻 SAMPLE 的
  示例数值(SAMPLE 数值仅作形状锚点)。report-generation 测试断言的是「内部一致性」
  (overallScore 由维度分经 seam 公式得出)与形状对齐,而非硬编码 59.15。
- 由本轮 fixtures 得到的示例报告:companyClarity=75 / websiteCompleteness=60 /
  customerQuestionCoverage=25 / trustEvidence=25 / aiVisibility=51 →
  overallScore=45.9 / coverage=1.0(与 SAMPLE 形状同构、字段齐全)。

## 6. 遗留问题
1. **lint gate 环境问题**(见 §3):需 Supervisor 在共享配置层 hoist
   `@next/eslint-plugin-next`。非本 Agent 可改文件。
2. 评分与 AI 可见度公式的**常数**(confidence 权重、ESTIMATED 上限 0.6、
   `0.13*validCount`、`0.4+0.08*validCount`)为 V1 合理取值,集成后可与 A/B 对齐微调
   (不改变契约,只改常数)。
3. 集成时:`score-seam.computeOverall` 替换为 B 的实现后,需重跑
   `tests/report-generation` 确认锚点数值不变。
4. 未新增任何运行时依赖(仅用既有 `zod` 与 dev 的 `vitest`),故未创建 DEPENDENCIES.md。
