# Agent V Checkpoint — Round-5.3 Status & Revision Finalizer

## Status

`STATUS_CONTRACT_READY`

- Branch: `cursor/round53-status-finalizer`
- Baseline: `cab80edb3bc910d2700a04309578dd5c1b045bb7`
- Functional commit: `950a417`
- Real Provider calls: 0
- Network calls: 0
- New Diagnosis: 0
- Real V2 database writes: 0

## Delivered

- `TechnicalCanaryStatus` is now `PASS | FAIL` and consumes technical checks
  only. Opportunity count is deliberately absent.
- `ProductYieldStatus` is independent:
  `HEALTHY | SPARSE_BUT_TRUTHFUL | BLOCKED_BY_IMPLEMENTATION_BUG |
  INSUFFICIENT_SAMPLE`.
- A zero Opportunity count requires a confirmed forensic cause. Confirmed
  `INSUFFICIENT_SUPPORT` maps to `SPARSE_BUT_TRUTHFUL`; the classifier never
  guesses from count.
- Added a zero-Provider offline finalizer whose request accepts only diagnosis
  identity/revision metadata. Report content is loaded from the four persisted
  successful stage outputs plus persisted ClaimEvidenceRelations.
- All stage JSON/hashes are checked; mutation of stage outputs/relations,
  modified score/AI tests/Evidence/company facts, or claims not traceable to
  `REPORT_CLAIMS` hard-stop before writes.
- Quick publication keeps only core issues with a pairwise DIRECT relation to
  one of that issue's cited Evidence IDs. PARTIAL-only negative issues are
  removed from Canonical `coreIssues`, so Quick/topIssue/headline cannot expose
  them.
- Removed PARTIAL-only negative observations are deterministically carried in
  `companyProfile.unresolvedQuestions` for Deep with all three labels:
  `待进一步确认` / `本次保存的公开证据范围` / `不作为确定性结论`.
- Opportunities/fixes depending on a suppressed Issue are removed without
  changing relation levels, Evidence or stage outputs.
- Two PARTIAL rows now satisfy Strength/Opportunity/Frozen negative support only
  when their Evidence resolves to at least two independent normalized/root
  domains. Two URLs/subdomains from one root count once.
- Prune reason codes are persisted append-only. Valid Evidence suppressed for
  insufficient support is never mislabeled `INVALID_EVIDENCE_REFERENCE`.
- `report_revisions` records the audit chain and prune reasons. In the same
  transaction, a new immutable Canonical row is inserted into the existing
  `reports` table, so the normal `getReport`/Public API latest-report path reads
  the revision. Parent rows are never updated or deleted.

## SQLite / Supervisor binding

1. Before the one authorized offline execution, Supervisor must apply
   `applyReportRevisionSchema(db)` to its reviewed temporary/private database
   target. Agent V did not wire shared migration files or apply this to V2.
2. Bind persisted inputs with
   `new SqliteRound53FinalizationSourceStorage(db)`.
3. Bind `SqliteReportRevisionRepository(db)`.
4. Bind the existing deterministic stage builder to
   `assembleFromPersistedStages`; no Provider seam exists.
5. Bind current Publish/Frozen/Chinese guards through `assertFrozenGuards`, and
   current Quick/Deep/Evidence projection plus Quick budget through
   `assertPresentation`.
6. Call `refinalizeRound53Report` once with the current latest report ID as
   `expectedParentReportId`. Stale parent IDs fail closed.
7. Re-run all guards and verify Quick has zero core issues for the audited V2
   (all iss_1/2/3 are PARTIAL-only), while Deep unresolved questions carry the
   required limitations.

No execution CLI was added. Supervisor retains the sole authority to select the
private database, apply migration, back it up and perform the one offline write.

## Verification

- Typecheck: PASS
- Focused tests: PASS — 8 files / 46 tests
- Focused ESLint: PASS — 0 errors / 0 new warnings
- Temporary SQLite end-to-end: PASS using `:memory:` only
  - actual `analysis_stage_runs`
  - actual `claim_evidence_relations`
  - current Publish Guard and Presentation service
  - append-only revision
  - original `reports` row retained
  - regular latest-report read returns revision
  - Provider usage remains empty
- `git diff --check`: PASS
- Full repository gates: Supervisor integration responsibility

## Migration / rollback risk

- Migration is additive: two new tables/indexes; no existing column/table is
  changed.
- Revision write adds one new `reports` row plus audit rows in one transaction.
- Rollback before real execution is code-only. After an authorized real
  execution, history must not be deleted; rollback means selecting the parent
  as current through a new append-only revision, never deleting audit history.

