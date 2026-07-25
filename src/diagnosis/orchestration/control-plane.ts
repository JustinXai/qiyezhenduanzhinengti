import type {
  DiagnosisCompletionProfileV1,
  DiagnosisReport,
  EvidenceItem,
} from "../../contracts";
import type { EvidenceCoverage } from "../../contracts/claim-evidence";
import type { AnalysisStageRunRecord } from "../../storage/adapter";
import type { DiagnosisInput } from "../../runtime/diagnosis-input";
import { buildUniversalLimitedReport } from "../limited-report/universal-limited-report";
import type { ProviderUsageSample } from "./state-machine";

export const COMPLETION_PROFILE_ALGORITHM_VERSION =
  "diagnosis-completion-profile.v1" as const;

export interface CompletionProfileInput {
  diagnosisId: string;
  input: DiagnosisInput;
  evidence: readonly EvidenceItem[];
  coverage: EvidenceCoverage;
  usage: readonly ProviderUsageSample[];
  analysisStageRuns?: readonly AnalysisStageRunRecord[];
  report: DiagnosisReport;
  truthGuardPassed: boolean;
  evaluatedAt: string;
}

type RequiredAnalysisStage =
  | "REPORT_PROFILE"
  | "REPORT_SCORING"
  | "REPORT_AI_VISIBILITY"
  | "REPORT_CLAIMS";

function hasProviderError(usage: readonly ProviderUsageSample[]): boolean {
  return usage.some((u) => u.errorCode && u.errorCode.length > 0);
}

function callsFor(usage: readonly ProviderUsageSample[], provider: string, stagePrefix?: string): number {
  return usage
    .filter((u) => u.provider === provider && (!stagePrefix || u.stage.startsWith(stagePrefix)))
    .reduce((sum, u) => sum + (u.callCount ?? 0), 0);
}

function hasUsageStage(usage: readonly ProviderUsageSample[], stage: string): boolean {
  return usage.some((u) => u.stage === stage);
}

function hasSucceededStage(
  stageRuns: readonly AnalysisStageRunRecord[] | undefined,
  stage: RequiredAnalysisStage,
): boolean | null {
  if (!stageRuns || stageRuns.length === 0) return null;
  return stageRuns.some((run) => run.stage === stage && run.status === "SUCCEEDED");
}

function hasCrawledEvidence(evidence: readonly EvidenceItem[]): boolean {
  return evidence.some(
    (item) =>
      item.acquisitionLevel === "CRAWLED_PAGE" ||
      item.acquisitionLevel === "OFFICIAL_PAGE" ||
      item.acquisitionLevel === "OFFICIAL_REGISTRY" ||
      item.sourceType === "FIRST_PARTY_EVIDENCE",
  );
}

function hasActionableDiagnosticContent(report: DiagnosisReport): boolean {
  return (
    report.coreIssues.length > 0 ||
    report.geoOpportunities.length > 0 ||
    report.competitorGaps.length > 0 ||
    report.demonstrationFix !== null
  );
}

function acquisitionSummary(evidence: readonly EvidenceItem[]): {
  allSearchSnippets: boolean;
  crawledCount: number;
} {
  const crawledCount = evidence.filter(
    (item) =>
      item.acquisitionLevel === "CRAWLED_PAGE" ||
      item.acquisitionLevel === "OFFICIAL_PAGE" ||
      item.acquisitionLevel === "OFFICIAL_REGISTRY",
  ).length;
  return {
    allSearchSnippets:
      evidence.length > 0 &&
      evidence.every((item) => (item.acquisitionLevel ?? "SEARCH_SNIPPET") === "SEARCH_SNIPPET"),
    crawledCount,
  };
}

export function evaluateCompletionProfile(
  input: CompletionProfileInput,
): DiagnosisCompletionProfileV1 {
  const reasons: string[] = [];
  const usage = input.usage;
  const stageRuns = input.analysisStageRuns;
  const evidenceSummary = acquisitionSummary(input.evidence);
  const hasWebsite = input.input.website.trim().length > 0;

  const searchCompleted = callsFor(usage, "bocha", "SEARCH") > 0 || input.evidence.length > 0;
  const crawlCompleted =
    callsFor(usage, "crawler") > 0 ||
    callsFor(usage, "bocha", "CRAWLING") > 0 ||
    hasCrawledEvidence(input.evidence);

  const profileAnalysisCompleted =
    hasSucceededStage(stageRuns, "REPORT_PROFILE") ?? callsFor(usage, "deepseek") > 0;
  const scoringAnalysisCompleted =
    hasSucceededStage(stageRuns, "REPORT_SCORING") ?? callsFor(usage, "deepseek") > 0;
  const aiVisibilityAnalysisCompleted =
    hasSucceededStage(stageRuns, "REPORT_AI_VISIBILITY") ?? callsFor(usage, "deepseek") > 0;
  const claimsAnalysisCompleted =
    hasSucceededStage(stageRuns, "REPORT_CLAIMS") ?? callsFor(usage, "deepseek") > 0;
  const claimEvidenceVerificationCompleted =
    hasUsageStage(usage, "CLAIM_EVIDENCE_VERIFICATION") ||
    stageRuns?.some((run) => run.stage === "REPORT_CLAIMS" && run.status === "SUCCEEDED") === true;

  const providerFailed = hasProviderError(usage);
  const providerAvailabilityStatus = providerFailed ? "PROVIDER_FAILED" : "AVAILABLE";
  const evidenceCoverageStatus = input.coverage.boundaryEstablished
    ? "BOUNDARY_ESTABLISHED"
    : "NOT_ESTABLISHED";
  const entityResolutionStatus = hasWebsite ? "RESOLVED" : "PARTIALLY_RESOLVED";

  if (!hasWebsite) reasons.push("WEBSITE_UNCONFIRMED");
  if (!searchCompleted) reasons.push("SEARCH_NOT_COMPLETED");
  if (!crawlCompleted) reasons.push("CRAWL_NOT_COMPLETED");
  if (evidenceSummary.allSearchSnippets) reasons.push("EVIDENCE_ONLY_SEARCH_SNIPPETS");
  if (!profileAnalysisCompleted) reasons.push("REPORT_PROFILE_NOT_COMPLETED");
  if (!scoringAnalysisCompleted) reasons.push("REPORT_SCORING_NOT_COMPLETED");
  if (!aiVisibilityAnalysisCompleted) reasons.push("REPORT_AI_VISIBILITY_NOT_COMPLETED");
  if (!claimsAnalysisCompleted) reasons.push("REPORT_CLAIMS_NOT_COMPLETED");
  if (!claimEvidenceVerificationCompleted) reasons.push("CLAIM_EVIDENCE_VERIFICATION_NOT_COMPLETED");
  if (!input.truthGuardPassed) reasons.push("TRUTH_GUARD_NOT_PASSED");
  if (!input.coverage.boundaryEstablished) reasons.push("EVIDENCE_COVERAGE_NOT_ESTABLISHED");
  if (providerFailed) reasons.push("PROVIDER_UNAVAILABLE_OR_FAILED");
  if ((input.report.scores.scoreCoverage ?? 0) < 0.7) reasons.push("SCORE_COVERAGE_BELOW_THRESHOLD");
  if (!hasActionableDiagnosticContent(input.report)) reasons.push("NO_ACTIONABLE_DIAGNOSTIC_CONTENT");

  const full =
    hasWebsite &&
    searchCompleted &&
    crawlCompleted &&
    !evidenceSummary.allSearchSnippets &&
    profileAnalysisCompleted &&
    scoringAnalysisCompleted &&
    aiVisibilityAnalysisCompleted &&
    claimsAnalysisCompleted &&
    claimEvidenceVerificationCompleted &&
    input.truthGuardPassed &&
    input.coverage.boundaryEstablished &&
    !providerFailed &&
    (input.report.scores.scoreCoverage ?? 0) >= 0.7 &&
    hasActionableDiagnosticContent(input.report);

  return {
    diagnosisId: input.diagnosisId,
    entityResolutionStatus,
    searchCompleted,
    crawlCompleted,
    profileAnalysisCompleted,
    scoringAnalysisCompleted,
    aiVisibilityAnalysisCompleted,
    claimsAnalysisCompleted,
    claimEvidenceVerificationCompleted,
    truthGuardPassed: input.truthGuardPassed,
    evidenceCoverageStatus,
    providerAvailabilityStatus,
    executionMode: full ? "FULL_DIAGNOSIS" : "LIMITED_PUBLIC_SCAN",
    publicReportEligible: full,
    completionReasons: full ? ["FULL_COMPLETION_PROFILE_PASSED"] : [...new Set(reasons)],
    evaluatedAt: input.evaluatedAt,
    algorithmVersion: COMPLETION_PROFILE_ALGORITHM_VERSION,
  };
}

export function applyCompletionProfileToReport(
  report: DiagnosisReport,
  profile: DiagnosisCompletionProfileV1,
  options: {
    input?: DiagnosisInput;
    searchCompleted?: boolean;
    generatedAt?: string;
  } = {},
): DiagnosisReport {
  if (profile.executionMode === "FULL_DIAGNOSIS") {
    return {
      ...report,
      executionMode: "FULL_DIAGNOSIS",
      publicReportEligible: true,
      publicReportStatus: "FULL_READY",
      completionProfile: profile,
      reportProvenance: report.reportProvenance ?? "REAL_PROVIDER_CANONICAL",
    };
  }

  const limitedEvidence = report.evidence.map((item) => ({
    ...item,
    supportLevel:
      (item.acquisitionLevel ?? "SEARCH_SNIPPET") === "SEARCH_SNIPPET"
        ? "CONTEXT_ONLY"
        : item.supportLevel,
  }));
  const limitedReport =
    report.limitedReport ??
    (options.input
      ? buildUniversalLimitedReport(
          options.input,
          limitedEvidence,
          options.searchCompleted ?? profile.searchCompleted,
          options.generatedAt ?? report.generatedAt,
        )
      : undefined);

  return {
    ...report,
    scores: { ...report.scores, overallScore: null },
    coreIssues: [],
    geoOpportunities: [],
    competitorGaps: [],
    demonstrationFix: null,
    evidence: limitedEvidence,
    executionMode: "LIMITED_PUBLIC_SCAN",
    publicReportEligible: false,
    publicReportStatus: "LIMITED_READY",
    completionProfile: profile,
    reportProvenance: report.reportProvenance ?? "REAL_PROVIDER_CANONICAL",
    ...(limitedReport ? { limitedReport } : {}),
  };
}
