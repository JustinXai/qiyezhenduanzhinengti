# Claims Model Shadow A/B V1

状态：`COMPLETED_READ_ONLY_SHADOW`

本次只对三家冻结输入执行 Claims 阶段，顺序固定为洽洽 Flash/Pro、科大讯飞
Flash/Pro、安徽合力 Flash/Pro。总调用 6，Flash 3、Pro 3，retries=0；Bocha、Crawler、
其他分析阶段、Canonical 写入和新 Diagnosis 均为 0。两组使用同一 Prompt、Schema、Evidence
顺序、4096 token 上限、temperature=0、thinking=disabled、Candidate Builder 和 Truth Policy。

原始响应和完整 Prompt 未持久化。私有脱敏产物：
`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\claims-model-shadow-ab-v1.json`，
SHA-256 `5C72DD4C16F968FA37B406DEB48543633071F773B67DB54EEEF84827498CB5FB`。

## 聚合结果

| 指标 | Flash | Pro |
| --- | ---: | ---: |
| Schema 通过 | 3/3 | 3/3 |
| Strength Candidate | 6 | 6 |
| Issue Candidate | 9 | 9 |
| Opportunity Candidate | 9 | 9 |
| Demonstration Fix Candidate | 2 | 0 |
| 无效 Evidence ID | 0 | 0 |
| 无效 sourceIssueId | 0 | 0 |
| Coverage 前缀缺失 | 0 | 0 |
| 禁用文案 | 0 | 0 |
| 通用模板 Candidate | 0 | 0 |
| 竞品断言硬违规 | 2 | 2 |
| 可发布 Issue + Opportunity + Demo | 0 | 0 |
| 总延迟 | 57,099 ms | 112,060 ms |
| 平均延迟 | 19,033 ms | 37,353 ms |
| 输入 tokens | 16,966 | 16,966 |
| 输出 tokens | 4,989 | 5,170 |

两种模型都把原先返回空 Candidate 的安徽合力扩展为 2 Strength、3 Issue、3 Opportunity；
但这些是新语义 Candidate，未执行新的 Claim–Evidence Verifier，因此不能借用历史位置 ID
对应的 relation，也不能算作可发布增量。历史 relation 仅在 Shadow Candidate 与 latest
Canonical 同 ID 且完整语义一致时允许复用；本次复用数为 0。

## Pro 路由九项门槛

| 条件 | 结果 |
| --- | --- |
| 3/3 Schema 通过 | PASS |
| Truth 硬违规为 0 | FAIL（竞品断言 2） |
| 无效 Evidence ID 不高于 Flash | PASS（0 = 0） |
| 无效 sourceIssueId 不高于 Flash | PASS（0 = 0） |
| 通用模板不增加 | PASS（0 = 0） |
| 至少 2/3 企业可发布 Candidate 不低于 Flash | PASS（均为 0，但没有增益） |
| 三企业可发布 Issue + Opportunity + Demo 至少增加 2 | FAIL（0 → 0） |
| 增量不依赖放宽 Guard | PASS（Guard 未变） |
| 延迟和 token 完整记录 | PASS |

## 决策

`MODEL_DECISION=INSUFFICIENT_EVIDENCE_TO_SWITCH`

正式默认继续保持 `CLAIMS_MODEL_POLICY=FLASH`。本次不能推荐 Pro：它没有产生经同一 Truth
Policy 验证的可发布增量，仍有竞品断言硬违规，且平均延迟约为 Flash 的 1.96 倍。该结论
不表示 Flash 已解决产品产出问题；它只表示当前 3 家、每模型 3 次的样本不足以授权切换。

