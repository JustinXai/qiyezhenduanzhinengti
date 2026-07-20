# Agent AI Checkpoint — Round-6B Trust 60 / Sales 40

Status: `TRUST_SALES_ACTUAL_REVIEW_COMPLETE`

## Baseline and scope

- Base: `03d8332bc6462e3ef2477d157898f8bd08280ab4`
- Branch: `cursor/round6b-agent-ai-trust-sales`
- Ownership checked against `AGENTS.md` and `docs/AGENT_FILE_OWNERSHIP.md`.
- Read-only review of the three final reports, persisted relations/decisions, corrected aggregate and existing screenshots.
- No report, private SQLite, Evidence, ClaimEvidenceRelation, score, provider state or Canonical was modified.
- No real Provider call and no new Diagnosis.

## Actual Trust / Sales result

| Company | Trust / 60 | Sales / 40 | Total / 100 | Hard violations |
| --- | ---: | ---: | ---: | ---: |
| qiaqia | 56 | 27 | 83 | 0 |
| iflytek | 58 | 28.5 | 86.5 | 0 |
| heli | 57 | 21 | 78 | 0 |
| **Average** | **57.0** | **25.5** | **82.5** | **0** |

The total is descriptive only and is not a Pilot threshold. Sales did not override Truth.

## Decisions

- Current single-stage: `ACTUAL_REVIEW`
- Proposed public-plus-enrichment flow: `DESIGN_REVIEW`
- Product flow recommendation: `ADOPT_TWO_STAGE_PUBLIC_PLUS_ENRICHMENT`
- Pilot candidate conclusion: `READY_FOR_INTERNAL_DEMO_ONLY`
- Controlled customer Pilot now: `NO`

The corrected real aggregate still fails only product-yield Gates 6 and 7: 0/3 companies have a publishable Opportunity and 0/3 have a publishable Demonstration Fix. This is `DATA_SPARSE`, not a Truth failure and not authorization for a code or threshold fallback.

## Deliverables

- `docs/qa/TRUST_60_SALES_40_ACTUAL_V1.md`
- `docs/qa/CONTROLLED_PILOT_READINESS_V1.md`
- `agent-output/agent-ai/CHECKPOINT.md`

## Verification

- Markdown scope and repository diff inspection — PASS.
- `pnpm typecheck` — PASS.
- Targeted credential-value scan — PASS.
- Real Provider calls: Bocha 0 / Crawler 0 / DeepSeek 0.
- New real Diagnoses: 0.
