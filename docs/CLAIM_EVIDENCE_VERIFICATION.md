# CLAIM_EVIDENCE_VERIFICATION — 语义支持验证与发布边界(Round-3 冻结)

## 1. 职责分离(不得回退)

| 层 | 只负责 | 绝不 |
|---|---|---|
| **C 搜索/Evidence** | 来源类型、正文、URL、权威度、抓取时间、Evidence Registry | 判断"某证据是否语义支持某 Claim" |
| **D 诊断** | 生成 Claim + **候选** Claim–Evidence 链接 | 决定最终支持等级或 READY |
| **ClaimEvidenceVerifier** | 逐个 (Claim, Evidence) pair 判定语义支持等级 | 创建证据 / 改 Claim / 返回 URL / 决定 CTA / 决定评分 / 绕过 Guard |
| **B 发布 Guard** | 基于已验证关系做确定性发布裁决 | 用来源权威度代替语义支持 |
| **F 展示** | Quick/Deep/Evidence 渲染 | 重算分数 / 支持等级 / AI 可见度 |

`EvidenceItem.supportLevel`(Canonical 报告内)是**归一化时的来源属性默认值**,不表达"对某 Claim 的语义支持"。语义支持只存在于 `ClaimEvidenceRelation.supportLevel`。

## 2. 数据流

```
Evidence Registry
→ Candidate Claims(D)
→ Candidate Claim–Evidence Links(D)
→ Structured Semantic Verification(Verifier,逐 pair 产生 RawVerdict)
→ Deterministic Clamp(clamp.ts,来源/极性/coverage 前置裁剪)
→ Persisted ClaimEvidenceRelations
→ Claim Pruning(§六,支持不足者移除)
→ Deterministic Publish Guard(B)
→ Canonical Report → Storage → Public API → Quick/Deep/Evidence
```

模型输出**永不直接决定 READY**:任何 RawVerdict 必过 `clampVerdict`。DeepSeek 判 DIRECT,但若确定性前置不满足则被降级或拒绝。

## 3. ClaimEvidenceRelation(`src/contracts/claim-evidence.ts`)

`claimId, claimKind, evidenceId, supportLevel, confidence, justification, basis, verifierMode, verifierVersion`。

支持等级**属于关系,不属于 Evidence 全局属性**:同一 Evidence 可对 Claim A = DIRECT_SUPPORT、对 Claim B = CONTEXT_ONLY、对 Claim C = UNSUPPORTED(`tests/verification/relation-per-pair.test.ts`)。

`verifierMode`:`MOCK_DETERMINISTIC`(零 Provider 调用)/ `DEEPSEEK_STRUCTURED`(接口已实现,本轮不真实调用)。

## 4. 禁止的捷径(clamp.ts 强制)

- `first-party page => DIRECT`(永不;需内容匹配)
- `competitor page => DIRECT for the enterprise`(永不;至多 CONTEXT_ONLY)
- 用来源权威度代替语义支持度(永不)
- 单页直接证明负面/缺失(永不;仅测量边界背书)
- 负面/缺失 Claim 无 coverage 发布(拒绝 → CONTEXT_ONLY)

## 5. EvidenceCoverage 测量边界

`queryPlanId, plannedQueries, executedQueries, successfulQueries, failedQueries, searchedDomains, crawledPages, crawledFirstPartyUrls, firstPartyDomains, observedEvidenceIds, searchWindow, coverageLimitations, boundaryEstablished`。

`boundaryEstablished = 受控范围内首方页面 ≥1 且 已执行查询 ≥1`。An About page with an empty query plan does NOT establish a boundary。

## 6. 负面/缺失 Claim 政策(§六)

「官网缺少……」「未覆盖……」「本企业落后……」等:
- 必须有 EvidenceCoverage 且 `boundaryEstablished`;
- 由受控范围内首方页面提供 `MEASUREMENT_BOUNDARY` 支持,**至多 PARTIAL,永不 DIRECT**;
- 文案限定为「本次已检查的公开页面和搜索结果中未发现……」,不得写成无限范围绝对事实;
- 无 coverage 时:**验证后剪枝**(`prune-claims.ts`)直接移除,不进入 Quick 核心问题,报告在其它内容可信时仍 READY。

剪枝只作用于"支持不足"类规则(§4.1–§4.4);完整性(§4.6)、UNSUPPORTED(§4.5)、重复关系集(§4.8)仍为**硬拦截**。

## 7. Checkpoint 失效

`CLAIM_EVIDENCE_VERIFICATION` checkpoint key 覆盖:report(含 Claims + Evidence + 候选链接)、coverage、report/score 契约版本、verifier mode、verifier version、trust-guard(gate)version。以下任一变化即失效重验:Claim / Evidence / 候选关系 / Coverage / 模型 / Prompt / Verifier / Guard。

## 8. 公共边界

Public API 允许:简短支持标签(DIRECT/PARTIAL)、裁剪短说明、来源标题/域名/链接。
Public API **不得**返回:完整模型 justification、Verifier 完整 Prompt、Provider 完整响应、内部 Verifier version、Provider requestId、Token 预算、Checkpoint、内部置信度推理、调试堆栈。关系持久化于独立表 `claim_evidence_relations`,不进入 Canonical 报告 payload(`tests/canary` + `tests/runtime/provider-mode.test.ts` 断言无泄漏)。
