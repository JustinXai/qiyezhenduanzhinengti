# Round-5.2 Chinese Technical Canary V2 — CHECKPOINT

- Branch: `cursor/technical-company-canary-zh-v2`
- Baseline: `cd469bf1defc2cecbcd6f11a7c6b413a1cf32c9f`
- Target: 影石创新 / Insta360
- Real diagnoses created in this round: 1
- Final diagnosis state: `FAILED` at `ANALYZING`
- Failure: `REPORT_CLAIMS_FAILED` because the non-null Demonstration Fix omitted
  required `currentIssue`
- Rerun: NO
- V1 artifact preserved: YES (pre/post per-file hashes identical)
- Integration merge: NO
- Success tag: NO
- Three-company sample: NOT READY

## Delivered

- Generic Runner profile isolation for V1 and `zh-v2`, with fail-closed profile
  matching and a dedicated V2 private directory/database/run-lock.
- Mock tests for profile isolation and unchanged V1 defaults.
- Desensitized V1/V2 audit at
  `docs/qa/TECHNICAL_COMPANY_CANARY_ZH_V2.md`.

## Gates

Preflight and post-run: lint (0 errors; 1 existing warning), typecheck, 564 tests,
build, Mock smoke, security check with 52-case SSRF behavior gate, 16 E2E tests,
and production audit with 0 known vulnerabilities all passed.

