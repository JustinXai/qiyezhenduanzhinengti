# Round-6 Agent X — Independent Support Source & Claim Publication Policy

STATUS: `FUNCTIONAL_COMMIT_COMPLETE_WITH_INTEGRATION_HANDOFF`

BRANCH: `cursor/round6-source-key`

BASELINE: `d995f87215f7a501fb72f5833bf76144e27493d3`

FUNCTIONAL_COMMIT: `dffc2f0021384a5ee1a15da28b0d17ce67bea670`

## Delivered scope

- Added the deterministic `IndependentSupportSourceKey` contract.
- Collapsed confirmed first-party domains to one current-company entity key.
- Collapsed resolved competitor domains to one competitor-entity key and
  default-denied unresolved competitor identity.
- Counted observed web Evidence by registrable-domain key rather than Evidence
  row id.
- Added one versioned `ClaimPublicationPolicy` for Issue, Strength and
  Opportunity publication thresholds.
- Routed Evidence Guard, Publish Guard and Frozen-Evidence Guard through the
  shared policy while preserving the existing guard result surface.
- Exported the policy and source-key helpers for Runtime, Recovery,
  Refinalizer, Sample Aggregator, Mock Canary and audit consumers.

## Frozen policy behavior

- Quick/deterministic Issue requires at least one `DIRECT_SUPPORT` relation.
- Strength and Opportunity require one `DIRECT_SUPPORT` relation or two
  different `IndependentSupportSourceKey` values with `PARTIAL_SUPPORT`.
- `CONTEXT_ONLY` does not count toward the publication threshold.
- Any `UNSUPPORTED` relation blocks publication.
- Negative/missing Claims retain the same base threshold and additionally
  require established Coverage plus an approved public scope limitation.
- Negative/missing Claims are not forbidden from using `DIRECT_SUPPORT`.

## Verification

- Focused report-validation suite: PASS — `5` files / `62` tests.
- TypeScript typecheck: PASS.
- Focused ESLint over all Agent X implementation and test files: PASS.
- Full lint had no Agent X error; one pre-existing warning remains in
  `tests/canary/pre-real-sample-canary.test.ts`.
- Full suite observation: `713 / 717` tests passed. Two SQLite latest-revision
  failures reproduce unchanged on baseline `d995f87`; two legacy Mock/Live
  expectations still assume a negative PARTIAL Claim may publish.

## Integration risk handoff

1. The current policy detects an approved scope phrase with a text search. The
   integration layer must ensure the relevant Claim field itself uses the
   approved prefix, especially Opportunity `contentGap`.
2. The second Frozen scope phrase contains “不充分”, which the existing
   polarity classifier may not classify as negative by itself. This must be
   closed before the integration gate.
3. `removeFrozenUnsupportedClaims` remains a divergent Frozen-only pruning
   path based on Evidence ids and two PARTIAL relations. Agent Y must remove or
   converge it onto the shared policy.
4. The legacy prune reason mapping does not distinguish missing Coverage from
   established Coverage with a missing scope prefix. Agent Y owns the precise,
   append-only `PruneDecision` mapping.
5. Offline Refinalizer currently invokes Publish Guard without the same unified
   pruning step used by normal Runtime. Agent Y must converge final behavior.
6. The compatibility source context uses `diagnosisId` when no stable
   `companyId` is supplied. Cross-diagnosis aggregation must pass an explicit
   company entity id; Agent Z has received this handoff.
7. Registrable-domain parsing is a deterministic common-suffix implementation,
   not a complete Public Suffix List. Uncommon multi-label/private suffixes
   require review before broadening accepted sample domains.

## Activity boundary

- Real Provider calls: `0`.
- Network Provider calls: `0`.
- Database reads/writes performed for this Agent task: `0`.
- New Diagnosis records: `0`.
- Real diagnosis runs: `0`.
- Insta360 V1/V2 artifacts modified: `0`.
- Integration branch or tags modified: `0`.
