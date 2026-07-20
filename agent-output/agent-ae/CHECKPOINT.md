# Agent AE Checkpoint — Round-6B Aggregate / Gate Semantics

Status: `AGGREGATE_SEMANTICS_CONFIRMED`

## Baseline and scope

- Base: `f432589a75622a74380d595e97b38f6c52132ce4`
- Branch: `cursor/round6b-agent-ae-aggregate`
- Implementation commit: `5c91e6f`
- Ownership checked against `AGENTS.md` and `docs/AGENT_FILE_OWNERSHIP.md`.
- Scope stayed within QA scripts/tests plus this checkpoint. No Provider, Diagnosis, Canonical, Evidence, relation, or report write occurred.

## Correction

- Gate 9 `OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY` was incorrectly coupled to the current 2/3 yield result, duplicating Gate 6.
- Correct semantics: Gate 6 alone evaluates the 2/3 product-yield threshold; Gate 9 is `PASS` whenever no 3/3 requirement exists. It remains `PASS` for 0/3, 1/3, or 2/3 current yield.
- Aggregate classification is now derived explicitly: `DATA_SPARSE` only when every failed gate belongs to Gate 6/7. Any other failure is `GATE_FAILURE`.
- Gate 5 remains `PASS` with zero published Opportunities.
- Gate 8 counts all Opportunity candidates, including pruned candidates.
- Empty Opportunity candidate denominator remains `null`, not zero.
- In an incomplete aggregate, empirical gates remain `NOT_EVALUABLE`; policy Gate 9 is independently `PASS`.

## Real aggregate recomputation

| Gate | Original | Correct |
| --- | --- | --- |
| 1 ALL_TRUTH_GUARDS_PASS | PASS | PASS |
| 2 NO_UNSUPPORTED_PUBLISHED_CLAIMS | PASS | PASS |
| 3 ALL_QUICK_WITHIN_1800 | PASS | PASS |
| 4 ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS | PASS | PASS |
| 5 ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID | PASS | PASS |
| 6 AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY | FAIL | FAIL |
| 7 AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX | FAIL | FAIL |
| 8 NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES | PASS | PASS |
| 9 OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY | FAIL | PASS |
| 10 SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE | PASS | PASS |

Final failed product gates: Gate 6 and Gate 7 only. Final sample status remains `FAIL`; classification remains `DATA_SPARSE`.

## Private artifacts

- Corrected aggregate: `E:\\企业诊断智能体_private\\three-company-sample-v1\\three-company-aggregate-v1.json`
  - SHA-256: `112DD4C1AE47A766D3868596A3C19E44A809DB0CC4CD3B7F51172D5F1837F887`
- Detailed audit: `E:\\企业诊断智能体_private\\product-yield-root-cause-lab-v1\\agent-ae\\aggregate-gate-audit-v1.json`
- Original aggregate SHA-256: `4D69FF47D1D5086FA2A2BA286D1C665B72EB2891B8F2C7DC0517D380B59C9955`

## Verification

- `pnpm exec tsc --noEmit --pretty false` — PASS
- ESLint on changed scripts/tests — PASS
- Targeted Vitest — PASS, 2 files / 33 tests
- Both regenerated private JSON artifacts parsed successfully.
- Real Provider calls: Bocha 0 / Crawler 0 / DeepSeek 0.
