# COMPETITOR_RESOLUTION — 竞品实体与官方域名解析(Round-3 冻结)

## 1. 输入

`CompetitorInput = string | { name: string; website?: string }`。向后兼容:纯 `string[]` 仍合法(`src/runtime/diagnosis-input.ts`)。

## 2. 结果 `CompetitorResolution`

`name, providedDomain, resolvedDomain, status, confidence, evidenceIds, resolutionReason, candidateDomains`。

## 3. 状态

| 状态 | 含义 |
|---|---|
| `USER_CONFIRMED` | 用户提供且通过安全校验的官网域名 |
| `RESOLVED` | 仅名称,经搜索识别出唯一官方域名 |
| `AMBIGUOUS` | 同名对应多个实体/域名,无法确定 |
| `NOT_FOUND` | 未能找到官方域名 |
| `INVALID_DOMAIN` | 用户提供的域名非法/私网/非 http(s)(SSRF 校验拒绝) |

## 4. 规则(不得回退)

- 用户提供域名优先,但必须过 `assertUrlAllowed`(复用 SSRF 校验,拒 loopback/私网/metadata/非 http(s));
- 仅名称时经 **mock 搜索**识别(本轮无真实网络);
- **禁止**由品牌名字符串直接拼接 `.com`;仅信任真实搜索结果中出现的 host;
- 同名多实体 → `AMBIGUOUS`;
- 无法确认(AMBIGUOUS/NOT_FOUND/INVALID_DOMAIN)→ **不得生成确定性竞品差距**;
- 每个输入竞品都产出一个状态,**不得静默丢弃**;
- 删除了固定场景竞品域名;竞品证据分类的 `competitorDomains` 来自解析结果 `resolvedDomains`。

## 5. 与下游接缝

- Query Planner 接收 `competitorResolutions`,为已确认竞品生成域名限定的对比查询;
- 解析证据(竞品官方页)并入 Evidence 集合,去重;
- 竞品差距(competitorGap)仅在存在 `COMPETITOR_WEB_EVIDENCE` 时生成(见 live-seams `scenarioCompetitorGaps`)。

Fixtures 覆盖:GoPro、大疆 DJI、Moka、SAP SuccessFactors、同名歧义、无法找到、用户提供非法私网 URL(`tests/diagnosis/competitors/`、`tests/fixtures/competitor-inputs.ts`)。

## 6. 已知待办(下一阶段)

`CompanyProfile.competitors` 仍为 `string[]`;解析状态尚未进入 Canonical 报告/持久化,仅在 pipeline 内可见。若需对客/审计展示解析状态,需契约决策。
