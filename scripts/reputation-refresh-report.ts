import { loadEnvConfig } from "@next/env";
import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType } from "../src/contracts";
import { buildReputationSnapshot } from "../src/diagnosis/reputation/snapshot";
import { buildUniversalLimitedReport } from "../src/diagnosis/limited-report/universal-limited-report";
import { parseDiagnosisInput, type DiagnosisInput } from "../src/runtime/diagnosis-input";
import { openMigratedDatabase } from "../src/storage/migrate";
import { SqliteStorageAdapter } from "../src/storage/sqlite-adapter";
import {
  applyReportRevisionSchema,
  SqliteReportRevisionRepository,
} from "../src/storage/report-revisions";

loadEnvConfig(process.cwd());

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
    competitors: Array.isArray(raw.competitors) ? raw.competitors : undefined,
  };
  const parsed = parseDiagnosisInput(candidate);
  if (!parsed.ok) {
    throw new Error(`STORED_INPUT_UNREADABLE:${parsed.issues.map((i) => i.path).join(",")}`);
  }
  return parsed.input;
}

async function main(): Promise<void> {
  if (process.env.ALLOW_REPUTATION_REPORT_REFRESH !== "1") {
    throw new Error("ALLOW_REPUTATION_REPORT_REFRESH_REQUIRED");
  }
  const diagnosisId = requiredEnv("DIAGNOSIS_ID");
  const revisionReason = process.env.REVISION_REASON?.trim() || "REPUTATION_SUMMARY_SCORE_INDUSTRY_POLISH_V1";
  const algorithmVersion = process.env.REPUTATION_REFRESH_ALGORITHM_VERSION?.trim() || "reputation-summary-score-industry-polish.v1";
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
  const previousReputation = canonical.limitedReport?.mvpReport?.reputation;
  const searchedQueries = previousReputation?.searchedQueries ?? [];
  const generatedAt = new Date().toISOString();
  const reputation = buildReputationSnapshot({
    diagnosisId,
    diagnosisInput: input,
    evidence: canonical.evidence,
    searchedQueries,
    generatedAt,
  });
  const limitedReport = buildUniversalLimitedReport(input, canonical.evidence, true, generatedAt, {
    diagnosisId,
    reputation,
    searchedReputationQueries: searchedQueries,
  });
  const nextReport: DiagnosisReportType = DiagnosisReport.parse({
    ...canonical,
    generatedAt,
    scores: {
      ...canonical.scores,
      overallScore: limitedReport.mvpReport?.score.overall ?? canonical.scores.overallScore,
      scoreCoverage: (limitedReport.mvpReport?.score.completionRate ?? 0) / 100,
    },
    executionMode: "LIMITED_PUBLIC_SCAN",
    publicReportEligible: true,
    publicReportStatus: "LIMITED_READY",
    reportProvenance: revisionReason,
    limitedReport,
  });
  const appended = await revisions.append({
    diagnosisId,
    expectedParentReportId: current.reportId,
    revisionReason,
    algorithmVersion,
    canonicalJson: JSON.stringify(nextReport),
    prunedClaims: [],
  });
  await storage.updateDiagnosisStatus(diagnosisId, "READY_LIMITED");

  console.log(JSON.stringify({
    diagnosisId,
    revisionId: appended.id,
    revisionReason,
    algorithmVersion,
    previousScore: previousReputation?.overallReputationScore ?? null,
    nextScore: reputation.overallReputationScore,
    previousRiskLevel: previousReputation?.riskLevel ?? null,
    nextRiskLevel: reputation.riskLevel,
    matchedEvidenceCount: reputation.evidenceIds.length,
    negativeSignalCount: reputation.complaintSignals.length,
    companyResponseCount: reputation.responseSignals.length,
    sourceCoverage: reputation.sourceCoverage,
    bochaCallsAdded: 0,
    crawlerCallsAdded: 0,
    deepseekCallsAdded: 0,
  }, null, 2));
  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
