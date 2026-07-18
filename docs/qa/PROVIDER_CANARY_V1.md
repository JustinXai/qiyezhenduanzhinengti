# Provider Canary V1 — Round-4 / 4B (pre-real-sample)

Desensitized result of the real-provider connectivity canary. Contains **no**
credentials, Authorization headers, full prompts, full response bodies, or
`publicToken`s — only shapes, hashes, timings, categories, and status.

- **Harness:** `scripts/provider-canary.ts` (unmodified for the real run)
- **Guard tests:** `tests/canary/provider-canary-guard.test.ts` (28)
- **Env layer:** `src/runtime/load-environment.ts` + `src/runtime/server-env.ts`;
  config lives in a gitignored `.env.local`, loaded via `@next/env`
- **Private (repo-external) run artifacts:** `E:\企业诊断智能体_private\provider-canary-v1`

---

## STATUS

`PASS` — both providers returned a valid, schema-conformant real response on a
single request each. `READY_FOR_TECHNICAL_COMPANY_CANARY=YES`.

- **BRANCH:** `cursor/provider-canary-v1`
- **BASELINE:** `b5ac84c63d4229181de98dbb1ef37c8d7f054deb` (tag `rebuild-pre-real-sample-v1`)
- **AUTHORIZATION:** `PROVIDER_MODE=REAL`, `PROVIDER_CANARY_AUTHORIZED=true`,
  `DIAGNOSIS_SMOKE_MODE=false` (set at the process level, which overrides the
  `.env.local` MOCK defaults). Keys are held only in the gitignored `.env.local`
  and were never committed, printed, or written by the agent.
- **Config presence (values never read/printed):** all five PRESENT —
  `BOCHA_API_KEY`, `BOCHA_BASE_URL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`.

---

## BOCHA_CANARY — PASS

- **Requests:** 1 · **Retries:** 0
- **Endpoint host:** `api.bocha.cn` (frozen `/v1/web-search`)
- **HTTP status:** 200 · **Content-Type:** application/json
- **Result count:** 3 (all valid — each has a non-empty title and an https URL)
- **URL security:** every result URL passed the SSRF guard (`assertUrlAllowed`);
  normalized Evidence candidates contained no private-network / metadata / credential URL
- **Normalization:** succeeded (in-memory only; no Evidence DB record created)
- **Latency:** ~388 ms
- **Error category:** none

## DEEPSEEK_CANARY — PASS

- **Requests:** 1 · **Retries:** 0
- **Endpoint host:** `ws-7cgcqml493la1zt0.cn-beijing.maas.aliyuncs.com` (`/chat/completions`, OpenAI-compatible)
- **Model:** `deepseek-v4-flash`
- **HTTP status:** 200 · **Content-Type:** application/json
- **Chat-completion shape:** valid · **choices:** 1 · **finish_reason:** stop · **content:** present
- **reasoning_content:** absent (recorded present/absent only; never used as the answer)
- **JSON.parse:** ok (official strict parser; no markdown extraction, no auto-repair)
- **Zod (frozen strict schema):** ok — returned exactly
  `{ "status": "ok", "purpose": "enterprise-diagnosis-provider-canary", "version": 1 }`
- **Token usage:** input 79 / output 22
- **Latency:** ~1002 ms
- **Error category:** none

---

## TOTALS

- **TOTAL_REAL_PROVIDER_CALLS:** 2 (ceiling: 2)
- **RETRIES:** 0
- **COST:** UNKNOWN — no approved provider price config exists in the repo; a `$0`
  is deliberately not fabricated.

## SECURITY_SCAN — PASS

- `pnpm security:check`: OK — 193 tracked files; no secrets, no banned copy, SSRF
  behavior gate clean (52/52).
- No real key fragment appears in the private artifacts or the git tree; `.env.local`
  is gitignored and was not committed. Telemetry is a strict whitelist (hosts, shape
  booleans, timings, token usage, counts); raw response bodies were held only
  transiently in memory. The defensive redaction pass over-redacted the raw-response
  SHA-256 to `[REDACTED_HEX]` in the persisted files — harmless (no raw body stored).

## QUALITY_GATES

| Gate | Result |
| --- | --- |
| `pnpm lint` | PASS (0 errors) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (524, incl. 28 canary guards + 12 env-layer) |
| `pnpm security:check` | PASS |
| `pnpm build` / `pnpm smoke:mock` / `pnpm test:e2e` | PASS (unchanged harness runtime; last green on the env-refactor commit) |

## READY_FOR_TECHNICAL_COMPANY_CANARY

**YES** — both providers PASS, 2 real calls, 0 retries, security scan clean, 0 real
diagnoses. Tag: `rebuild-provider-canary-v1`.

The technical-company canary is a separate, later step and was **not** started here.
