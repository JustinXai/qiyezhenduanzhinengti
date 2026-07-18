# Technical Company Canary V1 — Round-5 (Insta360, single real diagnosis)

Desensitized result of the first REAL full-chain company diagnosis. Contains no
credentials, no prompts, no raw provider responses, no contact data, no
`publicToken` — short ids, aggregates, categories and hashes only.

- **Harness:** `scripts/technical-company-canary.ts` (one-shot runner + `--verify-only` re-serve)
- **Real seams:** `src/diagnosis/orchestration/real-seams.ts` (official adapters + guarded crawler
  wired into the unchanged state-machine seams; frozen `TECHNICAL_COMPANY_CANARY_V1` budget)
- **Stage prompts:** `src/diagnosis/analysis/stage-prompts.ts` (4 structured stages, evidence-grounded)
- **Guards:** `tests/canary/technical-canary-guard.test.ts` (20 cases: independent
  authorization gate, frozen budget rails, mocked-provider pipeline/producer behavior)
- **Private artifacts:** `E:\企业诊断智能体_private\technical-company-canary-v1`
  (isolated SQLite, summary, canonical report JSON, 5 screenshots, run logs)

## STATUS — TECHNICAL_CANARY_PASS

- **TARGET_COMPANY:** 影石Insta360 · https://www.insta360.com/ (non-customer, public info)
- **DIAGNOSIS_ID (short):** `diag_432` · **FINAL_STATE:** READY · **REAL_DIAGNOSES:** 1
- **State chain:** CREATED → VALIDATING → SEARCHING → CRAWLING → NORMALIZING_EVIDENCE
  → ANALYZING → CLAIM_EVIDENCE_VERIFICATION → VALIDATING_REPORT → READY
  (sequence enforced by the state machine; run completed with no stage skipped)

## PROVIDER_USAGE (frozen budget TECHNICAL_COMPANY_CANARY_V1)

| Provider | Calls | Hard cap | Retries |
| --- | --- | --- | --- |
| Bocha (SEARCHING, incl. competitor resolution) | 8 | 12 | 0 |
| Guarded crawler (CRAWLING, first-party pages) | 2 | 12 pages | 0 |
| DeepSeek (ANALYZING, 4 staged completions) | 4 | 8 | 0 |
| Deterministic verifier (CLAIM_EVIDENCE_VERIFICATION) | 0 provider calls | — | 0 |

No budget breach; no mock provider used in the run; REAL mode gated by the new
independent `TECHNICAL_COMPANY_CANARY_AUTHORIZED` server-side switch (default
false; API body / query / client bundle proven unable to enable it).

## PERFORMANCE (Conversion Contract V1 §6)

- **TOTAL_DIAGNOSIS_DURATION_MS:** ~27,000 (SLO target ≤180s: **met**; hard 240s: met)
- Stage durations (reconstructed from persisted timestamps, 1s granularity):
  SEARCHING ≈1s · CRAWLING ≈1s · NORMALIZING ≈0s · **ANALYZING ≈25s (dominant — 4
  sequential DeepSeek completions)** · VERIFICATION+VALIDATION ≈0s
- **QUICK_VIEW_GENERATION_MS:** ~1.0 · DEEP ~0.2 · EVIDENCE ~0.3 (target <100ms: met;
  pure deterministic projection, zero provider calls)
- **QUICK_VISIBLE_CHARS:** 665 (hard limit 1800: met; below the 900–1500 target band
  because sparse-but-honest modules are kept — no padding)
- View switching Quick/Deep/Evidence: provider_usage unchanged (14 → 14) — **0 new calls**
- Mobile 390px: no horizontal overflow; print preview captured

## EVIDENCE_SUMMARY

- 35 evidence items: FIRST_PARTY 3 · OBSERVED_WEB 32 · COMPETITOR 0
- Sources include the official site (insta360.com / support / insta360.cn) and
  third-party marketplaces & communities (京东, 知乎 …)
- Crawl: 2 first-party pages fetched inside the SSRF-guarded crawler; observed
  pages deliberately not crawled (search snippets carry the signal); 0 unsafe
  URLs admitted (all evidence URLs pass the SSRF guard)
- Failed searches: 0 · Crawl rejections: 0

## COMPETITOR_RESOLUTION

GoPro (name-only input) did **not** resolve to a unique confirmed official domain in
this run's search evidence → status unconfirmed → **no deterministic competitor gap
was generated** (Quick shows the restrained fallback copy). This is the designed
fail-restrained behavior, not an error.

## CLAIM_EVIDENCE

- Relations: 10 — PARTIAL_SUPPORT 5 · CONTEXT_ONLY 5 · DIRECT 0 · UNSUPPORTED 0
- Published claims: 1 strength · 1 core issue (both evidence-backed, 3 ids each) ·
  0 GEO opportunities · 0 competitor gaps · demonstrationFix null — all pruning is
  the publish guard / referential-integrity rules working as designed (真实性优先)

## SCORE_RESULT

- overallScore 53.85 · scoreCoverage 100%
- companyClarity 75 ESTIMATED · websiteCompleteness 60 ESTIMATED ·
  customerQuestionCoverage 50 ESTIMATED · trustEvidence 50 ESTIMATED ·
  **aiVisibility 29 MEASURED** (7 VALID single-model probes, 3 brand mentions,
  accuracy PARTIAL at best; framed explicitly as a limited single-model sample —
  never "multi-platform monitoring")
- null-never-zero verified; ESTIMATED status comes from the conservative
  support-level rules (no DIRECT_SUPPORT relations this run)

## REPORT_RESULT / TRUST_GUARD

- Quick default view · 8-module structure · first-screen has the frozen primary CTA
  (预约报告解读) · Deep/Evidence project from the SAME canonical report id
- Deterministic trust checks: **11/11 pass** (no banned/absolute copy, every claim
  evidence-backed, no dangling ids, null≠0, SSRF-safe URLs, single-model framing,
  ≤1800 chars, no internal-field leak in the public API, restrained gaps/fix)
- Screenshots (private dir): quick-mobile / quick-desktop / deep-desktop /
  evidence-drawer / print-preview

## SECURITY_SCAN / QUALITY_GATES

- `pnpm security:check` OK (197 tracked files; SSRF behavior gate 52/52)
- lint 0 errors · typecheck clean · **544 unit/integration tests** · build OK ·
  smoke:mock 7/7 (no real providers) · e2e 16/16
- `pnpm audit --prod`: 3 pre-existing advisories (playwright <1.55.1,
  drizzle-orm <0.45.2, postcss <8.5.10 via next) — dependency-upgrade follow-up
  scheduled separately; not introduced by this round
- Leak scans: no key / Authorization / prompt / raw response / publicToken in any
  private artifact; no run artifact tracked by git; `.env.local` still ignored

## CTO 判断 (Conversion Contract §11 — beyond green gates)

1. **最耗时阶段:** ANALYZING (~25s of 27s) — 4 sequential DeepSeek stage calls.
   下一步机制优化: 四个阶段相互独立,可受控并行(理论上 ~7s 总时长)。
2. **对 Quick 无贡献的调用:** 无浪费的 provider 调用;但 32 条 OBSERVED 证据中仅少数
   最终支撑发布的 claims — Evidence 摘要化/去重可以再收紧 prompt 输入。
3. **进入 Deep 未影响 Quick 的证据:** 大部分 OBSERVED marketplace 重复条目(京东多条)。
   机制优化点: 按域名+标题去重后再入 Evidence Registry。
4. **重复查询/抓取/分析:** 无重复调用;存在同域重复搜索结果(marketplace 列表页),
   属于 Query 结果去重问题而非调用重复。
5. **Quick 是否像老板决策页:** 是 — 首屏即 结论+54分+最优先问题+CTA;
   两处文案细节待改: 模块标题"三个核心问题"在仅 1 个问题时应随数量变化;
   隐藏的示范修复模块使可见编号从 4 跳到 6。
6. **首屏 10 秒可懂:** 是(一句话结论 + 分数 + 覆盖率 + 最优先问题)。
7. **是否 Insta360 特异:** 是 — B2B 批量采购/代理响应缺口、防抖口碑对比 GoPro、
   京东渠道证据均为该企业特有,换品牌不成立。
8. **看完是否自然想预约解读:** 基本成立(问题→影响→修复方向→解读会说明),但
   0 个 GEO 机会削弱了"为什么现在做"的动力 — 内容产出率是下一轮最重要的产品问题。
9. **应留到成交后交付:** 完整实施 SOW、逐项整改清单、内部数据核验 — 当前均未泄出。
10. **下一轮改机制还是改文案:** 机制为主 — (a) DeepSeek 阶段受控并行;(b) claims 阶段
    提高机会/示范修复的证据可解析率(prompt 中强化"引用摘要中的id");(c) 竞品解析
    对国际品牌增加英文官网查询;文案为辅(动态模块标题、编号连续)。

## READY_FOR_THREE_COMPANY_SAMPLE — YES(建议先做上述机制优化,再启动三企业样本)

技术、安全、预算、真实性与转化契约全部通过;无性能阻塞。三企业样本仍需按其自身
授权与预算流程另行批准 — 本轮未启动任何第二家企业。
