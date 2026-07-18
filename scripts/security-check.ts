// Baseline placeholder. Agent G (qa-ci) replaces this with the full secret-scan
// / SSRF-regression / CTA-banned-words check described in docs/SECURITY_INVARIANTS.md.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FORBIDDEN_PATTERNS = [/BOCHA_API_KEY\s*=\s*[^\s]+/, /DEEPSEEK_API_KEY\s*=\s*[^\s]+/];

function main() {
  const tracked = execSync("git ls-files", { encoding: "utf-8" })
    .split("\n")
    .filter((f) => f && !f.startsWith(".env"));

  let violations = 0;
  for (const file of tracked) {
    if (file.endsWith(".sqlite") || file.endsWith(".db")) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue; // binary or unreadable, skip
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`[security:check] possible secret in ${file}`);
        violations++;
      }
    }
  }

  if (violations > 0) {
    console.error(`[security:check] FAILED — ${violations} violation(s)`);
    process.exit(1);
  }
  console.log("[security:check] baseline OK — no obvious secrets in tracked files");
}

main();
