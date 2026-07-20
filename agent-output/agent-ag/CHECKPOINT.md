# Round-6B Agent AG — Claims Model Shadow A/B Harness

## Scope

- Branch: `cursor/round6b-agent-ag-shadow-ab`
- Baseline: `f432589a75622a74380d595e97b38f6c52132ce4`
- Implements only the frozen-input Claims Flash/Pro Shadow A/B harness.
- No real Provider call was made by Agent AG.
- No Query Plan, Search, Crawl, Evidence mutation, scoring call, AI Visibility call,
  publication, Canonical write, or new Diagnosis is reachable from the harness.

## Frozen behavior

- Formal default remains `CLAIMS_MODEL_POLICY=FLASH`.
- Actual A/B execution requires all of:
  `CLAIMS_MODEL_POLICY=SHADOW`, `CLAIMS_SHADOW_AB_AUTHORIZED=true`,
  `PROVIDER_MODE=REAL`, `DIAGNOSIS_SMOKE_MODE=false`, `DEEPSEEK_API_KEY`, and
  `DEEPSEEK_BASE_URL`.
- Order is fixed: qiaqia Flash, qiaqia Pro, iflytek Flash, iflytek Pro, heli
  Flash, heli Pro.
- Budget is fixed at 6 calls: Flash 3, Pro 3, retries 0.
- Both models use the same current prompt version, schema, Evidence order,
  `max_tokens=4096`, `temperature=0`, `thinking=disabled`, builder, and Truth
  Policy versions.
- Raw response and full prompt are never written. Private output contains only
  hashes, token usage, latency, sanitized metrics, and frozen-input hashes.
- Historical ClaimEvidenceRelations are reused only when the complete built
  Shadow candidate is semantically identical to the latest frozen Canonical
  candidate. A matching positional id alone is never sufficient. Changed
  candidates remain unverified and non-publishable; no Verifier call is made.
- Latest `report_revisions` Canonical is preferred, so qiaqia uses its append-only
  revision. Legacy qiaqia non-Claims stage fingerprints fall back to immutable
  fields in that latest Canonical because individual stage runs predate it.

## Zero-Provider preflight

Run from this worktree. This command validates all three read-only databases,
latest Canonical revisions, Evidence registry identity, frozen hashes, output
location, exact order, and 3+3/retries=0 budget. It never enters `executeOne`,
does not require a key, and creates no artifact.

```powershell
pnpm exec tsx scripts/claims-model-shadow-ab.ts --qiaqia-db="E:\企业诊断智能体_private\three-company-sample-v1\01-qiaqia\qiaqia.sqlite" --iflytek-db="E:\企业诊断智能体_private\three-company-sample-v1\02-iflytek\iflytek.sqlite" --heli-db="E:\企业诊断智能体_private\three-company-sample-v1\03-heli\heli.sqlite" --output="E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\claims-model-shadow-ab-v1.json" --plan-only=true
```

Observed preflight: `PLAN_ONLY_NO_PROVIDER`, calls planned 6, Flash 3, Pro 3,
retries 0, output file absent after the check.

## Supervisor-only real execution

Only after explicit authorization and a successful preflight:

```powershell
$env:CLAIMS_MODEL_POLICY='SHADOW'
$env:CLAIMS_SHADOW_AB_AUTHORIZED='true'
$env:PROVIDER_MODE='REAL'
$env:DIAGNOSIS_SMOKE_MODE='false'
pnpm exec tsx scripts/claims-model-shadow-ab.ts --qiaqia-db="E:\企业诊断智能体_private\three-company-sample-v1\01-qiaqia\qiaqia.sqlite" --iflytek-db="E:\企业诊断智能体_private\three-company-sample-v1\02-iflytek\iflytek.sqlite" --heli-db="E:\企业诊断智能体_private\three-company-sample-v1\03-heli\heli.sqlite" --output="E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\claims-model-shadow-ab-v1.json"
```

The API key and base URL must already be present in the Supervisor process.
The command is one process with a synchronous loop; it cannot parallelize the
six calls. The output is created with exclusive-create semantics and must remain
outside Git.

Expected private output:

`E:\企业诊断智能体_private\product-yield-root-cause-lab-v1\claims-model-shadow-ab-v1.json`

## Verification

- `pnpm exec tsc --noEmit --pretty false` — PASS
- `pnpm exec vitest run tests/providers/deepseek-adapter.test.ts tests/analysis/claims-model-shadow-ab.test.ts --reporter=dot` — PASS, 36/36
- scoped ESLint — PASS, zero warnings
- `git diff --check` — PASS
- real Provider calls by Agent AG — 0
