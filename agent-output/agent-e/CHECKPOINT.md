# Agent E — Runtime / Storage / API — Round-1 Checkpoint

Branch `cursor/rebuild-runtime-api`, baseline `31972e3`. Mock-only slice: no real
provider, no network I/O.

## Gate results (in this worktree)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | PASS |
| Tests | `pnpm vitest run tests/storage tests/runtime tests/api` | PASS (30) |
| Full suite | `pnpm vitest run` | PASS (31, incl. baseline contracts test) |
| Lint | `pnpm lint` | **FAILS — pre-existing env issue, not my code** (see Leftovers) |

## Commits (small green slices)

1. `4324872` feat(storage): schema-driven migrate + better-sqlite3 StorageAdapter
2. `a9bd54d` feat(orchestration): diagnosis state machine with C/D integration seams
3. `f62ef8f` feat(api): diagnoses create/get handlers + Next routes + runtime wiring

Not pushed (per instructions). No `.sqlite`/`data/` artifacts tracked (tests use
`:memory:`; the file DB path `./data/dev.sqlite` is under the gitignored `data/`).

## Files delivered

Storage (`src/storage/`)
- `migrate.ts` — DDL is **derived from `schema.ts`** via drizzle `getTableConfig`
  (single source of truth; add a table/column to `schema.ts` and migration
  coverage extends automatically — no forked copy). Exports `createSchema(db)`,
  `openDatabase`, `openMigratedDatabase`, `buildCreateTableSql`, `buildSchemaSql`,
  `schemaTables`; CLI entry backs `pnpm db:migrate` (writes to `DATABASE_URL`).
- `sqlite-adapter.ts` — `SqliteStorageAdapter` over better-sqlite3 (raw prepared
  statements) + `createSqliteStorageAdapter({ filename, migrate })` factory.
  Timestamps stored as unix **seconds** to match drizzle `mode:"timestamp"`.
- `adapter.ts` — extended the `StorageAdapter` interface (additively) with record
  types + read/write methods for requests / evidence / reports / provider_usage /
  checkpoints.

Orchestration (`src/diagnosis/orchestration/`)
- `state-machine.ts` — `runDiagnosisPipeline(deps, args)` drives
  `CREATED→VALIDATING→SEARCHING→CRAWLING→NORMALIZING_EVIDENCE→ANALYZING→
  VALIDATING_REPORT→READY|FAILED`, persisting status + evidence + provider_usage +
  checkpoints + canonical report at each step. Defines the two integration-seam
  interfaces (below).
- `mocks.ts` — offline deterministic `createMockEvidencePipeline` /
  `createMockReportProducer` (returns `buildSampleReport()` bound to the live
  diagnosis identity). Both tagged `INTEGRATION SEAM`.

Runtime (`src/runtime/`)
- `diagnosis-input.ts` — `DiagnosisInputSchema` (Zod, `.strict()`; `website` is the
  only hard requirement) + `parseDiagnosisInput`.
- `ids.ts` — `newDiagnosisId` (`diag_…`) / `newPublicToken` (`tok_…`).
- `api/diagnoses-handlers.ts` — framework-free `handleCreateDiagnosis` /
  `handleGetDiagnosis` over `DiagnosesApiDeps`.
- `create-runtime.ts` — lazy process singleton wiring SqliteStorageAdapter + mock
  seams; `getRuntime()` / `resetRuntime()`.

API (`app/api/`)
- `diagnoses/route.ts` — `POST` (create). `nodejs` runtime (native better-sqlite3).
- `diagnoses/[id]/route.ts` — `GET` (status/report; `?publicToken=` read-only).

Tests
- `tests/storage/{migrate,sqlite-adapter}.test.ts` — DDL derivation + round-trips.
- `tests/runtime/state-machine.test.ts` — happy path, ordered transitions, 5
  failure paths, checkpoint reuse.
- `tests/api/diagnoses-handlers.test.ts` (+ `in-memory-storage.ts` helper) — handler
  behaviour over a Map-backed `StorageAdapter` (proves storage-agnostic coupling).

## Integration seams (the important part)

### Seam → Agent C (search / crawl / evidence)
Interface `EvidencePipeline` in `src/diagnosis/orchestration/state-machine.ts`:
```
search(ctx)                     -> StageResult { data, usage? }
crawl(ctx, searchResult)        -> StageResult { data, usage? }
normalize(ctx, crawlResult)     -> NormalizedEvidenceResult { evidence: EvidenceItem[], usage? }
```
- `ctx = { diagnosisId, input: DiagnosisInput }`.
- The three methods map 1:1 to the `SEARCHING`/`CRAWLING`/`NORMALIZING_EVIDENCE`
  states so the machine can persist per stage. C may treat `search`/`crawl`
  outputs (`StageResult.data`) as opaque; only `normalize().evidence` is persisted.
- `normalize()` must return **canonical `EvidenceItem[]`** (`src/contracts`). The
  state machine writes these to the `evidence` table (mapping
  `EvidenceItem.fetchedAt` string → epoch seconds).
- Optional `usage: ProviderUsageSample[]` per stage → `provider_usage` (provider
  e.g. `"bocha"`). Assumption: C reports usage here rather than writing the table
  itself.
- **Assumption / possible mismatch:** C's real pipeline may be a single call, not
  three. If so, keep the 3-method shape (return empty `StageResult` from
  `search`/`crawl` and do the work in `normalize`), or tell me and I collapse the
  states. Do **not** silently drop the intermediate states.

### Seam → Agent D (report generation)
Interface `ReportProducer` in the same file:
```
produce(ctx) -> { ok: true, report: DiagnosisReport, usage? }
             |  { ok: false, error: { code, message } }
ctx = { diagnosisId, publicToken, input, evidence: EvidenceItem[] }
```
- D returns the **Canonical `DiagnosisReport`** (validated by me at
  `VALIDATING_REPORT` via `DiagnosisReport.safeParse`). D must set
  `report.diagnosisId` / `report.publicToken` to the `ctx` values, or the machine
  fails with `REPORT_IDENTITY_MISMATCH` (this guards against cross-diagnosis
  bleed).
- `ok:false` → machine fails at `ANALYZING` and surfaces D's `error.code`
  verbatim (aligns with `ProviderErrorCode` in `src/providers/types.ts`).
- **Checkpoint reuse:** before calling `produce`, the machine looks up a reusable
  `analysis_checkpoints` row keyed by `(diagnosisId, "ANALYZING", inputHash,
  report/scoreContractVersion, providerModel, promptVersion, trustGuardVersion)`.
  Round-1 uses fixed constants `ANALYSIS_PROVIDER_MODEL="deepseek-v4-flash"`,
  `ANALYSIS_PROMPT_VERSION`, `ANALYSIS_TRUST_GUARD_VERSION`. **At integration D
  should own these version strings** (prompt/guard versions) so cache
  invalidation is correct — expose them and I will thread them into the key.

### Seam → Agent F (API response shapes)
- `POST /api/diagnoses` body = `DiagnosisInput` (`{ website (required url),
  brandName?, industry?, productOrService?, targetRegion?, competitors?[], notes? }`).
  Returns `201 { diagnosisId, publicToken, status }`; on validation failure
  `400 { error:"INVALID_INPUT", issues:[{path,message}] }`. A pipeline failure
  still returns `201` with `{ status:"FAILED", failedStage, error }` (the request
  resource was created; poll GET for detail).
- `GET /api/diagnoses/[id]` → `200 { diagnosisId, status, report }` where `report`
  is the **Canonical `DiagnosisReport`** JSON object (not a string) or `null` until
  READY; unknown id → `404 { error:"NOT_FOUND" }`.
- `GET /api/diagnoses/[id]?publicToken=…` → same shape, resolved by the
  unguessable token (path id ignored); this is F's read-only share entry.
- **Assumption:** round-1 runs the pipeline **synchronously** inside `POST`, so
  status is terminal (`READY`/`FAILED`) by the time F polls. If F needs a truly
  async CREATED→…→READY progression, say so and I will move the pipeline to a
  worker and keep GET polling as the contract.

## Leftovers / open questions for Supervisor

1. **`pnpm lint` fails in this worktree** — `@next/eslint-plugin-next` is not
   resolvable from `node_modules` here (fails even on baseline `app/layout.tsx`,
   independent of my changes). Config/`package.json` are Supervisor-owned; baseline
   commit `764283b` tried to hoist it but this worktree's install didn't pick it up.
   Likely needs a re-`pnpm install` / hoist config from the Supervisor.
2. **`StorageAdapter` interface was extended** (additively) beyond the baseline
   shape. If another agent depends on the narrow baseline interface, confirm the
   extension is acceptable (all additions are new methods/types; nothing removed).
3. **Provider version strings** for the ANALYZING checkpoint key are placeholders
   pending Agent D (see D seam).
4. No new dependencies added (better-sqlite3 / drizzle-orm / zod already present),
   so no `DEPENDENCIES.md` request.
