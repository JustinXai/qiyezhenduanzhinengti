# Agent O — Round-5.2B Stage Recovery Checkpoint

STATUS: READY_FOR_STAGE_RECOVERY_INTEGRATION

BRANCH: `cursor/analysis-stage-recovery-runtime`

BASELINE: `4a4b7569b3fd3edc6458114f06a53b7cc756a0cb`

COMMIT: current branch HEAD (recorded by Supervisor from Git)

## Delivered

- Added schema-driven `analysis_stage_runs` persistence with per-stage attempt,
  frozen-input provenance, schema/prompt/model identity, output hash, provider
  usage linkage, timestamps, and sanitized failure metadata.
- Added append-only `analysis_repair_attempts`; the atomic start accepts only
  repair attempt 1 for an existing `FAILED` diagnosis and never overwrites the
  original diagnosis failure.
- Added server-environment-only repair authorization.
- Added `planFrozenEvidenceAnalysisRecovery` (read-only) and
  `resumeAnalysisFromFrozenEvidence` (single authorized attempt).
- Added a required deterministic finalization seam. It is invoked only after all
  four outputs validate, and must run Canonical assembly, Claim–Evidence
  Verification, publication/language guards, report persistence, and the READY
  transition without Provider calls or a new Diagnosis.
- Recovery priority is validated stage run, then exact legacy checkpoint, then
  frozen-Evidence rerun. Claims is always rerun with the integrated repaired
  schema definition.
- Recovery performs no search, crawl, query planning, normalization, or
  Diagnosis creation. It enforces DeepSeek call cap 1–4 and zero retries, and
  checks persisted Bocha/Crawler/Diagnosis deltas before success.
- Only strict-validator output is serialized and persisted. Raw provider
  response, prompt, Authorization, API keys, and error messages are not stored.

## Fail-closed current canary finding

Agent M confirmed the full competitor-resolution object and query-plan object
are not available. The recovery preflight requires both trusted current values
and their 64-character frozen hashes. Therefore current `diag_d9d` stops before
any Provider call and before an `analysis_repair_attempts` row is created. No
hash or stage output was inferred from Evidence, usage rows, logs, or summaries.

## Verification

- `pnpm lint`: PASS (0 errors; 1 pre-existing warning in
  `tests/canary/pre-real-sample-canary.test.ts`)
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (47 files, 578 tests)
- `pnpm security:check`: PASS (52 SSRF adversarial cases; no secrets)
- Focused Runtime/Storage tests: PASS (8 files, 64 tests)
- `git diff --check`: PASS

## Ownership

Changed only:

- `src/storage/`
- `src/runtime/`
- `src/diagnosis/orchestration/recovery/`
- `tests/storage/`
- `tests/runtime/`
- `agent-output/stage-recovery/`

No package/config/shared barrel/Delivery Board/main changes. No real Provider
calls, no database or private artifact mutation, and no new Diagnosis.

## Supervisor seams

1. Wire Agent N strict stage validators and exact schema/prompt/model versions
   directly into the recovery dependency record.
2. Agent P/Supervisor must provide the SQLite database, DeepSeek-only single-call
   executor, run-lock check, and trusted full competitor/query-plan snapshots.
3. Add shared barrel exports only if desired; Agent O intentionally did not edit
   Supervisor-owned barrels.
4. Implement the required deterministic finalizer using existing Canonical,
   verifier and Guard components; recovery rejects missing report/READY state and
   detects any persisted Provider or new-Diagnosis activity.
5. Integrate per-stage persistence into the normal real analysis producer so
   future runs write each validated stage immediately. The recovery entry already
   enforces this behavior for repair execution.

REAL_PROVIDER_USAGE: Bocha 0 / Crawler 0 / DeepSeek 0 / retries 0

NEW_DIAGNOSES: 0
