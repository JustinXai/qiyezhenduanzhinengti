# Chinese Conversion Hardening V1 — Round-5.1

中文成交版硬化的脱敏结果。No credentials, prompts, raw provider responses or
tokens appear here or in any tracked file.

## Scope delivered

- **Dependency security merge:** `88ddedc` (playwright 1.55.1 · drizzle-orm 0.45.2 ·
  postcss 8.5.19 + pnpm override, lockfile only) merged into integration →
  `pnpm audit --prod` = **0 known vulnerabilities**.
- **ReportLanguage frozen:** canonical `reportLanguage: "zh-CN"` (literal + default
  for pre-field rows; stamped by the assembler; not user-switchable).
- **ChinesePublicReportGuard** (`src/report/validation/chinese-public-report-guard.ts`):
  no full English sentences, no internal enums (MEASURED/…/UNSUPPORTED), no
  state-machine names, no English tech errors/CTA, unified punctuation, Chinese
  evidence summaries mandatory; whitelist for brands/models/URLs/缩写.
  Public mappings: 实测 / 公开网页估算 / 证据不足 / 暂未测得;直接支持 / 部分支持 /
  背景参考;UNSUPPORTED never public (filtered from the Evidence view).
- **ZH_CN_PRIMARY_WITH_OFFICIAL_FALLBACK** query policy: Chinese buckets for
  官网/口碑/案例/旗舰店/知乎/行业媒体/选型/竞品; ASCII (international) competitor
  names resolve **English-first** (`GoPro official website`) — fixes the Round-5
  GoPro resolution miss; English remains fallback-only, never the primary source.
- **Evidence tiering + dedup** (`src/diagnosis/evidence/tiering.ts`): language
  detection, tiers A企业中文官方/B全球官方/C中文媒体/D电商/E社区, same-domain
  title dedup, ≤2 items per marketplace/community domain (official pages exempt),
  stats (before/after, per-tier, Chinese count, English-official fallback count).
  Wired into BOTH the real and mock pipelines.
- **Content-yield mechanics (§七):** opportunities must link a built issue
  (`sourceIssueId`), demo fix must originate from a published issue; drops and
  prunes now record reasonCodes (NO_VALID_EVIDENCE / INVALID_EVIDENCE_REFERENCE /
  INSUFFICIENT_INDEPENDENT_SUPPORT / COVERAGE_NOT_ESTABLISHED / COMPETITOR_NOT_RESOLVED …).
  Publish guard thresholds unchanged.
- **measurementComposition (§八):** frozen-weight share per measurement status,
  shown beside coverage (有效评分覆盖率 X% · 实测 X% · 公开网页估算 X%), plus the
  frozen estimation disclaimer whenever估算 > 实测. Never a bare "覆盖率100%".
- **Quick 中文成交版 (§九):** dynamic module titles (核心问题 by real count),
  contiguous numbering, empty modules omitted (no shells), first-screen primary
  CTA, all-Chinese labels; Deep shows Chinese dimension names + composition;
  Evidence adds mandatory Chinese summaries + Chinese support/source labels.

## Zero-cost acceptance (persisted Insta360 diagnosis, verify-only)

- Trust checks **15/15** (incl. report-language-zh-cn, chinese-public-report-guard,
  measurement-composition, estimation-notice) · no new diagnosis · provider usage
  unchanged (14 → 14) across Quick/Deep/Evidence/print · 390px no overflow.
- QUICK_VISIBLE_CHARS 669 (target 600–1000 ✓ · hard 1800 ✓) · views ~1ms each.
- Composition on the real report: 实测 15% · 公开网页估算 85% → disclaimer shown.
- Offline curation re-analysis of the stored 35 evidence items: 32 kept
  (3 near-duplicates merged) · tiers A3 / C27 / E2 · Chinese 30/32.
  (Tier/language annotations flow into future reports at NORMALIZING_EVIDENCE.)

## Mock canaries (zero network)

- **A** 中文企业+中文证据充分 → all-Chinese report, publishable issue-linked
  opportunity, guard ok.
- **B** 英文品牌名+中文网络 → brand stays English, all prose Chinese, guard ok.
- **C** 中文不足→英文官方 fallback → original English titles kept, Chinese
  summaries + conclusions, tier-B fallback visible in stats, guard ok.

## Gates

lint 0 errors · typecheck · **558 tests** · build · smoke:mock · security:check
(198 files, SSRF 52/52) · e2e 16/16 · `pnpm audit --prod` **0 vulnerabilities**.

## Boundaries

verify-only proves presentation + projection only — it does NOT prove the new
Chinese queries/prompts against live providers. That requires the separately
authorized second Insta360 real diagnosis (not run in this round). main untouched.
