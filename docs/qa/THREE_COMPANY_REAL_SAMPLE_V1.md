# Round-6 Three-Company Real Sample V1

## 结论

`THREE_COMPANY_SAMPLE_STATUS=TRUTH_BLOCKER`

本轮只启动了一次获授权的串行批次。洽洽食品完成并进入 `READY` 后，Runner 以
`PRUNE_AUDIT_INCOMPLETE` 停止批次；科大讯飞与安徽合力未运行。没有删除锁、恢复批次、
重跑企业或修改历史 Canonical。只读取证进一步确认：审计“不完整”是 Runner 读取了空的
`analysis_stage_runs`，而实际候选保存在 `analysis_checkpoints/ANALYZING`；但已发布的竞品差距
`gap_1` 只引用两条普通网络证据，没有引用已抓取的竞品官网证据，因此仍构成独立的 Truth
Blocker。样本分支已增加前瞻性 Guard，历史报告及私有产物不回写。

## 批次与目标

| 顺序 | 企业 | 结果 | Diagnosis | 状态 | 耗时 |
| --- | --- | --- | --- | --- | --- |
| 1 | 洽洽食品 | 已运行，随后停止批次 | `diag_fb9` | READY | 58,950 ms |
| 2 | 科大讯飞 | NOT_RUN | — | — | — |
| 3 | 安徽合力 | NOT_RUN | — | — | — |

批次锁状态为 `STOPPED`，记录原因 `qiaqia:PRUNE_AUDIT_INCOMPLETE`。这是执行时事实；只读
取证结论不用于篡改锁或样本指标。

## 洽洽食品脱敏结果

### 技术与用量

- 语言 `zh-CN`；Quick / Deep / Evidence 均由同一 Canonical 投影；切换视图 Provider 增量 0。
- Quick 可见字符 362；390px 无横向溢出；打印截图成功；Public API 未发现内部字段泄漏。
- Bocha 9、Crawler 2（第一方 1、竞品 1）、DeepSeek 4、Retries 0；共 15 次真实 Provider/抓取调用。
- Schema、安全、评分权重、状态机、数据库与单公司 run-lock 均未报告异常。

### Evidence

- Evidence 36 条；中文 36 条，中文比例 100%。
- Tier A/B/C/D/E = `1/1/34/0/0`，五类合计 36。
- 发布内容使用 5 条 Evidence，利用率 `5/36 = 13.89%`。
- 来源类型：普通网络 34、第一方官网 1、竞品官网 1。

### Claims 与剪枝

- 分析候选 8 个：Strength 2、Issue 2、Opportunity 2、Competitor Gap 1、Demonstration Fix 1。
- 最终发布 2 个：Strength 1、Competitor Gap 1；Issue 0、Opportunity 0、Demonstration Fix null。
- 6 个被删候选对应 6 条 append-only `PruneDecision`，只读取证确认审计账实相符。
- 原因分布：`INSUFFICIENT_DIRECT_SUPPORT` 1、`MISSING_COVERAGE_PREFIX` 2、
  `INSUFFICIENT_INDEPENDENT_SUPPORT` 2、`INVALID_SOURCE_ISSUE_REFERENCE` 1。
- Issue `iss_1` 有 2 个独立 PARTIAL 来源但无 DIRECT，按固定 Issue 阈值删除；其余被删候选
  只有 CONTEXT 或缺少范围限定。
- 关系总数 18：PARTIAL 8、CONTEXT 10、DIRECT 0、UNSUPPORTED 0。

### Truth Blocker

公开 `gap_1` 对“三只松鼠官网公开展示详细 FAQ”作确定性表述，但它引用的两条 Evidence 均为
普通网络来源，没有引用本次已抓取的 `COMPETITOR_WEB_EVIDENCE`，也没有可用的竞品官网
Claim–Evidence 关系。执行时 Runner 未覆盖 `competitorGaps`，因此样本指标中的
`truthGuardViolation=false` 是漏检，不代表事实通过。前瞻性实现现在要求：竞品名称必须来自
用户提供的竞品，且竞品差距至少有一条 DIRECT/PARTIAL 的竞品官网证据关系，否则以
`UNVERIFIED_COMPETITOR_ASSERTION` 剪枝并由 `TRUTH_4_9` 阻断发布。

### 产品表现

- Overall Score 51.8，Score Coverage 100%；固定权重与 AI Visibility 公式未变。
- AI Visibility 测试 7 个，均为 VALID。
- `SPARSE_BUT_TRUTHFUL` 对 Issue 0、Opportunity 0、Demo null 本身分类正确；产品稀疏没有触发
  重跑。但竞品断言违规使整批不能继续。
- Quick CTA 保持冻结文案；Deep 不是完整 SOW；Evidence 视图可用。

## 科大讯飞与安徽合力

两家公司因前序公司触发批次停止规则而均为 `NOT_RUN`。没有 Diagnosis、Provider 调用、
截图或报告，也不以空值伪造验收结果。

## 十项聚合门槛

1. **FAIL** — 不是 3/3 Truth Guard 通过；洽洽存在竞品断言硬违规。
2. **FAIL** — 洽洽没有公开 UNSUPPORTED 关系，但仅完成 1/3，且存在另一类 Truth 违规。
3. **FAIL（批次）** — 洽洽 362 字通过，另外 2 家未运行。
4. **FAIL（批次）** — 洽洽视图切换增量 0，另外 2 家未运行。
5. **NOT_EVALUABLE / FAIL** — 洽洽无 Published Opportunity，无法完成三企业聚合血统验收。
6. **FAIL** — 0/3 企业有可信 Opportunity。
7. **FAIL** — 0/3 企业有可信 Demonstration Fix。
8. **NOT_EVALUABLE / FAIL** — 批次未完成，不能证明三企业通用模板候选总数为 0。
9. **PASS（契约）** — 产品契约仍不要求 3/3 都有 Opportunity。
10. **PASS（分类）** — 洽洽稀疏结果没有被误判为系统失败。

十项未全部通过，因此不得合入 integration、不得创建成功 Tag。

## 不变性与处置

- 新增真实 Diagnosis 1 个；不是计划值 3，因为严格停止规则优先。
- Insta360 真实 Diagnosis 总数仍为 2；V1/V2 数据库、run-lock、Canonical 与 revision 未改。
- `main` 未改；私有 SQLite、截图、日志、Provider 用量和原始响应未进入 Git。
- 未自动启动客户试用，未部署生产，未合入 main。
