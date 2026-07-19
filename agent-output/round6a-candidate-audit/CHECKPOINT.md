# Round-6A Agent AB — Candidate Provenance & Publication Decision Audit

## Status

`READY_FOR_SUPERVISOR_REVIEW`

- Branch: `cursor/round6a-candidate-audit`
- Baseline: `6df74875133fa0e3e61be23564290c976ba96ed4`
- Functional commit: `082dd12`
- Real Provider calls: 0
- Business/evidence network calls: 0
- New Diagnosis: 0
- Private/real database reads or writes: 0

## Delivered

- Added the single `CandidateSourceResolverV1` with priority:
  verified `REPORT_CLAIMS` stage run, then strict legacy `ANALYZING`
  checkpoint, otherwise hard failure.
- Legacy validation requires matching diagnosis and stage, complete strict
  payload, canonical schema, existing Evidence IDs, resolvable source Issues,
  strict temporal ordering, and absence of prompt/provider-response/key fields.
- Legacy SHA-256 is explicitly marked
  `CURRENTLY_COMPUTED_NOT_HISTORICAL`; stage-run hashes are marked
  `HISTORICAL_PERSISTED`.
- Storage resolution parses persisted canonical JSON and uses `generatedAt`
  milliseconds for ordering. This handles qiaqia's checkpoint/report DB
  timestamps sharing integer second `1784471871` while generatedAt is
  `2026-07-19T14:37:51.324Z`.
- The resolver returns the validated legacy candidate report in memory for the
  zero-Provider refinalizer. Only the sanitized snapshot is suitable for audit
  persistence.
- Added a sanitized resolver Replay Fact classified `IMPLEMENTATION_BUG`; no
  new recovery mode, provider, or second persisted replay table was introduced.
- Normal REAL Runtime now persists each strictly parsed/Zod-validated analysis
  output to `analysis_stage_runs` before the next stage call and before
  Canonical finalization, with current evidence/query/competitor provenance
  hashes and linked ProviderUsage rows.
- Added append-only `claim_publication_decisions` storage. Each candidate has
  exactly one `PUBLISHED`, `PRUNED`, or `DEEP_NEEDS_CONFIRMATION` result.
  Batch validation rejects missing, extra, duplicate, mixed-lineage, or
  mixed-source decisions atomically.
- Added partial unique indexes for report/revision candidate identity.
- Extended `AppendReportRevisionInput` so a complete Decision batch is inserted
  in the same transaction as the revision, immutable report row, and new prune
  reason. A validation failure rolls back all rows.
- Existing `prune_decisions` rows remain unchanged; the new ledger complements
  rather than rewrites or duplicates that history.
- Public diagnosis responses continue to expose only Canonical report fields;
  Decision and Candidate Source provenance fields are not returned.

## Phase A coverage

- #9 normal Runtime persists four `analysis_stage_runs`: PASS.
- #10 valid legacy checkpoint is a Candidate Source: PASS.
- #11 neither source available causes a hard failure with sanitized Replay
  Fact: PASS.
- #12 every Candidate has exactly one final Decision: PASS.
- #13 qiaqia-shaped refs
  `str_1,str_2,iss_1,iss_2,gap_1,geo_1,geo_2,demo_1` produce 8 Decisions: PASS.
- #20 Public API internal Decision/provenance non-leak: PASS.

## Verification

- Full unit suite: PASS — 71 files / 789 tests.
- Focused Phase A/runtime/storage/API suite: PASS — 9 files / 48 tests.
- ESLint: PASS.
- TypeScript typecheck: PASS.
- `git diff --check`: PASS.

## Integration seams

- AC can call `resolveCandidateSourceFromStorageV1` or
  `parseLegacyCandidateCheckpointV1`, then pass its 8 candidate keys and 8
  Decision drafts through `AppendReportRevisionInput.claimPublicationDecisionBatch`.
- Migration is additive through the existing schema-driven migration. AC must
  apply the current migration to its reviewed copy before the offline revision.
- No shared config, `src/contracts/index.ts`, scripts, sample artifacts, or
  private files were modified.
