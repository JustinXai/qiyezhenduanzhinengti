# Round-5.2B Frozen-Evidence Analysis Recovery — Execution Contract

## Status

`READY_FOR_RECOVERY_EXECUTION` means the QA runner and budget guards are ready
for integration. It does **not** authorize a real call and does **not** mean the
current `diag_d9d` can be recovered.

The current V2 record is forensically blocked. Its frozen
`competitorResolutionHash` and `queryPlanHash` are not available. The runner
prints this as boolean identity availability only, then stops before planning a
runtime repair, creating a repair-attempt row, or calling a Provider.

## Server-only authorization

The runner accepts only the exact process environment value:

```text
TECHNICAL_CANARY_REPAIR_AUTHORIZED=true
```

Authorization is not accepted from an API body, URL/query parameter, header,
frontend state, or user form. The runner has no public HTTP entrypoint and its
injected runtime is available only to the Supervisor's private execution seam.

## Mandatory preflight

Before any recovery call, the runner verifies:

- diagnosis ID is exactly `diag_d9d`;
- original state remains `FAILED / ANALYZING / REPORT_CLAIMS_FAILED`;
- the V2 run-lock exists;
- repair-attempt count is zero;
- the frozen and recomputed Diagnosis Input hashes match;
- the frozen and recomputed 22-Evidence Registry hashes match;
- the frozen and recomputed Competitor Resolution hashes both exist and match;
- the frozen and recomputed Query Plan hashes both exist and match;
- no Diagnosis has been added.

Missing identities never degrade to a document summary, Provider Usage row,
incomplete JSON, or newly synthesized value.

## Sanitized plan and budgets

The printed plan contains diagnosis ID, stage names, counts, boolean hash
availability, block codes, and budgets. It never prints inputs, Evidence,
hashes, prompts, raw Provider responses, credentials, or authorization values.

Claims always reruns with the integrated strict schema. The DeepSeek cap is
computed from the three earlier stages:

| Reusable earlier stages | Rerun stages | DeepSeek cap |
| ---: | --- | ---: |
| 0 | Profile, Scoring, AI Visibility, Claims | 4 |
| 1 | remaining two stages and Claims | 3 |
| 2 | remaining stage and Claims | 2 |
| 3 | Claims only | 1 |

All plans freeze Bocha at 0, Crawler at 0, automatic retries at 0, and new
Diagnoses at 0. The runner calls the recovery runtime once; it has no retry
loop. Any failure ends the authorized attempt.

## Integration and execution order

1. Integrate forensics, Claims schema, stage persistence/runtime, then this QA
   runner in that order.
2. Run all required quality and security gates.
3. Supervisor injects Agent O's read-only planner and one-shot recovery entry.
4. Inspect the sanitized plan. A non-empty `blockedBy` list is terminal.
5. Only if every frozen identity exists and matches may the Supervisor perform
   the single real recovery attempt.
6. After return, verify Provider deltas, Diagnosis count, original failure
   preservation, repair-attempt state chain, and absence of recovery internals
   from the public API.

For the current `diag_d9d`, step 4 blocks on
`COMPETITOR_RESOLUTION_HASH_MISSING` and `QUERY_PLAN_HASH_MISSING`; therefore
real Provider usage remains zero and no repair attempt is created.

