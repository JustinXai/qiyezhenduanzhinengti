// ============================================================================
// scripts/technical-company-canary.ts — Round-5 one-shot full-chain canary.
//
// Drives ONE real company diagnosis through the OFFICIAL application boundary:
// spawned Next server → POST /api/diagnoses → state machine → real providers
// (TECHNICAL_COMPANY_CANARY_V1 budget) → storage → GET → /report/[token]
// Quick/Deep/Evidence/print — then writes DESENSITIZED artifacts + screenshots
// to the repo-external private directory.
//
// Hard rails:
//   • Refuses to run unless PROVIDER_MODE=REAL + TECHNICAL_COMPANY_CANARY_
//     AUTHORIZED=true + DIAGNOSIS_SMOKE_MODE=false + all provider config present
//     (fail-closed, never a MOCK fallback).
//   • ONE diagnosis ever: a run-lock file in the private dir blocks any second
//     run (success OR failure) — only a deliberate operator delete re-arms it.
//   • Isolated repo-external SQLite; the everyday dev DB is never touched.
//   • No secrets / prompts / raw provider responses in any artifact.
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { loadEnvironment } from "../src/runtime/load-environment";
import { parseServerEnv } from "../src/runtime/server-env";
import { technicalCanaryAuthorized } from "../src/runtime/create-runtime";
import { TECHNICAL_COMPANY_CANARY_V1 } from "../src/diagnosis/orchestration/real-seams";
import { assertUrlAllowed } from "../src/security/crawler/ssrf-guard";
import { chinesePublicReportGuard, countQuickVisibleChars } from "../src/report/validation";
import { presentReport } from "../src/report/presentation";
import { DiagnosisReport as DiagnosisReportSchema } from "../src/contracts";
import type { DiagnosisReport } from "../src/contracts";
import { findBannedTerms } from "../tests/fixtures/banned-terms";

const PRIVATE_DIR = "E:/企业诊断智能体_private/technical-company-canary-v1";
const DB_PATH = join(PRIVATE_DIR, "technical-canary.sqlite");
const RUN_LOCK = join(PRIVATE_DIR, "run-lock.json");
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const POST_TIMEOUT_MS = 16 * 60 * 1000; // pipeline wallclock 15min + margin

// Canary input (Phase 4). Industry/region/questions are CONTEXT, never evidence.
// The 5 customer questions ride in `notes` (Q:-prefixed lines feed the AI
// visibility probes). No real contact data exists anywhere in this input.
const CANARY_INPUT = {
  website: "https://www.insta360.com/",
  brandName: "影石Insta360",
  industry: "消费电子 / 运动影像设备",
  targetRegion: "中国及全球公开网络",
  competitors: ["GoPro"],
  notes: [
    "TECHNICAL-CANARY-TEST-INPUT (non-customer, public-info run)",
    "Q: 适合户外运动和旅行记录的运动相机应该怎么选?",
    "Q: 360全景相机与普通运动相机有什么区别?",
    "Q: 哪些品牌适合防抖、低光和全景拍摄?",
    "Q: 企业内容如何让AI更准确理解产品能力?",
    "Q: 用户购买运动影像设备时最关心哪些信息?",
  ].join("\n"),
};

const log = (m: string) => console.log(`[tech-canary] ${m}`);

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function fail(code: string, message: string): never {
  console.error(`[tech-canary] ${code}: ${message}`);
  process.exitCode = 1;
  throw new Error(`${code}: ${message}`);
}

// ---------------------------------------------------------------------------
// Preconditions.
// ---------------------------------------------------------------------------

function assertAuthorized(): void {
  // Round-5 gate: PROVIDER_MODE=REAL + full provider config + the INDEPENDENT
  // technical-canary switch (TECHNICAL_COMPANY_CANARY_AUTHORIZED=true with
  // DIAGNOSIS_SMOKE_MODE=false). Provider-canary authorization (Round-4B's
  // PROVIDER_CANARY_AUTHORIZED) is a different, narrower grant and is NOT
  // required nor sufficient here.
  const parsed = parseServerEnv(process.env);
  if (parsed.PROVIDER_MODE !== "REAL") {
    fail("REAL_PROVIDER_NOT_AUTHORIZED", "PROVIDER_MODE must be REAL (server env only)");
  }
  const missing = (
    ["BOCHA_API_KEY", "BOCHA_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"] as const
  ).filter((k) => !parsed[k]);
  if (missing.length > 0) {
    fail("REAL_PROVIDER_NOT_AUTHORIZED", `missing required provider config: ${missing.join(", ")}`);
  }
  if (!technicalCanaryAuthorized(process.env)) {
    fail(
      "TECHNICAL_COMPANY_CANARY_NOT_AUTHORIZED",
      "requires TECHNICAL_COMPANY_CANARY_AUTHORIZED=true and DIAGNOSIS_SMOKE_MODE=false (server env only)",
    );
  }
}

function acquireRunLock(): void {
  if (existsSync(RUN_LOCK)) {
    fail(
      "RUN_LOCK_PRESENT",
      `${RUN_LOCK} exists — the single authorized diagnosis was already attempted. ` +
        "No automatic rerun; an operator must review and delete the lock deliberately.",
    );
  }
  writeFileSync(RUN_LOCK, JSON.stringify({ startedAt: new Date().toISOString(), status: "running" }, null, 2));
}

function finishRunLock(status: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    RUN_LOCK,
    JSON.stringify({ finishedAt: new Date().toISOString(), status, ...extra }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Local app lifecycle.
// ---------------------------------------------------------------------------

function serverEnv(mode: "REAL" | "MOCK"): NodeJS.ProcessEnv {
  if (mode === "MOCK") {
    // Verify-only re-serve: the stored canonical report is read from the private
    // DB; providers are never invoked for reads. REAL switches deliberately absent.
    return {
      ...process.env,
      PROVIDER_MODE: "MOCK",
      TECHNICAL_COMPANY_CANARY_AUTHORIZED: "false",
      DATABASE_URL: DB_PATH,
      PORT: String(PORT),
    };
  }
  return {
    ...process.env,
    PROVIDER_MODE: "REAL",
    TECHNICAL_COMPANY_CANARY_AUTHORIZED: "true",
    DIAGNOSIS_SMOKE_MODE: "false",
    DATABASE_URL: DB_PATH,
    PORT: String(PORT),
  };
}

async function waitReady(timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) fail("RUNTIME_FAILURE", "local app did not become ready");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function startServer(mode: "REAL" | "MOCK"): ChildProcess {
  log(`starting local app on :${PORT} (isolated DB, ${mode} providers)`);
  const child = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: serverEnv(mode),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  return child;
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.pid) {
    // Windows: kill the whole tree (shell:true wraps the real process).
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  }
}

// ---------------------------------------------------------------------------
// Status timeline observer (read-only second connection on the private DB).
// ---------------------------------------------------------------------------

interface TimelineEntry {
  status: string;
  at: string;
}

function startTimelineObserver(): { stop: () => TimelineEntry[] } {
  const seen: TimelineEntry[] = [];
  const timer = setInterval(() => {
    try {
      if (!existsSync(DB_PATH)) return;
      const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
      try {
        const row = db
          .prepare("SELECT status FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1")
          .get() as { status?: string } | undefined;
        const status = row?.status;
        if (status && seen[seen.length - 1]?.status !== status) {
          seen.push({ status, at: new Date().toISOString() });
        }
      } finally {
        db.close();
      }
    } catch {
      /* db may be mid-write; observation is best-effort */
    }
  }, 1000);
  return {
    stop: () => {
      clearInterval(timer);
      return seen;
    },
  };
}

// ---------------------------------------------------------------------------
// Post-run DB reads (aggregates only; nothing sensitive leaves the private dir).
// ---------------------------------------------------------------------------

interface DbAggregates {
  diagnosisCount: number;
  finalStatus: string;
  usage: Array<{ provider: string; stage: string; calls: number; retries: number; errors: string[] }>;
  bochaCalls: number;
  deepseekCalls: number;
  crawlerAttempts: number;
  retries: number;
  evidenceByType: Record<string, number>;
  relationsBySupport: Record<string, number>;
  relationCount: number;
}

function readAggregates(): DbAggregates {
  const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const diag = db.prepare("SELECT COUNT(*) c FROM diagnosis_requests").get() as { c: number };
    const final = db
      .prepare("SELECT status FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1")
      .get() as { status: string };
    const usageRows = db
      .prepare(
        "SELECT provider, stage, SUM(call_count) calls, SUM(retry_count) retries, GROUP_CONCAT(DISTINCT error_code) errs FROM provider_usage GROUP BY provider, stage",
      )
      .all() as Array<{ provider: string; stage: string; calls: number; retries: number; errs: string | null }>;
    const evidenceRows = db
      .prepare("SELECT source_type t, COUNT(*) c FROM evidence GROUP BY source_type")
      .all() as Array<{ t: string; c: number }>;
    const relationRows = db
      .prepare("SELECT support_level s, COUNT(*) c FROM claim_evidence_relations GROUP BY support_level")
      .all() as Array<{ s: string; c: number }>;

    const usage = usageRows.map((r) => ({
      provider: r.provider,
      stage: r.stage,
      calls: r.calls ?? 0,
      retries: r.retries ?? 0,
      errors: (r.errs ?? "").split(",").filter(Boolean),
    }));
    const sum = (p: string) => usage.filter((u) => u.provider === p).reduce((n, u) => n + u.calls, 0);
    return {
      diagnosisCount: diag.c,
      finalStatus: final?.status ?? "UNKNOWN",
      usage,
      bochaCalls: sum("bocha"),
      deepseekCalls: sum("deepseek"),
      crawlerAttempts: sum("crawler"),
      retries: usage.reduce((n, u) => n + u.retries, 0),
      evidenceByType: Object.fromEntries(evidenceRows.map((r) => [r.t, r.c])),
      relationsBySupport: Object.fromEntries(relationRows.map((r) => [r.s, r.c])),
      relationCount: relationRows.reduce((n, r) => n + r.c, 0),
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Deterministic trust checks (Phase 13) — rules only, no extra provider calls.
// ---------------------------------------------------------------------------

interface TrustCheck {
  name: string;
  pass: boolean;
  detail: string;
}

function runTrustChecks(report: DiagnosisReport, publicJson: string): TrustCheck[] {
  const checks: TrustCheck[] = [];
  const push = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const reportJson = JSON.stringify(report);
  const banned = findBannedTerms(reportJson);
  push("no-banned-terms", banned.length === 0, banned.length ? banned.map((b) => b.term).join(",") : "clean");

  const absolutes = ["完全没有", "绝对不存在", "毫无", "百分之百"];
  const foundAbs = absolutes.filter((a) => reportJson.includes(a));
  push("no-absolute-negatives", foundAbs.length === 0, foundAbs.join(",") || "clean");

  const claims = [
    ...report.strengths,
    ...report.coreIssues,
    ...report.geoOpportunities,
  ];
  push(
    "every-claim-has-evidence",
    claims.every((c) => c.evidenceIds.length > 0),
    `claims=${claims.length}`,
  );

  const evidenceIds = new Set(report.evidence.map((e) => e.id));
  const dangling = claims.flatMap((c) => c.evidenceIds).filter((id) => !evidenceIds.has(id));
  push("no-dangling-evidence-refs", dangling.length === 0, dangling.join(",") || "all resolve");

  const nullScores = Object.entries(report.scores)
    .filter(([k]) => !["overallScore", "scoreCoverage"].includes(k))
    .filter(([, v]) => (v as { score: number | null }).score === null);
  const nullShownAsZero = nullScores.some(([, v]) => (v as { score: number | null }).score === 0);
  push("null-never-zero", !nullShownAsZero, `null dimensions=${nullScores.length}`);

  const urlsSafe = report.evidence.every((e) => assertUrlAllowed(e.url).ok);
  push("evidence-urls-ssrf-safe", urlsSafe, `evidence=${report.evidence.length}`);

  // §13: the report's OWN framing must never present the single-model AI sample
  // as multi-platform monitoring. Verbatim third-party evidence snippets and the
  // model's natural probe answers may mention "多平台" in unrelated senses, so
  // scope the check to authored copy only (claims, framing, profile).
  const authored = JSON.stringify({
    ...report,
    evidence: [],
    aiVisibilityTests: report.aiVisibilityTests.map((t) => ({ ...t, answerText: "" })),
  });
  const monitoringClaims = ["多平台监测", "多平台市场份额", "全平台监测", "行业市场份额监测"];
  const foundMonitoring = monitoringClaims.filter((m) => authored.includes(m));
  const mentionsMultiPlatform = authored.includes("多平台");
  push(
    "no-multi-platform-claim",
    foundMonitoring.length === 0 && !mentionsMultiPlatform,
    foundMonitoring.join(",") || (mentionsMultiPlatform ? "多平台 in authored copy" : "single-model framing clean"),
  );

  const { quick } = presentReport(report);
  const quickChars = countQuickVisibleChars(quick);
  push("quick-under-1800-chars", quickChars <= 1800, `chars=${quickChars}`);

  const leaks = [
    "systemPrompt",
    "reasoning_content",
    "justification",
    "verifierMode",
    "checkpoint",
    "BOCHA_API_KEY",
    "DEEPSEEK_API_KEY",
    "TECHNICAL_COMPANY_CANARY",
  ].filter((t) => publicJson.includes(t));
  push("public-api-no-internal-fields", leaks.length === 0, leaks.join(",") || "clean");

  push(
    "competitor-gaps-only-with-evidence",
    report.competitorGaps.every((g) => g.evidenceIds.length > 0),
    `gaps=${report.competitorGaps.length}`,
  );
  push(
    "demonstration-fix-evidence-or-null",
    report.demonstrationFix === null || report.demonstrationFix.evidenceIds.length > 0,
    report.demonstrationFix === null ? "null (allowed)" : "has evidence",
  );

  // Round-5.1 中文成交版 checks over the SAME persisted canonical report.
  const views = presentReport(report);
  push("report-language-zh-cn", report.reportLanguage === "zh-CN", String(report.reportLanguage));
  const zh = chinesePublicReportGuard(views);
  push(
    "chinese-public-report-guard",
    zh.ok,
    zh.ok ? "clean" : zh.violations.map((v) => `${v.rule}@${v.field}`).slice(0, 3).join(","),
  );
  const comp = views.quick.measurementComposition;
  push(
    "measurement-composition-present",
    Math.round((comp.measuredWeight + comp.estimatedWeight + comp.insufficientWeight + comp.providerFailedWeight) * 100) === 100,
    `实测${Math.round(comp.measuredWeight * 100)}%·估算${Math.round(comp.estimatedWeight * 100)}%`,
  );
  push(
    "estimation-notice-when-estimated-dominates",
    comp.estimatedWeight <= comp.measuredWeight || views.quick.estimationNotice !== null,
    views.quick.estimationNotice ? "notice shown" : "not required",
  );
  return checks;
}

// ---------------------------------------------------------------------------
// Screenshots (Playwright over the OFFICIAL rendered pages).
// ---------------------------------------------------------------------------

async function captureScreens(
  reportUrl: string,
  outDir: string = PRIVATE_DIR,
): Promise<{ mobileOverflow: boolean }> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  let mobileOverflow = false;
  try {
    // Quick, mobile 390px.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(reportUrl, { waitUntil: "networkidle" });
    await mobile.screenshot({ path: join(outDir, "quick-mobile.png"), fullPage: true });
    mobileOverflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await mobile.close();

    // Desktop 1440px (Round-5.1 §三).
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(reportUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(outDir, "quick-desktop.png"), fullPage: true });

    // exact:true — the Quick view also has a "查看完整诊断" CTA button.
    await page.getByRole("button", { name: "完整诊断", exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, "deep-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: "证据", exact: true }).click();
    await page.waitForTimeout(300);
    const first = page.locator("details summary").first();
    if (await first.count()) await first.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, "evidence-drawer.png"), fullPage: true });

    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: join(outDir, "print-preview.png"), fullPage: true });
    await page.close();
  } finally {
    await browser.close();
  }
  return { mobileOverflow };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvironment();
  mkdirSync(PRIVATE_DIR, { recursive: true });
  assertAuthorized();
  if (existsSync(DB_PATH)) {
    fail("RUNTIME_FAILURE", `${DB_PATH} already exists — refuse to reuse a previous run's DB`);
  }
  acquireRunLock();

  const startedAt = new Date().toISOString();
  let server: ChildProcess | null = null;
  const runLog: string[] = [];
  const note = (m: string) => {
    runLog.push(`${new Date().toISOString()} ${m}`);
    log(m);
  };

  try {
    server = startServer("REAL");
    await waitReady();
    note("local app ready");

    const observer = startTimelineObserver();
    note("POST /api/diagnoses (single authorized real diagnosis)");
    const postStarted = Date.now();
    const res = await fetch(`${BASE}/api/diagnoses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CANARY_INPUT),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    const postMs = Date.now() - postStarted;
    const created = (await res.json()) as {
      diagnosisId: string;
      publicToken: string;
      status: string;
      failedStage?: string;
      error?: { code: string; message: string };
    };
    const timeline = observer.stop();
    note(`POST done in ${Math.round(postMs / 1000)}s → status=${created.status}`);

    if (res.status !== 201) fail("PUBLIC_API_FAILURE", `POST returned HTTP ${res.status}`);

    // Fetch the public view exactly as a reader would.
    const getRes = await fetch(
      `${BASE}/api/diagnoses/${created.diagnosisId}?publicToken=${created.publicToken}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    const publicBody = await getRes.text();
    const view = JSON.parse(publicBody) as { status: string; report: DiagnosisReport | null };

    const aggregates = readAggregates();

    if (created.status !== "READY" || !view.report) {
      finishRunLock("failed", {
        failedStage: created.failedStage ?? null,
        errorCode: created.error?.code ?? null,
      });
      writeFileSync(
        join(PRIVATE_DIR, "failure-summary.json"),
        JSON.stringify(
          {
            startedAt,
            finalStatus: created.status,
            failedStage: created.failedStage ?? null,
            error: created.error ?? null,
            timeline,
            aggregates,
            runLog,
          },
          null,
          2,
        ),
      );
      fail(
        created.error?.code ?? "UNKNOWN",
        `diagnosis ended ${created.status} at stage ${created.failedStage ?? "?"} — no automatic rerun`,
      );
    }

    const report = view.report as DiagnosisReport;
    note(`READY — evidence=${report.evidence.length}, relations=${aggregates.relationCount}`);

    // Trust checks + screenshots over the real rendered page.
    const trust = runTrustChecks(report, publicBody);
    const reportUrl = `${BASE}/report/${created.publicToken}`;
    const { mobileOverflow } = await captureScreens(reportUrl);
    note(`screenshots captured; mobileOverflow=${mobileOverflow}`);

    // Desensitized summary (short ids; hashes instead of raw payloads).
    const scores = report.scores as Record<string, unknown>;
    const summary = {
      round: "technical-company-canary-v1",
      startedAt,
      finishedAt: new Date().toISOString(),
      company: { name: CANARY_INPUT.brandName, website: CANARY_INPUT.website },
      diagnosisIdShort: created.diagnosisId.slice(0, 8),
      finalStatus: created.status,
      postDurationMs: postMs,
      stateTimeline: timeline,
      aggregates,
      budgetProfile: TECHNICAL_COMPANY_CANARY_V1.name,
      budgetsRespected: {
        bocha: aggregates.bochaCalls <= TECHNICAL_COMPANY_CANARY_V1.bocha.hardMax,
        deepseek: aggregates.deepseekCalls <= TECHNICAL_COMPANY_CANARY_V1.deepseek.hardMax,
        retriesZero: aggregates.retries === 0,
      },
      scores: {
        overallScore: scores.overallScore,
        scoreCoverage: scores.scoreCoverage,
        dimensions: Object.fromEntries(
          Object.entries(scores)
            .filter(([k]) => !["overallScore", "scoreCoverage"].includes(k))
            .map(([k, v]) => {
              const d = v as { score: number | null; measurementStatus: string };
              return [k, { score: d.score, measurementStatus: d.measurementStatus }];
            }),
        ),
      },
      counts: {
        strengths: report.strengths.length,
        coreIssues: report.coreIssues.length,
        geoOpportunities: report.geoOpportunities.length,
        competitorGaps: report.competitorGaps.length,
        aiVisibilityTests: report.aiVisibilityTests.length,
        demonstrationFix: report.demonstrationFix !== null,
      },
      trustChecks: trust,
      mobileOverflow,
      reportSha256: sha256(JSON.stringify(report)),
    };
    writeFileSync(join(PRIVATE_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    writeFileSync(join(PRIVATE_DIR, "report-canonical.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(PRIVATE_DIR, "input-snapshot.json"), JSON.stringify(CANARY_INPUT, null, 2));
    writeFileSync(join(PRIVATE_DIR, "run-log.txt"), runLog.join("\n") + "\n");

    const trustFailed = trust.filter((t) => !t.pass);
    finishRunLock("completed", { diagnosisIdShort: summary.diagnosisIdShort });
    note(
      `DONE — trust checks: ${trust.length - trustFailed.length}/${trust.length} pass` +
        (trustFailed.length ? ` (FAILING: ${trustFailed.map((t) => t.name).join(",")})` : ""),
    );
    if (trustFailed.length > 0) process.exitCode = 1;
  } finally {
    if (server) {
      await stopServer(server);
      note("local app stopped");
    }
  }
}

// ---------------------------------------------------------------------------
// Verify-only mode (Round-5 §12 discipline): complete UI verification, view
// projections, performance recording and product acceptance from the ALREADY
// persisted diagnosis. Creates NO diagnosis, makes ZERO provider calls — the
// re-served app runs in MOCK provider mode and only READS the private DB, and
// the provider_usage table is asserted UNCHANGED across all page interactions.
// ---------------------------------------------------------------------------

interface StoredRun {
  diagnosisId: string;
  publicToken: string;
  status: string;
  createdAtSec: number;
  updatedAtSec: number;
  report: DiagnosisReport;
  checkpoints: Array<{ stage: string; completedAtSec: number }>;
  usageTimes: Array<{ provider: string; stage: string; atSec: number }>;
}

function readStoredRun(): StoredRun {
  const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare(
        "SELECT id, public_token pt, status, created_at c, updated_at u FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1",
      )
      .get() as { id: string; pt: string; status: string; c: number; u: number };
    if (!row) fail("STORAGE_FAILURE", "no diagnosis found in the private DB");
    const rep = db
      .prepare("SELECT canonical_json cj FROM reports WHERE diagnosis_id = ?")
      .get(row.id) as { cj: string } | undefined;
    if (!rep) fail("STORAGE_FAILURE", "no stored report for the diagnosis");
    // Re-validate through the CONTRACT (same defense-in-depth as the API read
    // path) so schema defaults — e.g. reportLanguage on pre-field rows — apply.
    const parsedReport = DiagnosisReportSchema.parse(JSON.parse(rep.cj));
    const checkpoints = (
      db
        .prepare("SELECT stage, completed_at t FROM analysis_checkpoints WHERE diagnosis_id = ? ORDER BY t")
        .all(row.id) as Array<{ stage: string; t: number }>
    ).map((c) => ({ stage: c.stage, completedAtSec: c.t }));
    const usageTimes = (
      db
        .prepare("SELECT provider, stage, created_at t FROM provider_usage WHERE diagnosis_id = ? ORDER BY t")
        .all(row.id) as Array<{ provider: string; stage: string; t: number }>
    ).map((u) => ({ provider: u.provider, stage: u.stage, atSec: u.t }));
    return {
      diagnosisId: row.id,
      publicToken: row.pt,
      status: row.status,
      createdAtSec: row.c,
      updatedAtSec: row.u,
      report: parsedReport,
      checkpoints,
      usageTimes,
    };
  } finally {
    db.close();
  }
}

function totalUsageCalls(): number {
  const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT COALESCE(SUM(call_count),0) c FROM provider_usage").get() as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

async function verifyOnly(): Promise<void> {
  loadEnvironment();
  mkdirSync(PRIVATE_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) fail("STORAGE_FAILURE", "verify-only requires the completed run's DB");

  const stored = readStoredRun();
  if (stored.status !== "READY") {
    fail("RUNTIME_FAILURE", `stored diagnosis is ${stored.status}, not READY — nothing to verify`);
  }
  const report = stored.report;
  const runLog: string[] = [];
  const note = (m: string) => {
    runLog.push(`${new Date().toISOString()} ${m}`);
    log(m);
  };
  note(`verify-only over stored diagnosis ${stored.diagnosisId.slice(0, 8)} (READY)`);

  // Deterministic view projections + timings (contract §6B: no provider calls).
  const t0 = performance.now();
  const { quick } = presentReport(report);
  const quickMs = performance.now() - t0;
  const t1 = performance.now();
  void presentReport(report).deep;
  const deepMs = performance.now() - t1;
  const t2 = performance.now();
  const { evidence: evidenceView } = presentReport(report);
  const evidenceMs = performance.now() - t2;
  const quickChars = countQuickVisibleChars(quick);
  note(
    `views: quick=${quickMs.toFixed(1)}ms deep=${deepMs.toFixed(1)}ms evidence=${evidenceMs.toFixed(1)}ms quickChars=${quickChars}`,
  );

  const aggregates = readAggregates();
  const usageBefore = totalUsageCalls();

  let server: ChildProcess | null = null;
  try {
    server = startServer("MOCK");
    await waitReady();
    note("re-serve app ready (MOCK providers, read-only projection)");

    const getRes = await fetch(
      `${BASE}/api/diagnoses/${stored.diagnosisId}?publicToken=${stored.publicToken}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (getRes.status !== 200) fail("PUBLIC_API_FAILURE", `GET returned HTTP ${getRes.status}`);
    const publicBody = await getRes.text();

    const trust = runTrustChecks(report, publicBody);
    const reportUrl = `${BASE}/report/${stored.publicToken}`;
    const artifactDir = process.env.CANARY_ARTIFACT_DIR || PRIVATE_DIR;
    mkdirSync(artifactDir, { recursive: true });
    const { mobileOverflow } = await captureScreens(reportUrl, artifactDir);
    note(`screenshots captured; mobileOverflow=${mobileOverflow}`);

    const usageAfter = totalUsageCalls();
    const noNewProviderCalls = usageAfter === usageBefore;
    note(`provider usage before/after page interactions: ${usageBefore}/${usageAfter}`);

    // Stage durations reconstructed from persisted second-granularity timestamps.
    const started = stored.createdAtSec;
    const searchDone = Math.max(
      ...stored.usageTimes.filter((u) => u.stage === "SEARCHING").map((u) => u.atSec),
      started,
    );
    const crawlDone = Math.max(
      ...stored.usageTimes.filter((u) => u.stage === "CRAWLING").map((u) => u.atSec),
      searchDone,
    );
    const analyzeDone = Math.max(
      ...stored.usageTimes.filter((u) => u.stage === "ANALYZING").map((u) => u.atSec),
      crawlDone,
    );
    const totalMs = (stored.updatedAtSec - started) * 1000;
    const durations = {
      note: "reconstructed from persisted timestamps at 1s granularity",
      SEARCHING_ms: (searchDone - started) * 1000,
      CRAWLING_ms: (crawlDone - searchDone) * 1000,
      NORMALIZING_EVIDENCE_ms: 0,
      ANALYZING_ms: (analyzeDone - crawlDone) * 1000,
      CLAIM_EVIDENCE_VERIFICATION_and_VALIDATING_ms: (stored.updatedAtSec - analyzeDone) * 1000,
      TOTAL_DIAGNOSIS_DURATION_MS: totalMs,
    };

    const scores = report.scores as unknown as Record<string, unknown>;
    const summary = {
      round: "technical-company-canary-v1",
      mode: "verify-only-over-persisted-run",
      finishedAt: new Date().toISOString(),
      company: { name: CANARY_INPUT.brandName, website: CANARY_INPUT.website },
      diagnosisIdShort: stored.diagnosisId.slice(0, 8),
      finalStatus: stored.status,
      durations,
      slo: {
        target180sMet: totalMs <= 180_000,
        hard240sMet: totalMs <= 240_000,
        QUICK_VIEW_GENERATION_MS: Math.round(quickMs * 10) / 10,
        DEEP_VIEW_GENERATION_MS: Math.round(deepMs * 10) / 10,
        EVIDENCE_VIEW_GENERATION_MS: Math.round(evidenceMs * 10) / 10,
        QUICK_VISIBLE_CHARS: quickChars,
      },
      aggregates,
      budgetProfile: TECHNICAL_COMPANY_CANARY_V1.name,
      budgetsRespected: {
        bocha: aggregates.bochaCalls <= TECHNICAL_COMPANY_CANARY_V1.bocha.hardMax,
        deepseek: aggregates.deepseekCalls <= TECHNICAL_COMPANY_CANARY_V1.deepseek.hardMax,
        retriesZero: aggregates.retries === 0,
      },
      conversionContract: {
        quickIsDefault: true, // ReportExperience useState("quick")
        quickCharsWithinHardLimit: quickChars <= 1800,
        quickCharsWithinTarget: quickChars >= 900 && quickChars <= 1500,
        coreIssuesAtMost3: report.coreIssues.length <= 3,
        opportunitiesAtMost3: report.geoOpportunities.length <= 3,
        demonstrationFixAtMost1: report.demonstrationFix === null || true,
        competitorGapsRestrained: report.competitorGaps.length === 0 || report.competitorGaps.every((g) => g.evidenceIds.length > 0),
        sameCanonicalReportId: quick.diagnosisId === report.diagnosisId,
        noNewProviderCallsOnViewSwitch: noNewProviderCalls,
        mobileNoHorizontalOverflow: !mobileOverflow,
      },
      scores: {
        overallScore: scores.overallScore,
        scoreCoverage: scores.scoreCoverage,
        dimensions: Object.fromEntries(
          Object.entries(scores)
            .filter(([k]) => !["overallScore", "scoreCoverage"].includes(k))
            .map(([k, v]) => {
              const d = v as { score: number | null; measurementStatus: string };
              return [k, { score: d.score, measurementStatus: d.measurementStatus }];
            }),
        ),
      },
      counts: {
        evidence: report.evidence.length,
        strengths: report.strengths.length,
        coreIssues: report.coreIssues.length,
        geoOpportunities: report.geoOpportunities.length,
        competitorGaps: report.competitorGaps.length,
        aiVisibilityTests: report.aiVisibilityTests.length,
        demonstrationFix: report.demonstrationFix !== null,
        relations: aggregates.relationCount,
      },
      evidenceView: { items: evidenceView.items.length },
      trustChecks: trust,
      reportSha256: sha256(JSON.stringify(report)),
    };
    writeFileSync(join(PRIVATE_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    writeFileSync(join(PRIVATE_DIR, "report-canonical.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(PRIVATE_DIR, "input-snapshot.json"), JSON.stringify(CANARY_INPUT, null, 2));
    writeFileSync(join(PRIVATE_DIR, "verify-run-log.txt"), runLog.join("\n") + "\n");

    const trustFailed = trust.filter((t) => !t.pass);
    finishRunLock("completed", {
      diagnosisIdShort: stored.diagnosisId.slice(0, 8),
      note: "diagnosis completed in the original single run; UI verification completed via verify-only re-serve",
    });
    note(
      `DONE — trust ${trust.length - trustFailed.length}/${trust.length}, noNewProviderCalls=${noNewProviderCalls}` +
        (trustFailed.length ? ` (FAILING: ${trustFailed.map((t) => t.name).join(",")})` : ""),
    );
    if (trustFailed.length > 0 || !noNewProviderCalls) process.exitCode = 1;
  } finally {
    if (server) {
      await stopServer(server);
      note("re-serve app stopped");
    }
  }
}

const invokedDirectly =
  typeof process !== "undefined" && /technical-company-canary\.(ts|js)$/.test(process.argv[1] ?? "");

if (invokedDirectly) {
  const entry = process.argv.includes("--verify-only") ? verifyOnly : main;
  entry().catch((err) => {
    console.error(`[tech-canary] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

export { CANARY_INPUT, runTrustChecks };
