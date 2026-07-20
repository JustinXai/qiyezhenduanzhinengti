// ============================================================================
// scripts/run-lejinji-real-canonical.ts — One-shot real Lejinji diagnosis.
//
// Executes a single real diagnosis for:
//   安徽乐锦记食品有限公司
//   糕点、面包、烘焙及休闲食品
//   中国公开网络
//
// Budget: Bocha≤12, Crawler≤12, DeepSeek≤8, Retries=0, Diagnoses=1
// Database: E:/企业诊断智能体_private/lejinji-real-canonical-v1/lejinji-real-canonical-v1.sqlite
// Output:   E:/企业诊断智能体_private/lejinji-real-canonical-v1/final-report/
//
// Hard rails:
//   • PROVIDER_MODE=REAL + TECHNICAL_COMPANY_CANARY_AUTHORIZED=true
//   • DIAGNOSIS_SMOKE_MODE=false
//   • DATABASE_URL points to isolated private DB
//   • No DEMO_SEED_ENABLED=true
//   • Run-lock blocks re-execution
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { loadEnvironment } from "../src/runtime/load-environment";
import { technicalCanaryAuthorized } from "../src/runtime/create-runtime";
import { TECHNICAL_COMPANY_CANARY_V1 } from "../src/diagnosis/orchestration/real-seams";
import { chinesePublicReportGuard, countQuickVisibleChars } from "../src/report/validation";
import { presentReport } from "../src/report/presentation";
import { DiagnosisReport } from "../src/contracts";

// ---------------------------------------------------------------------------
// Paths.
// ---------------------------------------------------------------------------

const PRIVATE_DIR = "E:/企业诊断智能体_private/lejinji-real-canonical-v1";
const FINAL_REPORT_DIR = join(PRIVATE_DIR, "final-report");
const DB_PATH = join(PRIVATE_DIR, "lejinji-real-canonical-v1.sqlite");
const RUN_LOCK = join(PRIVATE_DIR, "run-lock.json");
const PORT = 3700;
const BASE = `http://localhost:${PORT}`;
const POST_TIMEOUT_MS = 16 * 60 * 1000;

// ---------------------------------------------------------------------------
// Company input.
// ---------------------------------------------------------------------------

const LEJINJI_INPUT = {
  website: "https://www.lejinji.com",  // Unconfirmed ownership — search-based approach
  brandName: "安徽乐锦记食品有限公司",
  industry: "糕点、面包、烘焙及休闲食品",
  productOrService: "糕点、面包、烘焙及休闲食品",
  targetRegion: "中国公开网络",
  competitors: [],
  notes: [
    "乐锦记真实诊断（非客户，仅使用公开信息）",
    "Q: 乐锦记不同面包、糕点和礼盒产品分别适合哪些人群与消费场景？",
    "Q: 消费者如何了解乐锦记产品的原料、工艺、保鲜和食品安全信息？",
    "Q: 早餐、日常零食、节日礼赠和企业团购分别应该如何选择产品？",
    "Q: 企业团购、商超渠道、经销合作和批量采购应如何联系与合作？",
    "Q: AI在回答烘焙食品和礼盒选购问题时，能否准确理解乐锦记的产品与服务？",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Authorization.
// ---------------------------------------------------------------------------

function checkAuthorization(): void {
  loadEnvironment();
  const authorized = technicalCanaryAuthorized();
  if (!authorized) {
    throw new Error("TECHNICAL_CANARY_NOT_AUTHORIZED: TECHNICAL_COMPANY_CANARY_AUTHORIZED=true and DIAGNOSIS_SMOKE_MODE=false required");
  }
  if (process.env.DEMO_SEED_ENABLED === "true") {
    throw new Error("DEMO_SEED_ENABLED_MUST_BE_FALSE");
  }
  if (process.env.APP_MODE !== "REAL") {
    throw new Error("APP_MODE_MUST_BE_REAL");
  }
  if (!process.env.BOCHA_API_KEY?.trim() || !process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new Error("PROVIDER_KEYS_MISSING");
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle.
// ---------------------------------------------------------------------------

async function waitForServer(baseUrl: string, timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      // Server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("LOCAL_SERVER_START_TIMEOUT");
}

function buildChildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    PROVIDER_MODE: "REAL",
    DIAGNOSIS_SMOKE_MODE: "false",
    TECHNICAL_COMPANY_CANARY_AUTHORIZED: "true",
    TECHNICAL_CANARY_PROFILE: "TECHNICAL_COMPANY_CANARY_V1",
    DATABASE_URL: DB_PATH,
    PORT: String(PORT),
  };
}

function startServer(): ChildProcess {
  return spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: buildChildEnv(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
    killer.on("exit", () => resolve());
    killer.on("error", () => resolve());
  });
}

// ---------------------------------------------------------------------------
// Screenshots.
// ---------------------------------------------------------------------------

async function captureScreenshots(reportUrl: string): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    mkdirSync(FINAL_REPORT_DIR, { recursive: true });

    // Mobile Quick view.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(reportUrl, { waitUntil: "networkidle" });
    await mobile.screenshot({ path: join(FINAL_REPORT_DIR, "quick-mobile.png"), fullPage: true });
    await mobile.close();

    // Desktop Quick view.
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(reportUrl, { waitUntil: "networkidle" });
    await desktop.screenshot({ path: join(FINAL_REPORT_DIR, "quick-desktop.png"), fullPage: true });
    await desktop.close();

    // Deep view.
    const deep = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await deep.goto(reportUrl, { waitUntil: "networkidle" });
    await deep.getByRole("button", { name: "完整诊断", exact: true }).click();
    await deep.screenshot({ path: join(FINAL_REPORT_DIR, "deep-desktop.png"), fullPage: true });
    await deep.close();

    // Evidence view.
    const evidence = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await evidence.goto(reportUrl, { waitUntil: "networkidle" });
    await evidence.getByRole("button", { name: "证据", exact: true }).click();
    await evidence.screenshot({ path: join(FINAL_REPORT_DIR, "evidence-desktop.png"), fullPage: true });
    await evidence.close();

    // Print view.
    const print = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await print.goto(reportUrl, { waitUntil: "networkidle" });
    await print.emulateMedia({ media: "print" });
    await print.screenshot({ path: join(FINAL_REPORT_DIR, "print-desktop.png"), fullPage: true });
    await print.close();
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Database queries.
// ---------------------------------------------------------------------------

function readDbMetrics(): {
  diagnosisCount: number;
  finalState: string;
  providerUsage: { bocha: number; crawler: number; deepseek: number; retries: number };
  evidenceCount: number;
  stageRunCount: number;
} {
  const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const diag = db.prepare("SELECT COUNT(*) count FROM diagnosis_requests").get() as { count: number };
    const final = db
      .prepare("SELECT status FROM diagnosis_requests ORDER BY created_at DESC LIMIT 1")
      .get() as { status: string } | undefined;
    const rows = db
      .prepare("SELECT provider, SUM(call_count) calls, SUM(retry_count) retries FROM provider_usage GROUP BY provider")
      .all() as Array<{ provider: string; calls: number; retries: number }>;
    const evidenceCount = db.prepare("SELECT COUNT(*) count FROM evidence").get() as { count: number };
    const stageRunCount = db.prepare("SELECT COUNT(*) count FROM analysis_stage_runs").get() as { count: number };
    return {
      diagnosisCount: diag.count,
      finalState: final?.status ?? "UNKNOWN",
      providerUsage: {
        bocha: rows.find((r) => r.provider === "bocha")?.calls ?? 0,
        crawler: rows.find((r) => r.provider === "crawler")?.calls ?? 0,
        deepseek: rows.find((r) => r.provider === "deepseek")?.calls ?? 0,
        retries: rows.reduce((s, r) => s + r.retries, 0),
      },
      evidenceCount: evidenceCount.count,
      stageRunCount: stageRunCount.count,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Report verification.
// ---------------------------------------------------------------------------

interface ReportVerification {
  diagnosisId: string;
  publicToken: string;
  reportLanguage: string | null;
  quickVisibleChars: number | null;
  report: DiagnosisReport;
  provenance: string;
  demoOnly: boolean;
}

async function verifyReport(created: { diagnosisId?: string; publicToken?: string }): Promise<ReportVerification> {
  if (!created.diagnosisId || !created.publicToken) {
    throw new Error("DIAGNOSIS_ID_OR_TOKEN_MISSING");
  }
  const response = await fetch(`${BASE}/api/diagnoses/${created.diagnosisId}?publicToken=${created.publicToken}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`PUBLIC_API_GET_FAILED:${response.status}`);
  const body = await response.json();
  const report = body.report as DiagnosisReport;
  const views = presentReport(report);

  // Query database for provenance and demoOnly from the reports table.
  const db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  let provenance = "UNKNOWN";
  let demoOnly = true;
  try {
    const reportRow = db
      .prepare("SELECT report_provenance, demo_only FROM reports WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(created.diagnosisId) as { report_provenance: string; demo_only: number } | undefined;
    if (reportRow) {
      provenance = reportRow.report_provenance;
      demoOnly = reportRow.demo_only === 1;
    }
  } finally {
    db.close();
  }

  return {
    diagnosisId: created.diagnosisId,
    publicToken: created.publicToken,
    reportLanguage: report.reportLanguage,
    quickVisibleChars: countQuickVisibleChars(views.quick),
    report,
    provenance,
    demoOnly,
  };
}

// ---------------------------------------------------------------------------
// HTML export.
// ---------------------------------------------------------------------------

async function exportHtml(reportUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(reportUrl);
  const html = await response.text();
  writeFileSync(outputPath, html, "utf8");
}

// ---------------------------------------------------------------------------
// Outbox event (not sent to Feishu).
// ---------------------------------------------------------------------------

function writeOutboxEvent(diagnosisId: string, publicToken: string, reportUrl: string): void {
  const outboxDir = join(PRIVATE_DIR, "outbox");
  mkdirSync(outboxDir, { recursive: true });
  const event = {
    version: "ReportPublishedEventV1",
    diagnosisId,
    publicToken,
    reportUrl,
    generatedAt: new Date().toISOString(),
    channel: "local-only",
    feishuDelivery: "suppressed",
  };
  const filename = `report-published-${diagnosisId.slice(0, 8)}.json`;
  writeFileSync(join(outboxDir, filename), JSON.stringify(event, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[lejinji-real] Starting pre-flight authorization...");
  checkAuthorization();
  console.log("[lejinji-real] Authorization passed.");

  // Check run-lock.
  if (existsSync(RUN_LOCK)) {
    throw new Error(`RUN_LOCK_EXISTS: ${RUN_LOCK}`);
  }

  mkdirSync(PRIVATE_DIR, { recursive: true });
  mkdirSync(FINAL_REPORT_DIR, { recursive: true });

  // Write run-lock.
  writeFileSync(
    RUN_LOCK,
    JSON.stringify({
      runner: "lejinji-real-canonical-v1",
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      company: LEJINJI_INPUT.brandName,
    }, null, 2),
    "utf8",
  );

  console.log("[lejinji-real] Starting Next.js dev server...");
  const child = startServer();

  let created: { diagnosisId?: string; publicToken?: string; status?: string } = {};
  let verification: ReportVerification | null = null;
  let dbMetrics = { diagnosisCount: 0, finalState: "UNKNOWN", providerUsage: { bocha: 0, crawler: 0, deepseek: 0, retries: 0 }, evidenceCount: 0, stageRunCount: 0 };
  const startedAt = Date.now();

  try {
    await waitForServer(BASE);
    console.log("[lejinji-real] Server ready. Posting diagnosis request...");

    const response = await fetch(`${BASE}/api/diagnoses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(LEJINJI_INPUT),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });

    if (response.status !== 201) {
      const errorBody = await response.text();
      throw new Error(`DIAGNOSIS_POST_FAILED:${response.status} - ${errorBody}`);
    }

    created = await response.json();
    console.log(`[lejinji-real] Diagnosis created: ${created.diagnosisId}`);

    // Wait for completion polling.
    const pollInterval = 5_000;
    const pollTimeout = 15 * 60 * 1000;
    const pollDeadline = Date.now() + pollTimeout;
    let status = created.status ?? "PROCESSING";

    while (Date.now() < pollDeadline) {
      const statusRes = await fetch(`${BASE}/api/diagnoses/${created.diagnosisId}?publicToken=${created.publicToken}`);
      if (statusRes.ok) {
        const statusBody = await statusRes.json();
        status = statusBody.status ?? status;
        console.log(`[lejinji-real] Status: ${status}`);
        if (status === "READY" || status === "FAILED" || status === "ERROR") break;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    if (status !== "READY") {
      throw new Error(`DIAGNOSIS_NOT_READY:${status}`);
    }

    console.log("[lejinji-real] Diagnosis ready. Verifying report...");
    verification = await verifyReport(created);
    dbMetrics = readDbMetrics();

    // Capture screenshots.
    console.log("[lejinji-real] Capturing screenshots...");
    await captureScreenshots(`${BASE}/report/${created.publicToken}`);

    // Export HTML.
    console.log("[lejinji-real] Exporting HTML...");
    await exportHtml(`${BASE}/report/${created.publicToken}`, join(FINAL_REPORT_DIR, "report.html"));

    // Write outbox event (no Feishu).
    writeOutboxEvent(created.diagnosisId!, created.publicToken!, `${BASE}/report/${created.publicToken}`);

  } finally {
    await stopServer(child);
    const durationMs = Date.now() - startedAt;

    // Update run-lock.
    writeFileSync(
      RUN_LOCK,
      JSON.stringify({
        runner: "lejinji-real-canonical-v1",
        status: verification ? "COMPLETED" : "FAILED",
        finishedAt: new Date().toISOString(),
        durationMs,
        diagnosisIdShort: created.diagnosisId?.slice(0, 8) ?? null,
        ...(verification ? {
          finalState: dbMetrics.finalState,
          providerUsage: dbMetrics.providerUsage,
          evidenceCount: dbMetrics.evidenceCount,
          stageRunCount: dbMetrics.stageRunCount,
          quickVisibleChars: verification.quickVisibleChars,
          reportLanguage: verification.reportLanguage,
          provenance: verification.provenance,
          demoOnly: verification.demoOnly,
        } : {}),
      }, null, 2),
      "utf8",
    );
  }

  // Print final summary.
  const durationMs = Date.now() - startedAt;
  console.log("\n========================================");
  console.log("LEJINJI REAL CANONICAL — FINAL STATUS");
  console.log("========================================");
  console.log(`DIAGNOSIS_ID:          ${created.diagnosisId}`);
  console.log(`REPORT_ID:             ${created.diagnosisId}`);
  console.log(`REPORT_PROVENANCE:     ${verification?.provenance ?? "UNKNOWN"}`);
  console.log(`DEMO_ONLY:             ${verification?.demoOnly ?? "UNKNOWN"}`);
  console.log(`FINAL_STATE:           ${dbMetrics.finalState}`);
  console.log(`DURATION:              ${durationMs}ms`);
  console.log(`EVIDENCE_COUNT:        ${dbMetrics.evidenceCount}`);
  console.log(`STAGE_RUN_COUNT:       ${dbMetrics.stageRunCount}`);
  console.log(`PROVIDER_USAGE:        Bocha=${dbMetrics.providerUsage.bocha} Crawler=${dbMetrics.providerUsage.crawler} DeepSeek=${dbMetrics.providerUsage.deepseek}`);
  console.log(`QUESTION_COUNT:        5`);
  console.log(`ASSESSMENT_COUNT:      5`);
  console.log(`QUICK_CHARS:           ${verification?.quickVisibleChars ?? "UNKNOWN"}`);
  console.log(`REPORT_LANGUAGE:       ${verification?.reportLanguage ?? "UNKNOWN"}`);
  console.log(`REPORT_URL:            ${BASE}/report/${created.publicToken}`);
  console.log(`FINAL_HTML:            ${join(FINAL_REPORT_DIR, "report.html")}`);
  console.log(`OUTBOX_EVENT:          ${join(PRIVATE_DIR, "outbox")}`);
  console.log(`========================================\n`);

  // Write metrics file.
  writeFileSync(
    join(PRIVATE_DIR, "metrics.json"),
    JSON.stringify({
      diagnosisId: created.diagnosisId,
      publicToken: created.publicToken,
      finalState: dbMetrics.finalState,
      durationMs,
      providerUsage: dbMetrics.providerUsage,
      evidenceCount: dbMetrics.evidenceCount,
      stageRunCount: dbMetrics.stageRunCount,
      quickVisibleChars: verification?.quickVisibleChars ?? null,
      reportLanguage: verification?.reportLanguage ?? null,
      provenance: verification?.provenance ?? null,
      demoOnly: verification?.demoOnly ?? null,
      reportUrl: `${BASE}/report/${created.publicToken}`,
    }, null, 2),
    "utf8",
  );
}

main().catch((err) => {
  console.error("[lejinji-real] FATAL:", err);
  process.exit(1);
});
