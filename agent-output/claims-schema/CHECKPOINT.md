# Agent N — Claims Schema Recovery Checkpoint

STATUS: READY_FOR_CLAIMS_SCHEMA_INTEGRATION

## Identity

- Branch: `cursor/claims-schema-recovery`
- Baseline: `4a4b7569b3fd3edc6458114f06a53b7cc756a0cb`
- Green-slice commit: `cef88a9d1299026e98510a2198edca606a7c5b2a`
- Real Provider calls: `0`

## Implemented

- Added strict internal `CandidateDemonstrationFix` schema.
- Candidate is exactly `null` or one complete object with:
  `sourceIssueId`, `assetType`, `beforeStructure`, `afterStructure`,
  `whyBetter`, `confirmationNeeded`, `deliverable`, `evidenceIds`.
- Empty strings, missing fields, duplicate/empty evidence IDs, unknown fields,
  model-authored `currentIssue`, and model-authored `disclaimer` are rejected.
- Added claims prompt version `REPORT_CLAIMS_ZH_PROMPT_V2_1` and explicit zh-CN,
  source issue, evidence selection, complete-or-null, and no-fallback instructions.
- `currentIssue` is copied deterministically from the exact surviving built Issue.
- `disclaimer` is copied from `DemonstrationFix.shape.disclaimer.value`.
- Candidate evidence must resolve and have a non-empty intersection with the
  exact referenced Issue's evidence. No first-Issue or first-Evidence fallback.
- Positional Issue IDs are preserved when an earlier Issue is dropped, preventing
  a source ID from silently rebinding to a different Issue.
- Opportunity lineage behavior is unchanged. Publish Guard and
  ChinesePublicReportGuard are unchanged and behaviorally covered.
- Canonical public `DemonstrationFix` contract and scoring weights are unchanged.

## Verification

- Targeted ESLint: PASS, 0 errors / 0 warnings.
- `pnpm typecheck`: PASS.
- `pnpm exec vitest run tests/analysis`: PASS, 4 files / 33 tests.
- `pnpm security:check`: PASS; 52 SSRF cases; 211 tracked files scanned; no
  secrets or banned copy.
- `git diff --check`: PASS.

## Full-suite integration result

`pnpm test`: 558 passed / 17 failed. All failures are expected integration
fallout because ownership-external legacy Mock/fixture payloads still emit the
old public DemonstrationFix-shaped model response, which the new strict Candidate
schema must reject. No compatibility fallback was added.

Supervisor integration must migrate:

- `tests/providers/fixtures/claims.json`
- the claims payload in `src/diagnosis/orchestration/live-seams.ts`

to the new Candidate fields. Those files were not modified by Agent N.

## Post-verification publication timing limitation

The current repository assembles Canonical `demonstrationFix` before
ClaimEvidenceVerifier and `pruneUnsupportedClaims`. Within Agent N ownership, the
assembler can prove only that `sourceIssueId` resolves to a pre-verification built
Issue and that Candidate evidence overlaps that Issue's resolved candidate
evidence. It cannot prove that the Issue survives semantic verification/pruning.

Supervisor must add an integration seam after pruning (or move final deterministic
assembly to that point) so that a pruned Issue forces `demonstrationFix = null` and
the retained evidence relationship is one verified for that published Issue.
Agent N did not modify the state machine, verifier, prune logic, Publish Guard, or
Chinese Guard.

## Ownership audit

Modified production/test paths only:

- `src/diagnosis/analysis/stage-schemas.ts`
- `src/diagnosis/analysis/stage-prompts.ts`
- `src/diagnosis/analysis/claims.ts` (closest existing claims implementation;
  no `src/diagnosis/report/claims*` or `demonstration*` path exists)
- `tests/analysis/claims.test.ts`
- `agent-output/claims-schema/CHECKPOINT.md`

No shared barrel export, canonical public contract, shared config, database,
run-lock, private canary artifact, or V1 artifact was modified.

READY_FOR_CLAIMS_SCHEMA_INTEGRATION
