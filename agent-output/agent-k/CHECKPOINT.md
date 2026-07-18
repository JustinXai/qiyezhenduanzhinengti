READY_FOR_NEXT_SECURITY_INTEGRATION

# Agent K — CHECKPOINT (Round-3, Next.js Security Upgrade)

Role: Next.js 安全升级
Branch: `cursor/next-security-upgrade` (baseline `b0e36dd`)
Discipline: small-step commit + immediate push; clean working tree. No real
Bocha/DeepSeek; `DIAGNOSIS_SMOKE_MODE` never set to false; `.env` untouched;
no merge to main; no `--force` install; lint never silenced.

## Objective (met)

Upgrade Next.js `15.3.1` → **`15.5.20`** (stay on Next 15 line — NOT Next 16).

## Version delta

| Package | Before | After |
|---|---|---|
| next | 15.3.1 | **15.5.20** |
| eslint-config-next | 15.3.1 | **15.5.20** |
| @next/eslint-plugin-next | 15.3.1 | **15.5.20** |
| react | 19.0.0 | 19.0.0 (unchanged — React 19 line preserved) |
| react-dom | 19.0.0 | 19.0.0 (unchanged) |

`next --version` → `Next.js v15.5.20`. Confirmed NOT Next 16.

Commit: `chore(security): upgrade Next.js 15.3.1 -> 15.5.20 …` (pushed to
`origin/cursor/next-security-upgrade`). Files changed: `package.json`,
`pnpm-lock.yaml`, `next-env.d.ts` (auto-generated: Next 15.5 adds a typed-routes
`/// <reference path="./.next/types/routes.d.ts" />`). No product source changed.

## Security advisories addressed

`pnpm audit` on the 15.3.1 baseline flagged **24 Next.js advisories**. The
target 15.5.20 is newer than the highest patched version referenced by any of
them (15.5.18), so **all 24 are resolved**. Highlights:

- **CVE-2025-66478 (critical, CVSS 10.0 — "React2Shell")** — RCE via the React
  Server Components / React-flight protocol deserializing the `Next-Action`
  header (downstream of React CVE-2025-55182). Affects Next 15.x App Router apps
  using RSC. This repo uses App Router + RSC (`app/report/[token]/page.tsx` etc.),
  so it was exposed. pnpm audit surfaces it as the no-CVE-tagged critical
  "Next.js is vulnerable to RCE in React flight protocol" (patched `>=15.3.6` on
  the 15.3 line; `>=15.5.7` on the 15.5 line). 15.5.20 includes the fix.
  Ref: https://nextjs.org/blog/CVE-2025-66478
- Other notable fixes rolled up by 15.5.20: middleware/proxy bypass via
  segment-prefetch (CVE-2026-44575 / CVE-2026-45109), SSRF via WebSocket upgrades
  (CVE-2026-44578) and middleware redirects (CVE-2025-57822), several RSC/Image
  cache-poisoning and DoS issues (CVE-2026-44576/44579/44577, CVE-2025-59471,
  CVE-2026-27980), HTTP request smuggling in rewrites (CVE-2026-29057), and XSS
  via CSP nonces / beforeInteractive scripts (CVE-2026-44581 / CVE-2026-44580).

Post-upgrade `pnpm audit`: **0 Next.js advisories remaining**; total advisories
dropped 31 → 7.

## Compatibility review

- **App Router / route params**: all dynamic routes already use the Next 15
  async pattern `params: Promise<{…}>` + `await params`
  (`app/report/[token]/page.tsx`, `app/api/diagnoses/[id]/route.ts`). Fully
  compatible with 15.5.20 — no changes needed.
- **Server components + native module**: `app/report/[token]/page.tsx` pins
  `runtime = "nodejs"` and `dynamic = "force-dynamic"`; it loads the canonical
  report through the storage handler (better-sqlite3). Exercised live by the e2e
  gate (POST /api/diagnoses → READY → GET /report/<token>) — renders correctly.
- **API routes**: `export const runtime = "nodejs"` preserved; POST/GET handlers
  unchanged and passing e2e.
- **Build**: `next build` succeeds; static/dynamic route table unchanged.
- No compatibility fixes were required. No rollback to 15.3.1 was needed.

## Seven-gate results (all GREEN, this worktree)

| Gate | Result |
|------|--------|
| `pnpm lint` | PASS (exit 0) |
| `pnpm typecheck` | PASS (tsc --noEmit, exit 0) |
| `pnpm test` (vitest) | PASS — 28 files, **300 tests** |
| `pnpm build` (next build) | PASS — 15.5.20, 4 routes |
| `pnpm smoke:mock` | PASS — 7 mock chain steps, no real providers |
| `pnpm security:check` | PASS — no secrets/banned-copy; SSRF hook clean |
| `pnpm test:e2e` (playwright) | PASS — **10 tests** (5 × 2 projects), after `npx playwright install chromium` |

Baseline (15.3.1) was verified green on the same 7 gates before upgrading, so
the post-upgrade green is a true apples-to-apples comparison.

## `pnpm audit` — residual advisories (7, all OUT OF THIS AGENT'S LANE)

All remaining advisories are in dev / build / test tooling and unrelated
transitive deps — none in Next.js / React / eslint-config-next. All pre-existed
on the 15.3.1 baseline; none is a production-runtime attack surface for the
deployed app (these tools do not run in production). Left untouched to stay
inside the authorized scope (`package.json`, `pnpm-lock.yaml`, eslint deps/config).

| Severity | Package | Vulnerable | Patched | Path / applicability |
|---|---|---|---|---|
| critical | vitest | <3.0.5 | >=3.0.5 | dev test runner (RCE if API server exposed) |
| critical | vitest | <3.2.6 | >=3.2.6 | dev test runner (UI-server file read/exec) |
| high | drizzle-orm | <0.45.2 | >=0.45.2 | Agent E storage lane; SQLi via unescaped identifiers |
| high | playwright | <1.55.1 | >=1.55.1 | e2e-only; browser-download cert verification |
| moderate | esbuild | <=0.24.2 | >=0.25.0 | via drizzle-kit (dev), dev-server request read |
| moderate | postcss | <8.5.10 | >=8.5.10 | build-time CSS stringify XSS (direct dep + via next) |
| low | @eslint/plugin-kit | <0.3.4 | >=0.3.4 | via eslint core; ReDoS in config-comment parser |

Recommendation (for Supervisor / owning agents, not done here): bump
`drizzle-orm`→≥0.45.2, `vitest`→≥3.2.6, `postcss`→≥8.5.10, `drizzle-kit`
(pulls esbuild≥0.25), `@playwright/test`→≥1.55.1 in their respective lanes.

## Known non-blocking notes

- `next build` prints "The Next.js plugin was not detected in your ESLint
  configuration." This is **pre-existing** (present on the 15.3.1 baseline too,
  see agent-g CHECKPOINT) and cosmetic — `pnpm lint` passes and the Next lint
  rules are applied via `FlatCompat` in `eslint.config.mjs`. Left as-is to keep
  the eslint-config change surface minimal; not upgrade-induced.
- pnpm peer-dep warning: `next@15.5.20` optionally wants
  `@playwright/test@^1.51.1` (have 1.50.1). This peer is only for
  `next/experimental/testmode/playwright`, which this repo does not use — our
  e2e imports `@playwright/test` directly. Non-blocking; bumping playwright is
  outside this agent's Next/React/eslint lane (see residual-advisory table).

## Constraints honored

No real Bocha/DeepSeek calls; `DIAGNOSIS_SMOKE_MODE` left at `true` (smoke) /
default; `.env` untouched; no merge to main; no `--force`/`--frozen-lockfile`
downgrade; lint not disabled; changes confined to authorized files. Working
tree clean; commit pushed to remote.
