# Round-6B Agent AH Checkpoint

## Status

`EVIDENCE_CLOSURE_AND_ENRICHMENT_CONTRACT_READY`

## Baseline / branch

- Baseline: `f432589a75622a74380d595e97b38f6c52132ce4`
- Branch: `cursor/round6b-agent-ah-evidence-closure`
- Worktree: `E:\企业诊断智能体_worktrees\round6b-agent-ah-evidence-closure`

## Delivered

- `EvidenceRequirementSlot` and `NextBestEvidenceAction` contracts.
- Bounded, pure `EvidenceClosurePlannerV1`.
- `CustomerEvidenceRequestPackV1` with five-request cap and prohibited-material guard.
- Append-only `DiagnosisEnrichmentSession` contract.
- Contract guard preventing customer confirmation from automatically becoming DIRECT.
- Both Round-6B flags frozen `false`; no URL/form/runtime activation seam.
- Read-only offline private-artifact generator; no Provider/search/crawl/report writes.
- Contract and planner QA plus two frozen contract documents.

No change was made to `src/contracts/index.ts`, Canonical, Quick/Deep/Evidence contracts,
Publication Policy, scores, AI Visibility, Provider code, storage schema, API, UI, or shared config.

## Frozen future budget

- candidates/company: 3
- slots/candidate: 2
- targeted queries/company: 4
- targeted crawls/company: 4
- closure rounds: 1
- retries: 0

No Closure action was executed.

## Three-company offline output

Authoritative private directory:

`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\evidence-closure-agent-ah-final`

| Company | Pruned candidates | Selected | Slots | Requests |
|---|---:|---:|---:|---:|
| qiaqia | 7 | 3 (`geo_1`, `geo_2`, `iss_1`) | 6 | 4 |
| iflytek | 7 | 3 (`geo_1`, `geo_2`, `iss_1`) | 5 | 3 |
| heli | 0 | 0 | 0 | 0 |

Combined Slot distribution:

- `INDEPENDENT_THIRD_PARTY_SUPPORT`: 4
- `CURRENT_COMPANY_DIRECT_FACT`: 5
- `CUSTOMER_DOCUMENT_REQUIRED`: 1
- `CURRENT_COMPANY_COVERAGE`: 1

Combined Next Action distribution (plans only):

- `TARGETED_WEB_SEARCH`: 4
- `TARGETED_OFFICIAL_CRAWL`: 5
- `REQUEST_CUSTOMER_DOCUMENT`: 1
- `KEEP_AS_NEEDS_CONFIRMATION`: 1

安徽合力的 final candidate ledger 为 0，因此输出 `NO_PRUNED_CANDIDATES` 空计划，不伪造
Candidate、Slot 或客户请求。

Private summary hash:

`AF09EAC3383B141489BB3991DE696D7C5F784CCAE6928FA46D38A910DCC26BC6`

## Verification

- `pnpm exec vitest run tests/contracts tests/evidence --reporter=dot`
  - 6 files passed
  - 41 tests passed
- `pnpm exec tsc --noEmit --pretty false`: PASS
- targeted ESLint on all Agent AH code/tests: PASS
- `git diff --check`: PASS

## Provider and mutation audit

- Bocha calls: 0
- Crawler calls: 0
- DeepSeek calls: 0
- New diagnoses: 0
- Existing Evidence mutations: 0
- Existing ClaimEvidenceRelation mutations: 0
- Existing Canonical mutations: 0
- Customer uploads: 0
- Feature activation: 0

## Integration note

Per Round-6B submission policy, this feature remains isolated on the Agent AH branch with both flags
off. It requires human review before any integration and must not be deployed or run automatically.
