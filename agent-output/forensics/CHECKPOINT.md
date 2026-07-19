# Agent M Checkpoint — Round-5.2B Analysis Recovery Forensics

## Scope

- Branch: `cursor/analysis-recovery-forensics`
- Base: `4a4b7569b3fd3edc6458114f06a53b7cc756a0cb`
- Audited implementation commit: `b28aaa91e410cc602b574954695b319742a2568d`
- Diagnosis: `diag_d9d81ba3428f4696b088870ca7416e49` (`diag_d9d`)
- Provider calls made by Agent M: 0
- Private/production writes made by Agent M: 0

## Owned files

- `scripts/analysis-recovery-audit.ts`
- `docs/qa/ANALYSIS_RECOVERY_FORENSICS.md`
- `agent-output/forensics/CHECKPOINT.md`

Ownership check: PASS. No shared config, production code, private artifact, V1 artifact, V2 SQLite,
run-lock, Checkpoint, Provider response or main/integration branch was modified.

## Findings

- PROFILE: `NOT_RECOVERABLE`
- SCORING: `NOT_RECOVERABLE`
- AI_VISIBILITY: `NOT_RECOVERABLE`
- CLAIMS: `NOT_AVAILABLE` (Schema failure is recorded; invalid Payload is not persisted)
- Evidence Registry: 22 rows
- Evidence Registry Hash:
  `9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce`
- Normalized 22-Evidence stable Hash:
  `b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd`
- Competitor Resolution Hash: `NOT_AVAILABLE`
- Query Plan Hash: `NOT_AVAILABLE`
- V1 directory Hash:
  `1465e42ff81e94858fed7e54d61272c4127dc171df94f5e0377912ba3763b934`
- V2 logical database Hash:
  `bc8a5e062d366e1abd29f908ed89fe5ec0301e3a85a80520709925c2c1e402d6`
- V2 run-lock Hash:
  `b86df78852ed7ac06d93ae43c4b5e4b9ee34c43221b74a35ddb6eb224aef48f8`
- SQLite copied-snapshot integrity: PASS (`ok`)
- Before/after private source Hash comparison: PASS (V1 unchanged, V2 unchanged)
- Strict recovery decision blocker:
  `BLOCKED_UNVERIFIABLE_COMPETITOR_RESOLUTION_AND_QUERY_PLAN_HASHES`

## Verification

- `pnpm typecheck`: PASS
- `pnpm exec eslint scripts/analysis-recovery-audit.ts`: PASS
- Relevant Vitest slice: PASS — 4 files / 40 tests
  - storage migrate
  - storage SQLite adapter
  - provider stage schemas
  - technical canary guard
- `pnpm security:check`: PASS
  - 52 SSRF adversarial behavior cases
  - 211 tracked files scanned
  - no secrets or banned copy
- Audit determinism: PASS — two consecutive outputs byte-identical
  - output SHA-256:
    `6294daa445ea4133e62ebcf7d7f93b5e7ced05b1f27d63e68577901dd7a997c2`

## Handoff

No existing analysis stage can be reused. If and only if Supervisor explicitly resolves the two
unverifiable frozen-hash preconditions, the required rerun sequence is Profile, Scoring,
AI Visibility, Claims (DeepSeek cap 4, retries 0; Bocha/Crawler/new Diagnosis all 0).

`READY_FOR_RECOVERY_DECISION`
