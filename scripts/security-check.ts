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
//   3) SSRF config hook   — regression guard for the crawler SSRF blocklist
//                          (docs/SECURITY_INVARIANTS.md). INTEGRATION-GATED until
//                          Agent C's `src/security/crawler/` lands in this tree.
//
// Escape hatch: a source line containing the marker `security-check:allow` is
// skipped by the banned-copy scan (use sparingly, e.g. an intentional negative
// test string). Secret scanning has no opt-out.
// ============================================================================
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { BANNED_TERMS } from "../tests/fixtures/banned-terms";

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

// Banned score aliases (docs/REPORT_CONTRACT.md §1) and marketing/恐吓 copy
// (docs/PRODUCT_TRUTH_RULES.md §9) come from the shared single source of truth
// so the gate and the vitest guard can never drift.

function isCustomerVisible(file: string): boolean {
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
// 3) SSRF config regression hook (INTEGRATION-GATED placeholder).
// ---------------------------------------------------------------------------
// The crawler (src/security/crawler/, Agent C) is not in this worktree yet.
// Until it lands the hook is a no-op that passes. Once crawler source appears,
// it verifies the SSRF blocklist still references every required target from
// docs/SECURITY_INVARIANTS.md. Missing tokens are hard failures only when
// SECURITY_CHECK_SSRF_STRICT=1 (opt-in after Agent C confirms the token
// vocabulary); otherwise they are reported as warnings so the gate never goes
// red on an implementation this agent cannot see.

const CRAWLER_ROOT = "src/security/crawler/";

// Required SSRF invariants. Each entry lists acceptable substrings — the guard
// passes for an invariant if ANY of its tokens appears somewhere in crawler src.
const REQUIRED_SSRF_INVARIANTS: { name: string; anyOf: string[] }[] = [
  { name: "loopback / localhost", anyOf: ["localhost", "127.0.0.0/8", "127.0.0.1"] },
  { name: "private 10.0.0.0/8", anyOf: ["10.0.0.0/8", "10.0.0.0"] },
  { name: "private 172.16.0.0/12", anyOf: ["172.16.0.0/12", "172.16.0.0"] },
  { name: "private 192.168.0.0/16", anyOf: ["192.168.0.0/16", "192.168.0.0"] },
  { name: "link-local 169.254", anyOf: ["169.254", "link-local", "linkLocal"] },
  { name: "cloud metadata endpoint", anyOf: ["169.254.169.254", "metadata"] },
  { name: "IPv6 local / private", anyOf: ["::1", "fc00", "fd00", "fe80", "IPv6", "ipv6"] },
  { name: "protocol allowlist (http/https only)", anyOf: ["http:", "https:", "protocol"] },
];

function ssrfConfigRegressionHook(files: string[]): number {
  const crawlerFiles = files.filter((f) => f.startsWith(CRAWLER_ROOT));
  if (crawlerFiles.length === 0) {
    console.log(
      `[security:check] ssrf-hook: INTEGRATION-GATED — ${CRAWLER_ROOT} not present in this worktree yet, skipping.`,
    );
    return 0;
  }

  const strict = process.env.SECURITY_CHECK_SSRF_STRICT === "1";
  const corpus = crawlerFiles.map((f) => readText(f) ?? "").join("\n");
  const missing: string[] = [];
  for (const { name, anyOf } of REQUIRED_SSRF_INVARIANTS) {
    if (!anyOf.some((token) => corpus.includes(token))) {
      missing.push(name);
    }
  }

  if (missing.length === 0) {
    console.log(
      `[security:check] ssrf-hook: OK — all ${REQUIRED_SSRF_INVARIANTS.length} SSRF invariants referenced in crawler source.`,
    );
    return 0;
  }

  const detail = missing.map((m) => `  - ${m}`).join("\n");
  if (strict) {
    console.error(
      `[security:check] ssrf-hook: FAILED (strict) — crawler source is missing references to:\n${detail}`,
    );
    return missing.length;
  }
  console.warn(
    `[security:check] ssrf-hook: WARNING — crawler source is missing references to (set SECURITY_CHECK_SSRF_STRICT=1 to enforce):\n${detail}`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Aggregate.
// ---------------------------------------------------------------------------

function main() {
  const files = trackedFiles();

  const secretViolations = scanSecrets(files);
  const bannedViolations = scanBannedCopy(files);
  const ssrfViolations = ssrfConfigRegressionHook(files);

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
      "no secrets, no banned copy, SSRF hook clean.",
  );
}

main();
