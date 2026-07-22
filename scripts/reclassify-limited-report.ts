import { DiagnosisReport } from "../src/contracts";
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
  const searchCompleted = usage.some((u) => u.provider === "bocha" && (u.callCount ?? 0) > 0);
  const limited = DiagnosisReport.parse({
    ...canonical,
    generatedAt: new Date().toISOString(),
    executionMode: "LIMITED_PUBLIC_SCAN",
    publicReportEligible: true,
    publicReportStatus: "LIMITED_READY",
    reportProvenance: "FAST_MVP_GEO_DIAGNOSTIC_REPORT_V1",
    scores: {
      ...canonical.scores,
      overallScore: null,
      scoreCoverage: searchCompleted ? 1 : 0,
    },
    limitedReport: buildUniversalLimitedReport(
      input,
      canonical.evidence,
      searchCompleted,
      new Date().toISOString(),
    ),
  });
  const mvp = limited.limitedReport?.mvpReport;
  if (mvp) {
    const scoreById = new Map(mvp.score.dimensions.map((dimension) => [dimension.id, dimension]));
    const toCanonicalScore = (id: string, maxScore: number) => {
      const dimension = scoreById.get(id);
      return {
        score: dimension?.score === null || dimension?.score === undefined ? null : Math.round((dimension.score / maxScore) * 100),
        measurementStatus: dimension?.score === null || dimension?.score === undefined ? "INSUFFICIENT_EVIDENCE" as const : "MEASURED" as const,
        confidence: dimension?.score === null || dimension?.score === undefined ? 0 : 0.6,
        evidenceIds: canonical.evidence.map((item) => item.id),
      };
    };
    limited.scores = {
      companyClarity: toCanonicalScore("sourceFoundation", 25),
      websiteCompleteness: toCanonicalScore("contentAssets", 25),
      customerQuestionCoverage: toCanonicalScore("customerScenarios", 20),
      trustEvidence: toCanonicalScore("trustInformation", 20),
      aiVisibility: toCanonicalScore("conversionPath", 10),
      overallScore: mvp.score.overall,
      scoreCoverage: mvp.score.completionRate / 100,
    };
  }

  const appended = await revisions.append({
    diagnosisId,
    expectedParentReportId: current.reportId,
    revisionReason: "FAST_MVP_GEO_DIAGNOSTIC_REPORT_V1",
    algorithmVersion: "fast-mvp-geo-diagnostic-report.v1",
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
        overallScore: mvp?.score.overall ?? null,
        level: mvp?.score.level ?? null,
        dimensions: mvp?.score.dimensions.map((dimension) => ({
          id: dimension.id,
          title: dimension.title,
          score: dimension.score,
          maxScore: dimension.maxScore,
        })) ?? [],
        coreIssues: mvp?.coreIssues.map((issue) => ({
          title: issue.title,
          severity: issue.severity,
          priority: issue.priority,
        })) ?? [],
        contentPlans: mvp?.contentPlans.map((plan) => plan.title) ?? [],
        reportLength: mvp?.visibleCharacterCount ?? 0,
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
