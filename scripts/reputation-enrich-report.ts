import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType, type EvidenceItem } from "../src/contracts";
import { createBochaProvider } from "../src/providers/bocha/bocha-adapter";
import { normalizeEvidence } from "../src/diagnosis/evidence/normalize";
import { buildReputationQueries } from "../src/diagnosis/reputation/policy";
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

function hostOf(website: string): string[] {
  if (!website) return [];
  try {
    return [new URL(website).hostname];
  } catch {
    return [];
  }
}

function toEvidenceRow(diagnosisId: string, item: EvidenceItem) {
  return {
    id: item.id,
    diagnosisId,
    sourceType: item.sourceType,
    sourceDomain: item.sourceDomain,
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    authorityLevel: item.authorityLevel,
    supportLevel: item.supportLevel,
    acquisitionLevel: item.acquisitionLevel ?? "SEARCH_SNIPPET",
    fetchedAt: new Date(item.fetchedAt),
  };
}

function mergeEvidence(existing: readonly EvidenceItem[], added: readonly EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const item of [...existing, ...added]) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function main(): Promise<void> {
  if (process.env.ALLOW_REPUTATION_ENRICHMENT !== "1") {
    throw new Error("ALLOW_REPUTATION_ENRICHMENT_REQUIRED");
  }
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
  if (canonical.limitedReport?.mvpReport?.reputation && process.env.FORCE_REPUTATION_ENRICHMENT !== "1") {
    throw new Error("REPUTATION_ENRICHMENT_ALREADY_PRESENT");
  }
  const input = inputFromStoredJson(request.inputJson);
  const queries = buildReputationQueries(input, 8);
  const bocha = createBochaProvider({ maxRetries: 0, timeoutMs: 15_000 });
  const rawResults = [];
  const usageRows = [];
  const startedAt = new Date();
  for (const query of queries) {
    const res = await bocha.search(query, { limit: 5 });
    usageRows.push({
      id: randomUUID(),
      diagnosisId,
      executionProfile: "REPUTATION_ENRICHMENT_PROFILE",
      provider: "bocha",
      stage: "REPUTATION_SEARCH",
      callCount: 1,
      hardLimit: 8,
      retryCount: 0,
      status: res.ok ? "COMPLETED" : "FAILED",
      errorCode: res.ok ? null : res.error.code,
      startedAt,
      completedAt: new Date(),
    });
    if (res.ok) rawResults.push(...res.results);
  }
  for (const row of usageRows) await storage.recordProviderUsage(row);

  const newEvidence = normalizeEvidence(rawResults, {
    companyDomains: hostOf(input.website),
    competitorDomains: [],
  });
  await storage.saveEvidence(newEvidence.map((item) => toEvidenceRow(diagnosisId, item)));
  const evidence = mergeEvidence(canonical.evidence, newEvidence);
  const generatedAt = new Date().toISOString();
  const reputation = buildReputationSnapshot({
    diagnosisId,
    diagnosisInput: input,
    evidence,
    searchedQueries: queries,
    generatedAt,
  });
  const limitedReport = buildUniversalLimitedReport(input, evidence, true, generatedAt, {
    diagnosisId,
    reputation,
    searchedReputationQueries: queries,
  });
  const nextReport: DiagnosisReportType = DiagnosisReport.parse({
    ...canonical,
    generatedAt,
    evidence,
    scores: {
      ...canonical.scores,
      overallScore: limitedReport.mvpReport?.score.overall ?? canonical.scores.overallScore,
      scoreCoverage: (limitedReport.mvpReport?.score.completionRate ?? 0) / 100,
    },
    executionMode: "LIMITED_PUBLIC_SCAN",
    publicReportEligible: true,
    publicReportStatus: "LIMITED_READY",
    reportProvenance: "REPUTATION_FIRST_REPORT_AND_SIMPLE_INPUT_MVP_V1",
    limitedReport,
  });
  const appended = await revisions.append({
    diagnosisId,
    expectedParentReportId: current.reportId,
    revisionReason: "REPUTATION_ENRICHMENT_PROFILE",
    algorithmVersion: "reputation-first-report-and-simple-input-mvp.v1",
    canonicalJson: JSON.stringify(nextReport),
    prunedClaims: [],
  });
  await storage.updateDiagnosisStatus(diagnosisId, "READY_LIMITED");
  console.log(JSON.stringify({
    diagnosisId,
    revisionId: appended.id,
    bochaCalls: usageRows.length,
    crawlerCalls: 0,
    deepseekCalls: 0,
    newEvidence: newEvidence.length,
    reportUrlToken: request.publicToken,
    overallScoreV2: limitedReport.mvpReport?.score.overall ?? null,
    reputationScore: reputation.overallReputationScore,
    reputationRiskLevel: reputation.riskLevel,
    reportLength: limitedReport.mvpReport?.visibleCharacterCount ?? 0,
    dimensionScores: limitedReport.mvpReport?.score.dimensions.map((dimension) => ({
      id: dimension.id,
      title: dimension.title,
      score: dimension.score === null ? null : Math.round((dimension.score / dimension.maxScore) * 100),
    })),
    coreIssues: limitedReport.mvpReport?.coreIssues.map((issue) => ({ title: issue.title, priority: issue.priority })),
    contentPlans: limitedReport.mvpReport?.contentPlans.map((plan) => plan.title),
  }, null, 2));
  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
