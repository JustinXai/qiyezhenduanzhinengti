# Round-5.3 Agent U Checkpoint

Status: `YIELD_CAUSE_CONFIRMED`

Branch: `cursor/round53-yield-forensics`

Baseline: `cab80edb3bc910d2700a04309578dd5c1b045bb7`

## Classification

`D. INSUFFICIENT_SUPPORT`

The persisted Claims stage returned 3 Opportunities, but none had one DIRECT
relation or two genuinely independent PARTIAL sources. All three also lacked the
required Frozen-Evidence scope prefix in their customer-visible negative
contentGap. Keeping the final report at zero Opportunities is therefore a
truthful default-deny outcome, not a reason to synthesize a fallback.

## Counts

| Type | Candidate | Published |
|---|---:|---:|
| Strength | 2 | 2 |
| Issue | 3 | 3 |
| Opportunity | 3 | 0 |
| Demonstration Fix | 0 | 0 |

## Secondary implementation finding

The Supervisor-only frozen filter silently removed the three candidates and did
not persist `DroppedClaimRecord/reasonCode`. The general negative-claim guard
also counts relation rows rather than independent source domains. These are
audit/guard implementation gaps, but they did not cause a support-valid
Opportunity to be lost in this sample.

## Safety

- Focused tests: 3 files / 35 tests passed
- Typecheck: passed
- Security scan: passed; 52 SSRF behavior cases, no secret/banned-copy finding
- `git diff --check`: passed
- Real Provider calls: 0
- Recovery executions: 0
- New Diagnoses: 0
- V1/V2 business-table writes: 0
- Implementation/shared contract changes: 0
- Owned output only: `docs/qa/OPPORTUNITY_YIELD_FORENSICS.md` and this checkpoint
