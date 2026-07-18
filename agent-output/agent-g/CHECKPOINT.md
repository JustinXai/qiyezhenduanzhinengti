# Agent G — CHECKPOINT (Round-1)

Role: QA、安全、CI 与可信评审
Branch: `cursor/rebuild-qa-ci` (baseline `31972e3`)
Discipline: local commits only, **never pushed**. No real Bocha/DeepSeek calls.

## Deliverables & commits

| # | Deliverable | Commit |
|---|-------------|--------|
| 1 | Hardened `scripts/security-check.ts` (secret scan + banned-copy scan + SSRF hook) | `443df38` |
| 2 | `tests/e2e/report.spec.ts` (INTEGRATION-GATED) + `tests/security/banned-copy.test.ts` + `tests/fixtures/banned-terms.ts` | `c631ee2` |
| 4 | `scripts/smoke-mock.ts` upgraded to near end-to-end mock chain | `2bf90ce` |
| 3 | `.github/workflows/ci.yml` gate workflow | `daa3aef` |

## Files changed / added

- `scripts/security-check.ts` (modified) — kept + broadened secret scan (sk- keys,
  Bearer tokens, DB connection creds); added customer-visible banned-copy scan
  (禁用综合分别名 REPORT_CONTRACT §1 + 禁用营销文案 PRODUCT_TRUTH_RULES §9), scoped to
  `app/**`, `components/**`, `src/**`; added INTEGRATION-GATED SSRF config
  regression hook for `src/security/crawler/` (Agent C). Escape hatch marker
  `security-check:allow`.
- `scripts/smoke-mock.ts` (modified) — 7-step mock chain (search → analysis →
  canonical-assembly SEAM → contract validation → in-memory storage round-trip →
  Quick/Deep/Evidence view-model projection → product-truth spot check).
- `tests/fixtures/banned-terms.ts` (new) — single source of truth for forbidden
  copy, imported by the scanner AND the vitest guard (no drift). Imports canonical
  fixture read-only elsewhere; does NOT fork `src/fixtures/sample-report`.
- `tests/security/banned-copy.test.ts` (new) — 13 vitest tests over the canonical
  report payload: no banned copy, all 8 Quick modules backed, frozen CTA clean,
  evidence referential integrity, negative-control test.
- `tests/e2e/report.spec.ts` (new) — 5 Playwright tests × 2 projects = 10,
  INTEGRATION-GATED.
- `.github/workflows/ci.yml` (new) — push (all branches) + PR gate chain.

## Gate results (local, this worktree)

Note: incoming `node_modules` was stale (missing hoisted `@next/eslint-plugin-next`
from baseline `764283b`); `pnpm install --frozen-lockfile` synced it (lockfile
already up to date, no package.json/lockfile change by me).

| Gate | Result |
|------|--------|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (vitest) | PASS — 14 tests (1 baseline + 13 new) |
| `pnpm build` (next build) | PASS |
| `pnpm smoke:mock` | PASS — 7 chain steps, exit 0 |
| `pnpm security:check` | PASS — exit 0, SSRF hook INTEGRATION-GATED |
| `pnpm test:e2e` (playwright) | PASS — 10 skipped (gated), exit 0 |

## INTEGRATION-GATED e2e cases (enable after Agent F's page lands)

All in `tests/e2e/report.spec.ts`, skipped unless `RUN_INTEGRATION_E2E=1`
(and `E2E_REPORT_PATH` if the route differs from `/report/<publicToken>`):

1. renders all 8 fixed Quick modules
2. shows canonical综合分 label `GEO可见度基础指数` (not a banned alias)
3. primary + secondary CTA visible with frozen copy (预约报告解读 / 获取企业GEO优化方案)
4. primary CTA appears within ~1.5 mobile screens
5. rendered DOM contains no forbidden copy

Integration seam contract Agent F must satisfy: route renders Quick view and
exposes `data-testid` `quick-module-1..8`, `primary-cta`, `secondary-cta`,
`geo-index`; in `DIAGNOSIS_SMOKE_MODE` the page serves the canonical SAMPLE report.

## Integration seams stubbed in smoke (real code in other worktrees)

- Report assembly → `src/report/generation` (Agent D)
- StorageAdapter (better-sqlite3) → `src/storage` (Agent E)
- ReportPresentationService → `src/report/presentation` (Agent F)
- Crawler SSRF blocklist → `src/security/crawler` (Agent C) — drives the SSRF hook

## Dependencies

None added. All work uses existing deps (zod via contracts, @playwright/test,
vitest, tsx, cross-env). No `DEPENDENCIES.md` needed.

## Remaining / follow-ups

- Flip `RUN_INTEGRATION_E2E=1` in CI (a separate e2e job, not the current gate
  chain) once Agent F integrates the report page + testid contract.
- Set `SECURITY_CHECK_SSRF_STRICT=1` once Agent C's crawler lands and its SSRF
  token vocabulary is confirmed, promoting the SSRF hook from warn to hard-fail.
- Trust review docs (`docs/TRUST_AND_CONVERSION_REVIEW_V1.md`,
  `docs/REPORT_V2_QUICK_DEEP_EXPERIENCE.md`) not authored this round — deferred
  until the presentation layer exists to review against.
- `next build` warns "Next.js plugin not detected in ESLint config" (Supervisor-
  owned `eslint.config.mjs`); build still passes. Flagged, not fixed (out of lane).
