# Round-6A Agent AA — Competitor Gap Publication Policy V1

STATUS: `FUNCTIONAL_COMMIT_COMPLETE`

BRANCH: `cursor/round6a-gap-policy`

BASELINE: `6df74875133fa0e3e61be23564290c976ba96ed4`

FUNCTIONAL_COMMIT: `dbac26cc25bcefaf3b79fe17becb7c1c966afe68`

## Delivered scope

- Added the single reusable `CompetitorGapPublicationPolicyV1` with exact
  version `competitor-gap-publication-policy.v1`.
- Required explicit resolver/verifier metadata instead of inferring entity,
  comparison dimension, Coverage, or bounded scope from marketing copy.
- Required a confirmed competitor entity, a verified current-company relation,
  and a verified official competitor relation with `DIRECT_SUPPORT` or
  `PARTIAL_SUPPORT`.
- Required both sides to support the same explicit comparison dimension and the
  conclusion to stay within verified Evidence.
- Required every cited Evidence id to exist and every accepted relation to carry
  persisted verifier provenance; no relation is generated or auto-attached.
- Excluded `CONTEXT_ONLY` from both sides and hard-blocked `UNSUPPORTED`.
- Sent competitor-only observations or missing Coverage to
  `DEEP_NEEDS_CONFIRMATION`, while keeping them out of public competitor gaps.
- Added precise decision/prune reasons:
  - `UNVERIFIED_COMPETITOR_ASSERTION`
  - `MISSING_COMPETITOR_OFFICIAL_RELATION`
  - `MISSING_CURRENT_COMPANY_RELATION`
  - `COMPETITOR_ENTITY_NOT_RESOLVED`
  - `COMPARISON_DIMENSION_MISMATCH`
  - `COMPETITOR_COVERAGE_NOT_ESTABLISHED`
- Routed Evidence Guard, Publish Guard and shared pruning through the same
  optional per-gap context map. Missing context fails closed.
- Exported the pure input-to-decision API for Runtime, Runner, Recovery,
  Refinalizer, Public Guard, Mock Canary, aggregate audit and Replay Pack use.

## Phase A focused coverage

1. Missing competitor Evidence relation is pruned.
2. Ordinary observed-web Evidence does not become an official relation.
3. Official competitor Evidence without a Claim relation is pruned.
4. Official PARTIAL plus current-company support can publish.
5. Comparison-dimension mismatch is pruned precisely.
6. Unconfirmed competitor entity is pruned precisely.
7. Negative comparison without Coverage becomes Deep confirmation only.
8. Competitor-only observation does not remain a public Quick Gap.

Additional tests cover `UNSUPPORTED`, missing verifier provenance, missing
bounded-scope/conclusion metadata, Public Guard fail-closed behavior and a fully
verified Public Guard pass.

## Verification

- Focused policy suite: PASS — `1` file / `12` tests.
- Full report-validation suite: PASS — `9` files / `96` tests.
- Repository lint: PASS.
- TypeScript typecheck: PASS.
- `git diff --check`: PASS before commit.

## Convergence and handoff

- No Recovery mode, Provider, score, company/domain-specific rule, threshold or
  fallback was added.
- The pure policy input is deterministic and replayable; the historical
  missing-official-relation shape is covered by the general focused test seam.
- Runtime/Recovery/Refinalizer callers must provide the same persisted
  per-gap metadata map. Until then, existing deterministic gaps fail closed.
- A published gap with missing/invalid Evidence or non-verifier relations is a
  `P0_TRUTH_OR_SECURITY` integration blocker. Missing caller plumbing for valid
  persisted metadata is an `IMPLEMENTATION_BUG`; neither is bypassed here.

## Activity boundary

- Real Provider calls: `0`.
- Product search/crawl/LLM network calls: `0`.
- Private sample artifact reads/writes: `0`.
- Database reads/writes: `0`.
- New Diagnosis records: `0`.
- Real diagnosis runs: `0`.
- Scoring/report canonical schema changes: `0`.
- Sample-specific code or thresholds: `0`.
