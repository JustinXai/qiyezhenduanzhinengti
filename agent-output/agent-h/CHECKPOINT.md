# Agent H — Claim–Evidence 语义验证(架构重构)CHECKPOINT

READY_FOR_CLAIM_EVIDENCE_INTEGRATION

分支:`cursor/claim-evidence-verification`  基线:`b0e36dd`
最新提交:`44bdc9b`(HEAD)

## 1. 完成的目标架构

最终数据流已成立:

```
C: Evidence 采集 + 来源属性(sourceType/authorityLevel;supportLevel 退化为来源默认值)
D: Claim 生成 + 候选 ClaimEvidenceLinks(Claim.evidenceIds)
ClaimEvidenceVerifier(新阶段): 对每个 (Claim, Evidence) pair 判定支持等级 → ClaimEvidenceRelation[]
B: 确定性发布 Guard(最终裁决)—— 以 Relation + Coverage 为唯一依据,模型输出不能决定 READY
```

链路:Evidence Registry → Candidate Claims → Candidate ClaimEvidenceLinks →
`CLAIM_EVIDENCE_VERIFICATION`(结构化语义验证 + 确定性 clamp) → Deterministic
Validation(Zod canonical + publishGuard) → Persisted ClaimEvidenceRelations
→ Publish Guard → Canonical Report。

状态机(已同步 docs/ARCHITECTURE.md):
`… → ANALYZING → CLAIM_EVIDENCE_VERIFICATION → VALIDATING_REPORT → READY | FAILED`

## 2. 九项职责落实

1. **来源属性与支持属性分离**:`EvidenceItem.supportLevel` 仅为来源默认值(normalize 统一 `CONTEXT_ONLY`),语义支持进入 `ClaimEvidenceRelation.supportLevel`。§4 裁决不再读 `EvidenceItem.supportLevel`。
2. **ClaimEvidenceRelation**:含 `claimId, claimKind, evidenceId, supportLevel, confidence, justification, basis, verifierMode, verifierVersion`(`src/contracts/claim-evidence.ts`)。
3. **新增 CLAIM_EVIDENCE_VERIFICATION 阶段**(ANALYZING 与 VALIDATING_REPORT 之间),`state-machine.ts`。
4. **Mock 模式确定性 Verifier**:`createDeterministicVerifier`,零 Provider 调用(内容重叠信号 + 共享 clamp)。
5. **真实模式 DeepSeek 结构化 Verifier**:`createDeepSeekVerifierStrategy` + `src/providers/deepseek/verifier-adapter.ts`;**本轮未真实调用**(仅 mock provider 单测)。
6. **publishGuard 用 Relation 裁决**:`evidenceGuard({report, relations, coverage})`;§4 全部改为基于 Relation。
7. **删除 `assessSupport`**:live-seams 里 first-party/竞品页面自动 DIRECT 的来源权威度短路已移除。
8. **Checkpoint + 预算接缝**:verifier usage 计入 `provider_usage`;验证阶段 checkpoint 以 `verifierMode + verifierVersion + gateVersion` 为键,版本变化即失效重算。
9. **关系级可追溯**:每条 Relation 带 `verifierMode/verifierVersion/basis/justification`,持久化到 `claim_evidence_relations` 表。

## 3. 负面/缺失型 Claim 规则(硬要求)

- polarity 由 `classifyPolarity`(claim 文本 + kind)确定性判定;负面标记(缺少/未/没有/落后/无…)→ `NEGATIVE_MISSING`。
- 负面/缺失 Claim **绝不由单页 DIRECT 证明**。其支持来自“测量边界”`EvidenceCoverage`(已执行 Query Plan + 受控首方抓取范围 + Evidence coverage),基于**范围内首方页面的 scope membership**给出 `PARTIAL_SUPPORT` + `basis=MEASUREMENT_BOUNDARY`,表述被限制为“本次已检查的公开页面中未发现……”。
- **无 coverage(boundary 未建立)→ 拒绝发布**(Guard 触发 §4.1/§4.3;clamp 降级为 `CONTEXT_ONLY`)。
- 竞品证据/第三方证据对“本企业缺失/落后”只给 `CONTEXT_ONLY`,不能单独支撑。

## 4. Verifier 边界(均已强制)

不创建 Evidence(referential integrity 网关)、不改 Claim(只读提取)、不返回 URL、不决定 CTA/评分、不绕过 Guard。模型判定**永远经过共享确定性 clamp**;模型返回候选集外的 Evidence ID → `verifyReport.ok=false` → 阶段失败。

## 5. 文件清单

新增:
- `src/contracts/claim-evidence.ts` — ClaimEvidenceRelation / EvidenceCoverage / 枚举 / `deriveCoverage`。
- `src/diagnosis/verification/{classify,clamp,deterministic-verifier,deepseek-verifier,verify-report,types,index}.ts`。
- `src/providers/deepseek/verifier-adapter.ts` — 纯 prompt/parse 助手(无网络)。
- `tests/verification/{clamp,verify-report,deepseek-verifier,coverage}.test.ts`。

修改:
- `src/report/validation/{evidence-guard,publish-guard,index}.ts` — Relation-based §4。
- `src/diagnosis/orchestration/{state-machine,live-seams}.ts` — 新阶段 + coverage + 删除 assessSupport。
- `src/diagnosis/verification/verify-report.ts` — 对未 canonical 报告防御。
- `src/storage/{schema,adapter,sqlite-adapter}.ts` — 新表 `claim_evidence_relations`(additive)+ 可选 save/get + `DiagnosisStatus` 新增成员。
- `docs/ARCHITECTURE.md` — 状态机更新。
- `tests/{report-validation/*, runtime/state-machine, storage/*}` — 适配 + 新增覆盖。

## 6. Commit 哈希

- `864d8d2` feat(verification): ClaimEvidenceRelation contracts + deterministic/DeepSeek verifiers
- `44bdc9b` feat(pipeline): relation-based publish guard + CLAIM_EVIDENCE_VERIFICATION stage

均已 push 到 `origin/cursor/claim-evidence-verification`。工作区干净。

## 7. Gate 结果

- `pnpm typecheck` ✅ 干净
- `pnpm lint` ✅ 干净
- `pnpm vitest run` ✅ 328 passed / 32 files(其中验证+守卫新增 ~40 项)
- `pnpm smoke:mock` ✅ 7 步全绿,无真实 Provider

硬约束遵守:未调用真实博查/DeepSeek;未改 `.env`;`DIAGNOSIS_SMOKE_MODE` 未动;未合 main;未提交 `.env/.sqlite/.db/密钥/真实 artifact`。

## 8. 12 项测试映射

| # | 场景 | 测试 |
|---|---|---|
| 1 | 首方 About 不能 DIRECT 支持采购缺失 | clamp: negative first-party → PARTIAL(MEASUREMENT_BOUNDARY),非 DIRECT |
| 2 | 首方产品页可 DIRECT 支持产品能力 | clamp + verify-report: 正向能力 first-party → DIRECT |
| 3 | 第三方新闻只能部分支持企业能力 | clamp: OBSERVED 上限 PARTIAL |
| 4 | 竞品页支持竞品事实,但不能单独支持“本企业落后” | clamp: 竞品事实 DIRECT;企业负面 + 竞品证据 → CONTEXT_ONLY |
| 5 | Evidence ID 不存在 → 失败 | verify-report + evidence-guard §4.6 |
| 6 | 模型返回非法 Evidence ID → 失败 | deepseek-verifier: 非法 id → ok=false |
| 7 | 模型判 DIRECT 但前置不满足 → 降级/拒绝 | clamp + deepseek-verifier: DIRECT 被 clamp 降级 |
| 8 | 负面缺失 Claim 无 coverage → 拒绝 | clamp + evidence-guard: 无 boundary → 拒绝 |
| 9 | 三机会复用相同关系集 → 拒绝 | evidence-guard §4.8(按 relation 签名) |
| 10 | Mock 零 Provider 调用 | verify-report: usage callCount=0 |
| 11 | Checkpoint 版本变化 → 失效 | state-machine: verifier 版本变更后重算 |
| 12 | Verifier 调用计入预算 | deepseek-verifier + state-machine: usage stage=CLAIM_EVIDENCE_VERIFICATION |

## 9. 与 C/D/E/B/live-seams 的接缝与假设

- **与 C(evidence)**:normalize 继续输出 `CONTEXT_ONLY` 来源默认值——保持不变,现在语义正确(来源属性而非语义支持)。`live-seams` 的 `normalize` 额外返回 `EvidenceCoverage`(新增可选字段于 `NormalizedEvidenceResult.coverage`)。真实 C 集成时,建议由真实 Query Planner/Crawler 提供 `executedQueries` 与受控首方 URL 列表填充 coverage;缺省时 state-machine 从 evidence + 请求域名派生。
- **与 D(analysis/claims)**:D 继续产出候选 `evidenceIds`(候选 Links),**不再负责**每条 claim 的支持等级。假设 D 的 claim 仍带可判 polarity 的中文文本(statement/impact/fixDirection/contentGap 等)——`classifyPolarity` 依赖文本负面标记。若 D 改为结构化 polarity 字段,可后续把该字段接入 `classifyPolarity` 以更稳。
- **与 E(orchestration/storage)**:新增阶段完全在 state-machine 内;`OrchestratorDeps.verifier?` 可注入真实策略,默认确定性。Storage 新方法为**可选**,现有 in-memory 测试替身无需改动即可编译。`DiagnosisStatus` 新增成员为 additive。
- **与 B(guards)**:`publishGuard` 签名新增 `relations` + `coverage`(必填)。§4 规则码复用现有 `TRUTH_4_*`(未改 `guard-types.ts`,保持 Agent B 所有权边界);coverage 拒绝复用 `TRUTH_4_1/4_3`,负面仅 context 复用 `TRUTH_4_4`。若 Supervisor 希望有专用码(如 `TRUTH_NEGATIVE_NO_COVERAGE`),需 Agent B 在 `guard-types.ts` 追加——见下方建议。
- **与 live-seams**:`assessSupport` 已删除;场景 producer 直接透传 evidence(CONTEXT_ONLY)。真实 report producer(D)集成时无需再关心 support level。

## 10. 假设与需 Supervisor 复核项

1. **Coverage 派生的宽松度**:`boundaryEstablished` 目前只要求“受控范围内 ≥1 首方页面被检查”。真实运行应同时要求 `executedQueries` 非空(live-seams 已提供);mock/派生路径以抓取范围为主信号。建议真实样本前确认此阈值是否足够严格。
2. **负面 claim 的 coverage 支持粒度**:采用“范围内任一首方页面”即计一条 `MEASUREMENT_BOUNDARY` 支持(不依赖内容重叠),语义为“已检查该公开面、未发现”。这是有意的边界语义,非权威度短路(basis 明确标注)。若需更细(要求负面 claim 命中“应包含该内容的页面类型”),需 D 提供页面类型信号。
3. **guard-types.ts 未改**:为不越权,新违规复用现有 §4 码 + message 区分。若需机器可读的“负面无 coverage”专用码,建议 Agent B 追加 1 个码。
4. **competitorGaps 未纳入 §4 硬门**(与既有行为一致),但已产出 Relation(可追溯 + 支撑测试 4)。

## 11. 遗留 BLOCKED

无。全部 gate 绿,工作区干净,已 push。真实 DeepSeek verifier 已实现接口,按硬约束本轮未真实调用——真实样本联调由 Supervisor 在满足前置(代码已 push、工作区干净、顺序执行)后统一编排。
