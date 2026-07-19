# Round-5.2C Frozen-Evidence Reanalysis Execution

## Status

`READY_FOR_SUPERVISOR_INTEGRATION` means the Runner and QA policy are ready. It
does not authorize or claim a real execution.

Round-5.2C is an explicit `FROZEN_EVIDENCE_REANALYSIS`, not a third Diagnosis,
not a replay of search/crawl, and not an attempt to invent Round-5.2B's missing
Competitor Resolution or Query Plan. The input is Agent Q's validated
`FrozenEvidenceSnapshotV1`; all four analysis stages rerun against that frozen
snapshot through Agent R's runtime.

## Sole execution authority

Only Supervisor may construct the private runtime and call
`runFrozenEvidenceReanalysis`. The checked-in CLI has no SQLite or Provider
factory and exits blocked when run directly.

Both process conditions must be exact:

```text
DIAGNOSIS_RECOVERY_MODE=FROZEN_EVIDENCE_REANALYSIS
TECHNICAL_CANARY_REPAIR_AUTHORIZED=true
```

Neither value may come from an API body, query string, URL, frontend state,
Diagnosis input, Snapshot field, or user form. Removing either process value
must produce zero runtime calls and zero writes.

## Required injected seams

Supervisor integrates these capabilities without placing private paths or
Provider configuration in the Runner:

1. Agent Q loader: reads, parses and asserts the Insta360
   `FrozenEvidenceSnapshotV1` identity.
2. Diagnosis reader: resolves only the authorized `diag_d9d` prefix to the
   Snapshot's full persisted Diagnosis ID and verifies the preserved
   `FAILED / ANALYZING / REPORT_CLAIMS_FAILED` baseline, 22 Evidence and zero
   prior repair attempts.
3. Agent R runtime: read-only preparation followed by one execution call.
4. DeepSeek stage seam: exactly Profile → Scoring → AI Visibility → Claims,
   with strict schemas and no automatic retry.
5. Deterministic finalizer: Canonical assembly, Claim-Evidence Verification,
   Publish Guard, ChinesePublicReportGuard, report persistence and READY.
6. Ordinary public API reader and Quick/Deep/Evidence page verification hooks.

The Runner never constructs Bocha, Crawler, DeepSeek, SQLite, browser or HTTP
clients. It passes injected DeepSeek/finalizer functions to Agent R unchanged.

## Sanitized pre-call plan

The printable plan may contain only:

- Diagnosis short ID;
- explicit mode;
- authorization boolean;
- original-failure eligibility boolean;
- Snapshot recovery-contract version, Evidence count, and identity-field availability;
- four stage names;
- budgets: Bocha 0, Crawler 0, DeepSeek 4, retries 0, new Diagnoses 0;
- stable block codes.

It must not contain Snapshot hashes, captured time, Diagnosis input, Evidence,
Prompt, stage output, raw Provider response, API key, authorization value,
private paths, public token, or contact information.

## Mandatory preflight

Before Agent R preparation or any write:

- mode and process authorization are exact;
- Snapshot is Q-validated V1 and bound to `diag_d9d`;
- all required Snapshot identity fields are 64-character SHA-256 values;
- Snapshot capture time is valid;
- persisted Diagnosis is the same failed record;
- Evidence count is 22 in both Snapshot and Diagnosis;
- repair-attempt count is zero;
- runtime plan is exactly four ordered stages with DeepSeek cap 4.

Any failure stops before execution. There is no retry or fallback mode.

## Postconditions

Post-attempt checks run even when Agent R throws:

- the Snapshot identity is unchanged;
- Bocha delta = 0;
- Crawler delta = 0;
- DeepSeek delta ≤ 4;
- retry delta = 0;
- Diagnosis count is unchanged;
- the runtime was invoked at most once.

Success additionally requires:

- original failure history preserved;
- Repair Attempt = 1;
- timeline includes original FAILED and `FROZEN_EVIDENCE_REANALYSIS`;
- final state READY;
- ordinary public API contains no repair/reanalysis internals;
- Quick, Deep and Evidence views render;
- report language is `zh-CN`;
- Quick is at most 1,800 characters;
- 390 px viewport has no horizontal overflow;
- Evidence view exposes the same 22 frozen Evidence records.

## V1 / V2 execution record template

Complete this only after the sole authorized execution. Hash values and private
paths belong in the private artifact bundle, not this public document.

```text
STATUS:
SUPERVISOR_EXECUTION_COMMIT:
DIAGNOSIS_ID: diag_d9d
MODE: FROZEN_EVIDENCE_REANALYSIS
SNAPSHOT_SCHEMA: FROZEN_EVIDENCE_SNAPSHOT_V1
SNAPSHOT_IDENTITY_BEFORE_AFTER: MATCH / MISMATCH
ORIGINAL_FAILURE_PRESERVED: YES / NO
REPAIR_ATTEMPT: 1 / NONE

RERUN_STAGES:
- REPORT_PROFILE
- REPORT_SCORING
- REPORT_AI_VISIBILITY
- REPORT_CLAIMS

PROVIDER_DELTA:
- Bocha:
- Crawler:
- DeepSeek:
- retries:
- new Diagnoses:

FINAL_STATE:
CLAIMS_SCHEMA:
CLAIM_EVIDENCE_VERIFICATION:
PUBLISH_GUARD:
CHINESE_PUBLIC_REPORT_GUARD:
REPORT_LANGUAGE:

V1_REFERENCE:
- diagnosis:
- state:
- evidence count:
- report result:
- artifact identity unchanged:

V2_BEFORE_REANALYSIS:
- diagnosis:
- state:
- evidence count:
- published issues:
- GEO opportunities:

V2_AFTER_REANALYSIS:
- diagnosis:
- state:
- evidence count:
- published issues:
- GEO opportunities:
- sourceIssueId lineage:
- Evidence lineage:

QUICK_RESULT:
- rendered:
- character count:
- 390px overflow:

DEEP_RESULT:
- rendered:

EVIDENCE_RESULT:
- rendered:
- count:

PUBLIC_API_LEAK_GUARD:
QUALITY_GATES:
SECURITY_SCAN:
TECHNICAL_CANARY_PASS: YES / NO
READY_FOR_THREE_COMPANY_SAMPLE: YES / NO
```

## Stop rules

After the one execution, success or failure, stop. Do not start another repair,
create a third Insta360 Diagnosis, call search/crawl, increase the budget, start
another company, begin the three-company sample, deploy, merge to main, or move
a success tag unless all contractual gates have passed.
