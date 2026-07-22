# Round-6 Phase 0 Agent Y — Prune Audit & Runtime Policy

## Status

`READY_FOR_SUPERVISOR_REVIEW`

- Branch: `cursor/round6-prune-audit`
- Baseline: `d995f87215f7a501fb72f5833bf76144e27493d3`
- Commits: `70dc6c5`, `2566fba`, `0084c7e`, `a42855b`, `669061f`
- Real Provider calls: 0
- Network calls during task execution: 0
- New Diagnosis: 0
- Real database reads/writes: 0

## Delivered

- Added an append-only `PruneDecision` ledger with report/revision lineage,
  exact guard rule, support counts, independent-source count and coverage state.
- Audited analysis-schema rejection, shared-policy pruning and structural
  cascade removal without modifying persisted analysis-stage output.
- Unified normal runtime, frozen-evidence runtime and the offline refinalizer on
  the single `ClaimPublicationPolicy`; removed the two local pruning policies.
- Enforced exact-field negative-scope prefixes, including Opportunity
  `contentGap`, and separated `NO_MEASUREMENT_COVERAGE` from
  `MISSING_COVERAGE_PREFIX`.
- Preserved content-backed DIRECT support for bounded negative claims while
  preventing coverage from upgrading PARTIAL/CONTEXT evidence.
- Added Opportunity copy guards for banned/overpromising language and precise
  pre-publication rejection reasons.
- Enforced crawl budgets of first-party <= 8, competitor <= 4 and total <= 12,
  with non-overlapping `CRAWLING_FIRST_PARTY` / `CRAWLING_COMPETITOR` usage.
- Made latest append-only report selection deterministic when timestamps tie or
  revisions carry an older timestamp.

## Verification

- Full unit suite: PASS — 67 files / 741 tests.
- Focused Round-6 suite: PASS — 13 files / 94 tests.
- ESLint: PASS.
- TypeScript typecheck: PASS.
- `git diff --check`: PASS.
- Chinese full-chain Canary A: READY with one bounded DIRECT Issue and its
  linked Opportunity; all providers were deterministic mocks.

## Integration notes

- Includes Agent X dependency commit `0084c7e` (source-key normalization and
  the single ClaimPublicationPolicy).
- Crawler usage stage names are exactly `CRAWLING_FIRST_PARTY` and
  `CRAWLING_COMPETITOR` for downstream sample assertions.
- No integration branch, tag, real Provider, real database or real Diagnosis
  operation was performed.
