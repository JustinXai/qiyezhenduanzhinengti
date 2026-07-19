# Agent R Checkpoint — Round-5.2C Frozen-Evidence Reanalysis Runtime

## Status

`READY_FOR_FROZEN_EVIDENCE_RUNTIME_INTEGRATION`

- Branch: `codex/frozen-evidence-reanalysis-runtime`
- Baseline: `4f03f7e1f8e657c45fe814c2923d8c661fb36e49`
- Q contract dependency (cherry-picked on this branch): `082e1ae`
- Runtime commits: `5e2aee9c`, `69274bff`
- Diagnosis authorized by the round: `diag_d9d`
- Real Provider calls: 0
- Network calls: 0
- New Diagnosis records: 0

## Delivered

- Added a separate `FROZEN_EVIDENCE_REANALYSIS` runtime; the existing strict
  checkpoint resume remains unchanged and fail-closed.
- Read-only preflight loads the same Diagnosis input, 22 persisted Evidence
  rows, and the `NORMALIZING_EVIDENCE` checkpoint. It checks the input,
  registry, normalized-Evidence, database-capture and run-lock-capture hashes
  before Repair Attempt 1 is created.
- The runtime builds and strictly parses Q's formal `FrozenEvidenceSnapshotV1`.
  It never accepts, generates or persists a query-plan hash or competitor-
  resolution hash for this mode.
- Repair Attempt 1 persists:
  - `recoveryMode=FROZEN_EVIDENCE_REANALYSIS`
  - `reusedStages=[EVIDENCE_REGISTRY]`
  - all four ordered rerun stages
  - missing historical provenance for `QUERY_PLAN_HASH` and
    `COMPETITOR_RESOLUTION_HASH`
  - the complete Snapshot JSON and its stable hash
- Always executes `REPORT_PROFILE`, `REPORT_SCORING`,
  `REPORT_AI_VISIBILITY`, then `REPORT_CLAIMS` through one injected DeepSeek-
  only executor. The hard cap is 4 and retry count is fixed at 0.
- Each response is strict-JSON parsed, schema-validated and committed to
  `analysis_stage_runs` with output hash before the next stage call. A failure
  stops immediately, retains prior successful rows, persists only sanitized
  failure metadata, and never invokes finalization.
- Each stage row binds the Evidence Registry and Snapshot hash; the unavailable
  competitor/query provenance columns are SQL `NULL`, not placeholder hashes.
- The required finalizer seam receives the Snapshot, normalized Evidence,
  coverage/competitor degradation state, empty `competitorGaps`, and all four
  outputs. The runtime verifies report + READY, unchanged Diagnosis count,
  unchanged Evidence/checkpoint hashes, zero non-DeepSeek Provider deltas and
  zero retries before completing Repair Attempt 1.
- SQLite migration preserves all Round-5.2B stage rows while relaxing only the
  two unavailable-provenance columns. New repair/snapshot columns are additive.

## Exact Supervisor / Agent S seams

Direct import:

`src/diagnosis/orchestration/recovery/frozen-evidence-reanalysis.ts`

Exports:

- `prepareFrozenEvidenceReanalysis(deps)` — read-only preflight and plan
- `reanalyzeFromFrozenEvidence(deps)` — the single authorized execution
- `FrozenEvidenceReanalysisDependencies`
- `FrozenEvidenceReanalysisExpectation`
- `FrozenEvidenceReanalysisPlan`
- `FrozenEvidenceReanalysisResult`
- `FrozenEvidenceReanalysisError`
- `hashFrozenEvidenceRegistry(evidence)`

Plan shape:

```text
diagnosisId
recoveryMode = FROZEN_EVIDENCE_REANALYSIS
reusedStages = [EVIDENCE_REGISTRY]
rerunStages = [PROFILE, SCORING, AI_VISIBILITY, CLAIMS]
deepSeekCallCap = 4
retries = 0
snapshot: FrozenEvidenceSnapshotV1
snapshotHash
```

Result adds:

```text
repairAttempt = 1
outputs: Record<AnalysisStage, unknown>
providerUsage: { bochaDelta: 0, crawlerDelta: 0, deepSeekDelta, retries: 0 }
resultState = READY
```

Supervisor must provide:

1. Exact Q identity guard through
   `assertSnapshotIdentity: assertInsta360FrozenEvidenceIdentity`.
2. The pre-migration audited database/run-lock hashes through
   `loadFrozenArtifactIdentity`; these are capture provenance, not post-write
   physical-hash assertions.
3. N's four exact stage definitions and strict schemas.
4. A DeepSeek-only, single-call stage executor. No search/planner/crawler/
   normalizer/resolver dependency is present in this runtime API.
5. A deterministic finalizer that assembles Canonical, runs Claim-Evidence
   verification, Q's Frozen-Evidence Guard plus existing publication/language
   guards, saves the single report, and transitions the same Diagnosis to READY
   without Provider calls.
6. The externally enforced total historic DeepSeek cap of 8 (first run 4 plus
   this repair at most 4). This runtime enforces the repair-local cap of 4.

## Verification

- `pnpm lint`: PASS — 0 errors, 1 pre-existing warning
- `pnpm typecheck`: PASS
- `pnpm test`: PASS — 52 files / 629 tests
- `pnpm build`: PASS
- `pnpm security:check`: PASS — 52 SSRF cases; 233 tracked files; no secrets or
  banned copy
- Focused recovery tests: PASS — zero-call preflight, ordered commits,
  stop-on-first-failure, zero retry, unavailable provenance as NULL, forbidden
  Provider delta, migration preservation
- `git diff --check`: PASS

## Ownership

Changed only the assigned recovery runtime, necessary additive Storage files,
owned runtime/storage tests, and this checkpoint. No shared barrel/config/script/
QA document was edited. No private artifact, V1 artifact, V2 SQLite, run-lock,
main or integration branch was modified.
