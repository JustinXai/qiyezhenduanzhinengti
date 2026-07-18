# Agent C — CHECKPOINT (Round-1 Mock Vertical Slice)

分支 `cursor/rebuild-search-evidence`，基线 `31972e3`。全部 Mock，未做任何真实网络调用。

## 交付文件

实现（均在所有权范围内）：

- `src/providers/bocha/bocha-adapter.ts` — `WebSearchProvider` 适配器
- `src/diagnosis/search/query-planner.ts` — 确定性检索 Query 规划
- `src/diagnosis/evidence/normalize.ts` — `WebSearchResultItem[] → EvidenceItem[]`
- `src/security/crawler/ssrf-guard.ts` — 纯 URL/IP 分类 SSRF 防护
- `src/security/crawler/guarded-crawler.ts` — 受控 crawler（手工重定向 + DNS 复检 + 各类限额）

测试：

- `tests/search/query-planner.test.ts`（11）
- `tests/search/bocha-adapter.test.ts`（15）
- `tests/evidence/normalize.test.ts`（12）
- `tests/security/crawler/ssrf-guard.test.ts`（42）
- `tests/security/crawler/guarded-crawler.test.ts`（16）

## Commit（小步、未 push）

- `a7bf62c` feat(search): deterministic query planner from CompanyProfile
- `2ca1f48` feat(evidence): normalize WebSearchResultItem[] to EvidenceItem[]
- `15c5538` feat(security): SSRF guard + guarded crawler
- `43fd800` feat(bocha): WebSearchProvider adapter with error classification + retries

## Gate 结果

- `pnpm typecheck` → PASS（0 error）
- `pnpm lint` → PASS（0 error）
- `pnpm vitest run` → PASS（6 files / 97 tests，含基线 contracts 测试）
- 改动文件全部落在 Agent C 所有权目录，未触碰 `src/contracts/index.ts`、`src/fixtures/`、`src/providers/types.ts`、共享配置或其他 Agent 目录。
- 无新增依赖（仅用 zod 类型只读引用 + Node 内置 `node:dns/promises`），无需 `DEPENDENCIES.md`。

## 接缝说明

### 给 Agent D（Evidence 输入形状）

`normalizeEvidence(items, ctx)` 产出的 `EvidenceItem[]` 已通过 canonical `EvidenceItem` schema 校验，可直接进入诊断引擎。默认值约定（D 的 Evidence Semantic Guard 需据此细化）：

- `supportLevel` 一律默认 `CONTEXT_ONLY`——normalize 阶段没有具体 claim，不做支持度臆测（避免虚假精度）。真正的 per-claim 支持度由 D 判定。
- `authorityLevel`：企业/竞品自有域名 = `OWNED`；其余 = `MEDIA`。
- `sourceType` 仅按域名判定：`FIRST_PARTY_EVIDENCE`（命中 `companyDomains`）/ `COMPETITOR_WEB_EVIDENCE`（命中 `competitorDomains`）/ 否则 `OBSERVED_WEB_EVIDENCE`。绝不从 snippet/title 里的竞品名反推 COMPETITOR。
- `id` = `ev_` + URL 的 FNV-1a（去 fragment、host 小写后）稳定哈希；同一 URL → 同一 id。
- 已按去 fragment 的 canonical URL 去重（保留首次出现）；非法/非 http(s) URL 会被丢弃，保证输出恒可校验。

### 给 Agent E（Orchestration 调用签名）

```ts
// 1) 规划检索
import { planSearchQueries } from "src/diagnosis/search/query-planner";
planSearchQueries(profile: CompanyProfile, opts?: { maxTotal?: number }): PlannedQuery[]
//   PlannedQuery = { query: string; category: "BRAND_DIRECT"|"PURCHASE_DECISION"|"COMPETITOR_COMPARISON" }

// 2) 博查搜索（Round-2 真实前保持注入 mock fetch）
import { createBochaProvider } from "src/providers/bocha/bocha-adapter";
const bocha = createBochaProvider({ apiKey?, fetchImpl?, maxRetries?, retryBaseDelayMs?, timeoutMs?, sleep?, now? });
await bocha.search(query, { limit }): Promise<{ok:true; results} | {ok:false; error: ProviderFailure}>
//   端点写死 https://api.bocha.cn/v1/web-search；无 apiKey 直接返回 PROVIDER_AUTH_FAILED（不发请求）

// 3) 受控抓取
import { createGuardedCrawler } from "src/security/crawler/guarded-crawler";
const crawler = createGuardedCrawler({ fetchImpl?, resolveHost?, maxRedirects?, maxBodyBytes?, timeoutMs?, allowedContentTypes?, userAgent? });
await crawler.crawl(url): Promise<CrawlOutcome>   // ok=true 时含 finalUrl/status/contentType/body/redirectChain

// 4) 规范化为 Evidence
import { normalizeEvidence } from "src/diagnosis/evidence/normalize";
normalizeEvidence(items: WebSearchResultItem[], ctx: {
  companyDomains: string[];        // 由 profile.website 的 host 推出
  competitorDomains?: string[];    // 见遗留问题①
}): EvidenceItem[]
```

编排注意：`bocha`/`crawler` 的重试/超时/DNS 由内部封装；E 只需保证 Round-1 一律注入 mock `fetchImpl`（crawler 还需注入 `resolveHost`）以杜绝真连。

## 遗留问题 / 需 Supervisor 决策

1. **竞品域名缺失**：`CompanyProfile` 只有 `competitors`（名称），没有竞品域名。`normalizeEvidence` 的 COMPETITOR 判定依赖 `competitorDomains`；未提供时竞品站点会退化为 `OBSERVED`。需要 Orchestration（E）或 Profile（A）补一步「竞品名→域名」解析，否则竞品证据无法被正确标注。
2. **BOCHA_BASE_URL 分歧**：`PROVIDER_RELIABILITY_CONTRACT.md` 提到 `BOCHA_BASE_URL` 可配；本适配器按 AGENTS.md §5 与任务「端点写死」将 endpoint 冻结为常量，**不**读取 `BOCHA_BASE_URL`（更强的「绝不打非博查源」保证）。如需可配请 Supervisor 明确取舍。
3. **博查请求/响应体形状为假设值**：按公开文档假设请求 `{query,count,summary}`、响应 `data.webPages.value[].{name,url,summary,snippet,siteName,dateLastCrawled}`。Round-2 真实样本前需对齐真实 API；解析已做防御性处理（缺字段回退、空结果=成功、非对象=INVALID_RESPONSE_SHAPE）。
4. **默认 `resolveHost` 使用 `node:dns/promises`**：仅生产路径使用；全部单测均注入 `resolveHost`/`fetchImpl`，不触发真实 DNS/网络。
