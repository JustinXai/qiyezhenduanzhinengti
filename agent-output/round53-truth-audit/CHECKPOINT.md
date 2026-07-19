# Round-5.3 Agent T — Truth Gate Audit

STATUS: `POLICY_VIOLATION`

BRANCH: `cursor/round53-truth-audit`

BASELINE: `cab80edb3bc910d2700a04309578dd5c1b045bb7`

DIAGNOSIS: `diag_d9d81ba3428f4696b088870ca7416e49`

## Audit boundary

- Opened a temporary copy of the V2 SQLite database with both SQLite
  `readonly` and `query_only` enabled.
- Real Provider/network calls: `0`.
- New Diagnosis: `0`.
- Recovery/refinalization runs: `0`.
- V1/V2 source database writes: `0`.
- Source SQLite/main/WAL/SHM before/after identities: unchanged.
- Original Canonical report rows: exactly `1`; no revision was created by Agent T.

The machine-readable record is `truth-gate-audit.json`. It includes every
published Claim, every attached relation, evidence URL/domain, view location,
coverage assessment, exact threshold decision, frozen-artifact identities and
the required disposition. `run-audit.cjs` deterministically reproduces it from
a copied database.

## Per-Claim result

| Claim | Kind | DIRECT / PARTIAL / CONTEXT | Partial source identities | Public location | Coverage | Frozen threshold |
|---|---|---:|---:|---|---|---|
| `str_1` | Strength | `0 / 4 / 0` | `3` | Quick top Strength; Deep | n/a | PASS: at least two independent partial sources |
| `str_2` | Strength | `1 / 0 / 0` | `0` | Deep | n/a | PASS: one direct relation |
| `iss_1` | Core Issue | `0 / 2 / 1` | `1` | Quick top/headline/list; Deep | bounded | **FAIL: Quick has no direct relation** |
| `iss_2` | Core Issue | `0 / 2 / 1` | `1` | Quick list; Deep | bounded | **FAIL: Quick has no direct relation** |
| `iss_3` | Core Issue | `0 / 2 / 1` | `1` | Quick list; Deep | bounded | **FAIL: Quick has no direct relation** |

Published Opportunity=`0`, Competitor Gap=`0`, Demonstration Fix=`null`.
Opportunity=0 is allowed by Round-5.3 and is not itself a Truth Gate failure.

Raw domains are retained in the JSON. For independence, subdomains of
`insta360.com` are one source identity; therefore `iss_2`'s two partial
relations are not independent sources.

## Exact policy violations

1. `iss_1`, `iss_2` and `iss_3` all appear in Quick with
   `DIRECT_SUPPORT=0`. Round-5.3 requires at least one direct relation for every
   Quick core issue.
2. `iss_1` is also `Quick.topIssue` and is interpolated into the Quick headline,
   so the unsupported Quick promotion is duplicated beyond the issue card.
3. `iss_1` cites `ev_4e33f5fd`; that frozen snippet contains “产品对比” while the
   negative issue says the bounded scope did not reveal systematic product
   comparison content. This is a conflicting signal, not direct proof of
   absence.
4. `iss_3` says the frozen public scope did not reveal systematic scenario
   content, while frozen registry item `ev_11461056` contains “日常家庭记录，外出旅拍
   还是运动拍摄”. That observation must not be promoted as a Quick fact.

The three negative issues do use scope-bounded wording and have
`MEASUREMENT_BOUNDARY` relations. They are therefore eligible only for a Deep
`NEEDS_CONFIRMATION` treatment, subject to the Supervisor's offline,
append-only refinalization design; they are not eligible for Quick.

## Other truth checks

- Published Claim traceability: PASS (`14` relations for `5` published Claims).
- Negative coverage limitation: PASS for all three issues.
- No all-network/globalized negative wording: PASS.
- No Provider/recovery/crawl failure published as an enterprise issue: PASS.
- The Deep profile contains “本次恢复未重新确认竞品官方网站”; this is a
  measurement limitation and is not scored or published as a company issue.
- Strength/Opportunity relation threshold: PASS (`str_1` by independent partial
  sources, `str_2` by direct support, no Opportunity to evaluate).
- Evidence mismatch/conflicting-signal check: FAIL for `iss_1` and `iss_3` as
  detailed above.

## Required disposition

- Remove all three issues, including the derived top-issue headline clause,
  from Quick unless a persisted direct relation exists.
- Preserve partial negative observations only in Deep as bounded
  `NEEDS_CONFIRMATION` material.
- Use zero-Provider offline finalization only; do not rerun Recovery or alter
  analysis-stage output.
- Preserve the original Canonical and original report row; any correction must
  be append-only.

## Verification

- Audit script syntax: PASS.
- Audit execution: `POLICY_VIOLATION` reproduced from a copied, query-only DB.
- Audit determinism: PASS — two consecutive outputs were byte-identical;
  SHA-256 `249cd47c4148d104424f4a8b564c1111fab1707896c1db00ecc097e069875c58`.
- Relevant tests: PASS — `3` files / `40` tests.
  - report presentation service: `22`
  - Evidence Guard: `11`
  - Frozen-Evidence Guard: `7`
- Provider calls made by Agent T: `0`.
- Database writes made by Agent T: `0`.
