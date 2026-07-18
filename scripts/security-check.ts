// ============================================================================
// scripts/security-check.ts — Agent G (qa-ci) security & product-truth gate.
//
// Three independent checks aggregate into a single exit code. The whole script
// MUST exit 0 on the current baseline tree (no violations are seeded); it only
// fails when a real regression is introduced.
//
//   1) Secret scan       — API keys / bearer tokens / DB credentials committed
//                          into any tracked file (docs/SECURITY_INVARIANTS.md).
//   2) Banned-copy scan  — forbidden综合分别名 (docs/REPORT_CONTRACT.md §1) and
//                          forbidden营销文案 (docs/PRODUCT_TRUTH_RULES.md §9)
//                          appearing in CUSTOMER-VISIBLE source strings.
//   3) SSRF behavior gate — drives the REAL guarded crawler with an adversarial
//                          corpus (private IPs, DNS rebinding, redirect-to-
//                          private, alt IP encodings, protocol/credential
//                          smuggling, response limits) and asserts every case is
//                          rejected — while legitimate public traffic still
//                          succeeds. Enforced by default (strict-on); it does NOT
//                          grep crawler source for keywords, so it cannot be
//                          satisfied (or broken) by comments/token vocabulary.
//                          (docs/SECURITY_INVARIANTS.md, Agent J.)
//
// Escape hatch: a source line containing the marker `security-check:allow` is
// skipped by the banned-copy scan (use sparingly, e.g. an intentional negative
// test string). Secret scanning has no opt-out. The SSRF behavior gate is strict
// by default; set SECURITY_CHECK_SSRF_STRICT=0 to downgrade a failure to a
// warning (emergency only — a red gate here means the crawler stopped blocking a
// real SSRF vector).
// ============================================================================
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { BANNED_TERMS } from "../tests/fixtures/banned-terms";
import { runAllSsrfCases, SSRF_CASES } from "../tests/security/crawler/ssrf-behavior-cases";

const ALLOW_MARKER = "security-check:allow";

function trackedFiles(): string[] {
  return execSync("git ls-files", { encoding: "utf-8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function readText(file: string): string | null {
  if (/\.(sqlite|db|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot|pdf)$/i.test(file)) {
    return null;
  }
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null; // binary / unreadable
  }
}

// ---------------------------------------------------------------------------
// 1) Secret scan (kept from baseline, modestly broadened).
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "BOCHA_API_KEY assignment", re: /BOCHA_API_KEY\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/ },
  { label: "DEEPSEEK_API_KEY assignment", re: /DEEPSEEK_API_KEY\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/ },
  { label: "generic sk- api key", re: /sk-[A-Za-z0-9]{20,}/ },
  { label: "Authorization Bearer token", re: /Authorization["'\s]*:["'\s]*Bearer\s+[A-Za-z0-9._\-]{12,}/i },
  {
    label: "DB connection string with credentials",
    re: /(postgres|postgresql|mysql|mongodb|redis|mssql):\/\/[^:/@\s]+:[^@/\s]+@/i,
  },
];

function scanSecrets(files: string[]): number {
  let violations = 0;
  for (const file of files) {
    if (file.startsWith(".env")) continue; // .env* are gitignored anyway; never scanned
    const content = readText(file);
    if (content === null) continue;
    for (const { label, re } of SECRET_PATTERNS) {
      if (re.test(content)) {
        console.error(`[security:check] secret-scan: possible ${label} in ${file}`);
        violations++;
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 2) Banned-copy scan — customer-visible strings only.
// ---------------------------------------------------------------------------
// The docs that DEFINE these bans (docs/**), the scanner itself (scripts/**)
// and the tests that assert against them (tests/**) legitimately contain the
// words, so the scan is scoped to product source that actually renders to a
// customer: app/**, components/**, src/**.

const CUSTOMER_VISIBLE_ROOTS = ["app/", "components/", "src/"];

// Guard/validation source legitimately enumerates the banned phrases so it can
// DETECT them (e.g. src/report/validation/cta-guard.ts holds BANNED_PHRASES).
// It is server-side logic that never renders to a customer, so — like docs/** —
// it is excluded from the banned-copy scan. Customer-facing copy under
// presentation / generation / components / pages is still scanned.
const BANNED_COPY_EXCLUDED_PREFIXES = ["src/report/validation/"];

// Banned score aliases (docs/REPORT_CONTRACT.md §1) and marketing/恐吓 copy
// (docs/PRODUCT_TRUTH_RULES.md §9) come from the shared single source of truth
// so the gate and the vitest guard can never drift.

function isCustomerVisible(file: string): boolean {
  if (BANNED_COPY_EXCLUDED_PREFIXES.some((p) => file.startsWith(p))) return false;
  return CUSTOMER_VISIBLE_ROOTS.some((root) => file.startsWith(root));
}

function scanBannedCopy(files: string[]): number {
  let violations = 0;
  for (const file of files) {
    if (!isCustomerVisible(file)) continue;
    const content = readText(file);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const { term, category } of BANNED_TERMS) {
        if (line.includes(term)) {
          console.error(
            `[security:check] banned-copy(${category}): "${term}" in ${file}:${idx + 1}`,
          );
          violations++;
        }
      }
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 3) SSRF behavior gate (strict-by-default, BEHAVIORAL — not keyword-based).
// ---------------------------------------------------------------------------
// Instead of grepping crawler source for token vocabulary (which proves nothing
// about runtime behaviour and false-fails on a correct implementation that uses
// e.g. CIDR arrays instead of the literal "10.0.0.0/8"), this runs an
// adversarial corpus through the REAL guarded crawler and asserts the observed
// outcome. A crawler that stops blocking any SSRF vector makes its case fail;
// a crawler "hardened" into rejecting everything fails the positive controls.
// The corpus (tests/security/crawler/ssrf-behavior-cases.ts) is the single
// source of truth shared with the vitest gate, so the two can never drift.
//
// Strict by default: any failing case is a hard violation. Set
// SECURITY_CHECK_SSRF_STRICT=0 to downgrade to a warning (emergency only).

const CRAWLER_ROOT = "src/security/crawler/";

async function ssrfBehaviorGate(): Promise<number> {
  // Defensive: if the crawler source is absent (e.g. a partial checkout) the
  // corpus import above would already fail, but keep an explicit skip note.
  if (!existsSync(CRAWLER_ROOT)) {
    console.log(
      `[security:check] ssrf-gate: SKIPPED — ${CRAWLER_ROOT} not present in this worktree.`,
    );
    return 0;
  }

  const results = await runAllSsrfCases();
  const failures = results.filter((r) => !r.pass);
  const downgrade = process.env.SECURITY_CHECK_SSRF_STRICT === "0";

  if (failures.length === 0) {
    console.log(
      `[security:check] ssrf-gate: OK — all ${SSRF_CASES.length} adversarial SSRF case(s) behaved as required ` +
        "(malicious targets rejected, public traffic allowed).",
    );
    return 0;
  }

  const detail = failures.map((f) => `  - ${f.name}: ${f.detail}`).join("\n");
  if (downgrade) {
    console.warn(
      `[security:check] ssrf-gate: WARNING (SECURITY_CHECK_SSRF_STRICT=0) — ` +
        `${failures.length} SSRF behavior case(s) failed:\n${detail}`,
    );
    return 0;
  }
  console.error(
    `[security:check] ssrf-gate: FAILED — ${failures.length} SSRF behavior case(s) failed. ` +
      `The crawler stopped enforcing a real SSRF invariant:\n${detail}`,
  );
  return failures.length;
}

// ---------------------------------------------------------------------------
// Aggregate.
// ---------------------------------------------------------------------------

async function main() {
  const files = trackedFiles();

  const secretViolations = scanSecrets(files);
  const bannedViolations = scanBannedCopy(files);
  const ssrfViolations = await ssrfBehaviorGate();

  const total = secretViolations + bannedViolations + ssrfViolations;
  if (total > 0) {
    console.error(
      `[security:check] FAILED — ${total} violation(s) ` +
        `(secrets=${secretViolations}, banned-copy=${bannedViolations}, ssrf=${ssrfViolations})`,
    );
    process.exit(1);
  }

  console.log(
    `[security:check] OK — scanned ${files.length} tracked file(s); ` +
      "no secrets, no banned copy, SSRF behavior gate clean.",
  );
}

main().catch((err) => {
  console.error(`[security:check] FAILED — unexpected error: ${String(err)}`);
  process.exit(1);
});
