READY_FOR_COMPETITOR_RESOLUTION_INTEGRATION

# Agent I — CHECKPOINT (竞品实体与官方域名解析)

分支 `cursor/competitor-entity-resolution`,基线 `b0e36dd`。全部 Mock,零真实博查/DeepSeek/网络调用。
未改 `.env`,未设 `DIAGNOSIS_SMOKE_MODE=false`,未合 main,未运行真实 diagnosis。

## 交付文件

新增(所有权内):
- `src/diagnosis/competitors/types.ts` — `CompetitorResolution` / `CompetitorResolutionResult` / 状态枚举 / `CONFIRMED_STATUSES`
- `src/diagnosis/competitors/resolve.ts` — `resolveCompetitors()` 解析核心(URL/SSRF 校验 + mock 搜索识别)
- `src/diagnosis/competitors/mock-search.ts` — 确定性 mock 竞品域名搜索 provider + `SCENARIO_COMPETITOR_DATASET`
- `src/diagnosis/competitors/index.ts` — barrel

修改(所有权内):
- `src/runtime/diagnosis-input.ts` — 扩展 `CompetitorInput`(`string | {name, website?}`),向后兼容 `string[]`;新增 `competitorInputName/competitorInputWebsite/competitorNames` helper
- `src/diagnosis/search/query-planner.ts` — 新增 `buildCompetitorDomainQueries` / `planCompetitorDomainResolutionQueries`(官方域名解析 Query,`COMPETITOR_DOMAIN_RESOLUTION` 类目);`planSearchQueries` 接收 `competitorResolutions`,为已确认竞品追加 `site:<domain>` 域内查询(无解析入参时输出字节级不变)
- `src/diagnosis/orchestration/live-seams.ts` — **删除固定场景竞品域名分类**(原 `competitorDomains: [SCENARIO_COMPETITOR_HOST]`),改为解析产出的 `resolvedDomains`;合并解析证据入证据集;竞品差距按"是否存在已确认竞品证据"门控

测试 + fixtures:
- `tests/diagnosis/competitors/resolve.test.ts`(19)
- `tests/diagnosis/orchestration/live-seams.test.ts`(6)
- `tests/runtime/diagnosis-input.test.ts`(9)
- `tests/search/query-planner.test.ts`(+9,共 17)
- `tests/fixtures/competitor-inputs.ts` — 覆盖矩阵 fixture

## 职责映射

1. CompetitorInput 兼容(仅名称 / 名称+用户官网)✅
2. `CompetitorResolution` 含 `name, providedDomain, resolvedDomain, status, confidence, evidenceIds, resolutionReason`(+`candidateDomains`)✅
3. 生成官方域名解析 Query ✅
4. 识别官方网站(搜索结果 + 官网标记,分组去歧义)✅
5. 保留解析证据(复用 Agent C `normalizeEvidence` → 规范 `EvidenceItem[]`,合并入报告证据集)✅
6. 解析结果传给 Query Planner ✅
7. 删除固定场景竞品域名 ✅

状态枚举:`USER_CONFIRMED / RESOLVED / AMBIGUOUS / NOT_FOUND / INVALID_DOMAIN` 全部实现并测试。

## 规则遵守

- 用户提供域名 → 复用 `assertUrlAllowed`(SSRF)校验:通过→`USER_CONFIRMED`,拒绝(私网/loopback/metadata/非 http/带凭证/非法)→`INVALID_DOMAIN`
- 仅名称 → mock 搜索识别;**绝不按品牌名拼接 `.com`**(仅采信搜索结果中真实出现的 host)
- 同名多企业(多个官网候选)→ `AMBIGUOUS`,不产出 `resolvedDomain`
- 无法确认 → 不生成确定性竞品差距(live-seams 门控 + `buildCompetitorGaps` 引用完整性双保险)
- 每个输入必有状态,按名去重后 1:1,**不静默丢弃**

## Mock Fixture 覆盖(零真实调用)

GoPro→gopro.com / 大疆 DJI→dji.com / Moka→mokahr.com / SAP SuccessFactors→sap.com(均 RESOLVED);
星辰科技(AMBIGUOUS,双候选);云雀未知企业(NOT_FOUND);competitor-demo.example.net(USER_CONFIRMED);
`http://192.168.10.5/admin`(INVALID_DOMAIN)。

## Gate 结果

- `pnpm typecheck` — PASS
- `pnpm test`(vitest) — PASS(31 files / 340 tests;基线 300 → 全绿,零回归)
- `pnpm lint` — PASS
- `pnpm security:check` — OK(SSRF WARNING 为 crawler 源既有告警,非本任务范围;总判定 clean)
- 工作区干净,已 push `origin cursor/competitor-entity-resolution`

## Commit

- `857d18b` feat(competitors): resolve official domains from evidence; drop hard-coded scenario host

## 接缝 / 与其他 Agent

### 与 H(live-seams)冲突点
- H 若也改 `src/diagnosis/orchestration/live-seams.ts`,将与本次冲突。关键改动点:
  - `createLiveEvidencePipeline(bocha, competitorSearch)` 新增第二个可选参数(默认 mock 竞品搜索);签名向后兼容。
  - `SearchData` 新增 `resolutionEvidence` / `resolutions` 字段;`search()` 先跑 `resolveCompetitors` 再规划查询;`normalize()` 合并解析证据。
  - 删除了 `competitorDomains: [SCENARIO_COMPETITOR_HOST]` 硬编码分类(`SCENARIO_COMPETITOR_HOST` 常量保留,仅用于构造 mock 搜索页,已加注释说明不再是分类捷径)。
- 真实接线时:把 `competitorSearch` 换成真实博查 provider,把 `assertUrlAllowed` 保持默认真实 guard 即可,`resolveCompetitors` 接口不变。

### 与 Query Planner(Agent C)
- `planSearchQueries` 第二参数新增 `competitorResolutions`;不传时行为字节级不变(已加回归测试)。`QueryCategory` 新增 `COMPETITOR_DOMAIN_RESOLUTION`,仅由专用函数产出,不混入默认计划。
- `resolve.ts` 复用 C 的 `buildCompetitorDomainQueries` 与 `normalizeEvidence`(只读引用,未改 C 的文件)。

### 与 Guard(Agent C ssrf-guard)
- 直接复用 `assertUrlAllowed` 做用户域名结构校验(拒私网/loopback/metadata/非 http/凭证)。DNS 名仅做结构校验,真实抓取时仍需 crawler 的解析后复检(DNS rebinding),本任务未触达抓取。

## 遗留 / 待集成决策(交 Supervisor)

1. **name↔domain 精确映射未跨 seam 传递**:`ReportProducerContext` 仅含 `{input, evidence}`(Agent E 所有权),`createLiveReportProducer` 拿不到 `resolutions`。当前竞品差距的归属:优先用"用户提供官网 host 匹配竞品证据域名"精确归属;否则回退到首个竞品名 + 首条竞品证据。多竞品、name-only RESOLVED 的精确名↔域映射建议在真实集成时把 `CompetitorResolution[]` 透传给 producer(需 Agent E 扩展 `ReportProducerContext`)。
2. **CompanyProfile.competitors 仍是 `string[]`(冻结契约)**:解析出的 `resolvedDomain/status` 未进入 Canonical 报告结构。若产品需在报告中展示每个竞品的解析状态,需 Supervisor 决策是否扩展契约(当前仅通过证据分类与竞品差距间接体现)。
3. **官网识别启发式**:目前以"标题/摘要含官网标记(官网/官方网站/official site)"聚合候选 host。真实博查结果若缺少此类标记可能偏保守(→ NOT_FOUND)。真实接线时可按需增强(权威域名、置信度阈值),接口无需变更。
4. **解析用量计费**:`search()` 增加了一条 `bocha/SEARCHING` 用量样本(name-only 解析调用数),真实计费口径待与 Agent E 对齐。
