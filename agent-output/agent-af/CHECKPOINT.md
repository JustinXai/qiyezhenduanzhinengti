# Agent AF Checkpoint — Round-6B Yield Forensics

## Status

`YIELD_ROOT_CAUSE_CONFIRMED`

## Baseline

- Branch: `cursor/round6b-agent-af-yield-forensics`
- Worktree: `E:\企业诊断智能体_worktrees\round6b-agent-af-yield-forensics`
- Base: `f432589a75622a74380d595e97b38f6c52132ce4`
- Remote integration at start: `f432589a75622a74380d595e97b38f6c52132ce4`
- Production Truth Guard tag dereferences to the same commit.

## Scope

Read-only three-company Candidate → Evidence → Decision forensics. No real Provider call,
no new Diagnosis, and no writes to historical Canonical, Evidence, ClaimEvidenceRelation,
Publication Decision, or private source SQLite files.

## Results

- Qiaqia: 36 Evidence, 8 Candidates, 8 Decisions, 1 Published Strength. Primary cause
  `GUARD_CORRECTLY_REJECTED`; secondary `INDEPENDENT_SUPPORT_TOO_THIN` and
  `EVIDENCE_TIERING_MISCLASSIFIED`.
- Iflytek: 39 Evidence, 9 Candidates, 9 Decisions, 2 Published Strengths. Primary cause
  `GUARD_CORRECTLY_REJECTED`; secondary includes Candidate–relation misalignment for
  `geo_2/geo_3`, classified `CANDIDATE_SOURCE_OR_AUDIT_BUG`.
- Heli: 35 Evidence, including 19 first-party and 1 competitor item; persisted successful
  `REPORT_CLAIMS` payload itself has zero Candidates. Primary cause
  `MODEL_RETURNED_ZERO_CANDIDATES`, not resolver/schema/builder loss.
- Tier URL audit: qiaqia has 7 and iflytek 3 known marketplace/community URLs mislabeled
  Tier C because display-valued `sourceDomain` does not match actual URL hostname.
- Query Plan/raw search/raw crawl/beforeDedup are not persisted; no inferred values were used.

## Verification

- Offline extractor assertions: PASS (3 companies; expected Evidence/Candidate/Decision counts).
- Source SQLite SHA-256 recheck after extraction: PASS.
- Provider calls during this task: Bocha 0 / Crawler 0 / DeepSeek 0.
- New real Diagnoses: 0.
- Typecheck (`pnpm exec tsc --noEmit --pretty false`): PASS.
- Lint (`pnpm lint`): PASS.
- Patch whitespace (`git diff --check`): PASS.

## Git-tracked output

- `docs/qa/ROUND_6B_AGENT_AF_YIELD_FORENSICS.md`
- `agent-output/agent-af/CHECKPOINT.md`

Private raw artifacts are under
`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1` and are not committed.
