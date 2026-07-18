# Provider Canary V1 — Round-4 (pre-real-sample)

Desensitized result of the Round-4 real-provider connectivity canary. This file
contains **no** credentials, Authorization headers, full prompts, full response
bodies, or `publicToken`s — only shapes, hashes, timings, categories, and status.

- **Harness:** `scripts/provider-canary.ts`
- **Guard tests:** `tests/canary/provider-canary-guard.test.ts`
- **Private (repo-external) run artifacts:** `E:\企业诊断智能体_private\provider-canary-v1`

---

## STATUS

`BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED` — the fail-closed configuration gate fired.
Both providers were correctly stopped **before** any paid call because the required
real-provider configuration is absent on this host. **No** fallback to MOCK occurred.
This is the contractually-correct outcome for the missing-config case (Phase 3), not
a harness defect. Re-running the identical harness once the operator provisions the
keys will perform the ≤2 authorized real calls.

- **BRANCH:** `cursor/provider-canary-v1`
- **HEAD / BASELINE:** built from `b5ac84c63d4229181de98dbb1ef37c8d7f054deb`
  (tag `rebuild-pre-real-sample-v1`); `main` untouched.
- **AUTHORIZATION:** `PROVIDER_MODE=REAL`, `PROVIDER_CANARY_AUTHORIZED=true`,
  `DIAGNOSIS_SMOKE_MODE=false` (set at process level only; `.env` unmodified).
- **Config presence (values never read/printed):**
  `BOCHA_API_KEY` MISSING · `BOCHA_BASE_URL` MISSING · `DEEPSEEK_API_KEY` MISSING ·
  `DEEPSEEK_BASE_URL` MISSING · `DEEPSEEK_MODEL` MISSING.

---

## BOCHA_CANARY

- **Result:** FAIL (BLOCKED — did not reach a real request)
- **Requests:** 0 · **Retries:** 0
- **Endpoint host:** `api.bocha.cn` (frozen `/v1/web-search`, no base-url override)
- **HTTP status:** n/a (no request sent)
- **Result count:** n/a
- **Normalization:** n/a (no evidence candidates produced; nothing persisted)
- **URL security:** n/a (SSRF guard wired via `assertUrlAllowed` + `normalizeEvidence`;
  exercised by guard tests, not by a real call)
- **Latency:** n/a
- **Error category:** `REAL_PROVIDER_NOT_AUTHORIZED` (missing required config: `BOCHA_API_KEY`)

## DEEPSEEK_CANARY

- **Result:** FAIL (BLOCKED — did not reach a real request)
- **Requests:** 0 · **Retries:** 0
- **Endpoint host:** `api.deepseek.com` (`/chat/completions`)
- **Model:** `deepseek-v4-flash` (resolved default; `DEEPSEEK_MODEL` absent)
- **HTTP status:** n/a · **finish_reason:** n/a
- **content status:** n/a · **reasoning_content status:** n/a (only ever recorded as
  present/absent; never used as the answer)
- **JSON.parse:** n/a · **Zod (strict, frozen schema):** n/a
- **token usage:** n/a
- **Latency:** n/a
- **Error category:** `REAL_PROVIDER_NOT_AUTHORIZED` (missing required config: `DEEPSEEK_API_KEY`)

---

## TOTALS

- **TOTAL_REAL_PROVIDER_CALLS:** 0 (authorized ceiling: 2)
- **RETRIES:** 0
- **COST:** UNKNOWN — no approved provider price config exists in the repo; a `$0`
  is deliberately **not** fabricated.

## SECURITY_SCAN

- `pnpm security:check`: **OK** — 189 tracked files scanned; no secrets, no banned
  copy, SSRF behavior gate clean (52/52 adversarial cases).
- Private artifacts written outside the repo and covered by `.gitignore`
  (`_private/`, `real-samples/`, `**/*.private.*`, `PROVIDER_RESPONSE*`). Telemetry is
  a strict whitelist (hashes + shape booleans + timings + usage); raw bodies are held
  transiently in memory only and never persisted.

## QUALITY_GATES

| Gate | Result |
| --- | --- |
| `pnpm lint` | PASS (0 errors) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (512) |
| `pnpm build` | PASS |
| `pnpm smoke:mock` | PASS (7 steps, no real providers) |
| `pnpm security:check` | PASS |
| `pnpm test:e2e` | PASS (16) |

Canary guard tests (`tests/canary/provider-canary-guard.test.ts`, 28 cases) prove:
request cap = 1; retries = 0; Bocha ⟂ DeepSeek independence; hard budget rail
(2nd/3rd paid call throws, never sent); no diagnosis created; no report written;
raw response never persisted / no secret leak; REAL never falls back to MOCK;
unauthorized cannot execute; logs redacted; a provider failure never triggers the
full pipeline; official strict parser only (SCHEMA_MISMATCH / INVALID_JSON, no
markdown extraction, no auto-repair).

## READY_FOR_TECHNICAL_COMPANY_CANARY

**NO** — requires both providers PASS on a real call. The technical-company canary
must not run until the keys are provisioned and this canary is re-run to green.

---

### Re-run instructions (when keys are provisioned)

Set the five provider vars at the process level (or a local, gitignored `.env`
loaded by the operator's shell), then:

```
$env:PROVIDER_MODE="REAL"; $env:PROVIDER_CANARY_AUTHORIZED="true"; $env:DIAGNOSIS_SMOKE_MODE="false"
pnpm exec tsx scripts/provider-canary.ts
```

The harness re-reports PRESENT/MISSING, performs at most one request per provider
(zero retries, ≤2 paid calls total), writes desensitized telemetry to the private
directory, and prints the PASS/FAIL determination.
