import { DiagnosisReport } from "../src/contracts";
import { deriveCoverage } from "../src/contracts/claim-evidence";
import {
  applyCompletionProfileToReport,
  evaluateCompletionProfile,
} from "../src/diagnosis/orchestration/control-plane";
import { parseDiagnosisInput, type DiagnosisInput } from "../src/runtime/diagnosis-input";
import { buildUniversalLimitedReport } from "../src/diagnosis/limited-report/universal-limited-report";
import { openMigratedDatabase } from "../src/storage/migrate";
import { SqliteStorageAdapter } from "../src/storage/sqlite-adapter";
import {
  applyReportRevisionSchema,
  SqliteReportRevisionRepository,
} from "../src/storage/report-revisions";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function validWebsite(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function inputFromStoredJson(serialized: string): DiagnosisInput {
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  const candidate = {
    website: validWebsite(raw.website),
    brandName: typeof raw.brandName === "string" ? raw.brandName : undefined,
    industry: typeof raw.industry === "string" ? raw.industry : undefined,
    productOrService:
      typeof raw.productOrService === "string" ? raw.productOrService : undefined,
    targetRegion: typeof raw.targetRegion === "string" ? raw.targetRegion : undefined,
    customerQuestions: Array.isArray(raw.customerQuestions) ? raw.customerQuestions : undefined,
  };
  const parsed = parseDiagnosisInput(candidate);
  if (!parsed.ok) {
    throw new Error(`STORED_INPUT_UNREADABLE:${parsed.issues.map((i) => i.path).join(",")}`);
  }
  return parsed.input;
}

async function main(): Promise<void> {
  const diagnosisId = requiredEnv("DIAGNOSIS_ID");
  const dbUrl = process.env.DATABASE_URL ?? "./data/dev.sqlite";
  const db = openMigratedDatabase(dbUrl);
  applyReportRevisionSchema(db);
  const storage = new SqliteStorageAdapter(db);
  const revisions = new SqliteReportRevisionRepository(db);

  const request = await storage.getDiagnosisRequest(diagnosisId);
  if (!request) throw new Error("DIAGNOSIS_NOT_FOUND");
  const current = await revisions.getCurrent(diagnosisId);
  if (!current) throw new Error("REPORT_NOT_FOUND");

  const canonical = DiagnosisReport.parse(current.canonical);
  const input = inputFromStoredJson(request.inputJson);
  const usage = (await storage.getProviderUsage(diagnosisId)).map((u) => ({
    provider: u.provider,
    stage: u.stage,
    callCount: u.callCount,
    retryCount: u.retryCount,
    errorCode: u.errorCode,
    costEstimate: u.costEstimate,
  }));
  const stageRuns = storage.getAnalysisStageRuns
    ? await storage.getAnalysisStageRuns(diagnosisId)
    : undefined;
  const firstPartyDomains = input.website
    ? [new URL(input.website).hostname.replace(/^www\./, "")]
    : [];
  const coverage = deriveCoverage({
    evidence: canonical.evidence,
    firstPartyDomains,
    executedQueries: usage.some((u) => u.provider === "bocha" && (u.callCount ?? 0) > 0)
      ? ["stored-production-search"]
      : [],
  });
  const profile = evaluateCompletionProfile({
    diagnosisId,
    input,
    evidence: canonical.evidence,
    coverage,
    usage,
    analysisStageRuns: stageRuns,
    report: canonical,
    truthGuardPassed: false,
    evaluatedAt: new Date().toISOString(),
  });
  const limited = DiagnosisReport.parse({
    ...applyCompletionProfileToReport(canonical, profile),
    limitedReport: buildUniversalLimitedReport(
      input,
      canonical.evidence,
      usage.some((u) => u.provider === "bocha" && (u.callCount ?? 0) > 0),
    ),
  });

  const appended = await revisions.append({
    diagnosisId,
    expectedParentReportId: current.reportId,
    revisionReason: "UNIVERSAL_LIMITED_REPORT_ENRICHMENT",
    algorithmVersion: "universal-limited-report.v1",
    canonicalJson: JSON.stringify(limited),
    prunedClaims: [],
  });
  await storage.updateDiagnosisStatus(diagnosisId, "READY_LIMITED");

  console.log(
    JSON.stringify(
      {
        diagnosisId,
        revisionId: appended.id,
        previousStatus: request.status,
        newStatus: "READY_LIMITED",
        executionMode: limited.executionMode,
        publicReportEligible: limited.publicReportEligible,
        reasons: profile.completionReasons,
      },
      null,
      2,
    ),
  );
  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
