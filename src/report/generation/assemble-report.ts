// Assemble analysis outputs into a Canonical DiagnosisReport.
//
// This module ONLY assembles + validates. It does not call providers, retry, or
// checkpoint — that orchestration is Agent E's (src/diagnosis/orchestration). The
// per-stage analysis (company profile, dimension scores, AI visibility, claims) is
// produced by src/diagnosis/analysis. Before returning, the assembled shape is
// validated with DiagnosisReport.parse so nothing non-canonical ever leaves here
// (docs/REPORT_CONTRACT.md; shape anchored to src/fixtures/sample-report.ts).

import {
  DiagnosisReport,
  REPORT_CONTRACT_VERSION,
  SCORE_CONTRACT_VERSION,
  type DiagnosisReport as DiagnosisReportType,
  type EvidenceItem,
  type ScoreBlock,
} from "../../contracts";
import type { AiVisibilityResult } from "../../diagnosis/analysis/ai-visibility";
import type { ClaimsResult } from "../../diagnosis/analysis/claims";
import type { CompanyProfileInput } from "../../diagnosis/analysis/company-profile";
import type { NonAiScoreBlock } from "../../diagnosis/analysis/dimension-scoring";
import {
  extractCompanyProfile,
} from "../../diagnosis/analysis/company-profile";
import { scoreNonAiDimensions } from "../../diagnosis/analysis/dimension-scoring";
import { buildAiVisibility, type AiVisibilityInput } from "../../diagnosis/analysis/ai-visibility";
import { buildClaims } from "../../diagnosis/analysis/claims";
import type { ProviderFailure } from "../../providers/types";
import { computeOverall } from "./score-seam";

type CompanyProfile = DiagnosisReportType["companyProfile"];

/** Identity + timestamp assigned by the runtime (Agent E), not invented here. */
export interface ReportIdentity {
  diagnosisId: string;
  publicToken: string;
  generatedAt: string;
}

export interface AssembleReportInput {
  identity: ReportIdentity;
  companyProfile: CompanyProfile;
  nonAiScores: NonAiScoreBlock;
  aiVisibility: AiVisibilityResult;
  claims: ClaimsResult;
  evidence: readonly EvidenceItem[];
}

export type AssembleReportResult =
  | { ok: true; report: DiagnosisReportType }
  | { ok: false; issues: string[] };

function buildScoreBlock(
  nonAiScores: NonAiScoreBlock,
  aiVisibility: AiVisibilityResult,
): ScoreBlock {
  const dimensions = {
    companyClarity: nonAiScores.companyClarity,
    websiteCompleteness: nonAiScores.websiteCompleteness,
    customerQuestionCoverage: nonAiScores.customerQuestionCoverage,
    trustEvidence: nonAiScores.trustEvidence,
    aiVisibility: aiVisibility.dimension,
  };
  const overall = computeOverall(dimensions);
  return {
    ...dimensions,
    overallScore: overall.overallScore,
    scoreCoverage: overall.scoreCoverage,
  };
}

/** Assemble already-computed analysis outputs into a validated DiagnosisReport. */
export function assembleReport(input: AssembleReportInput): AssembleReportResult {
  const draft = {
    reportContractVersion: REPORT_CONTRACT_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    diagnosisId: input.identity.diagnosisId,
    publicToken: input.identity.publicToken,
    generatedAt: input.identity.generatedAt,
    companyProfile: input.companyProfile,
    scores: buildScoreBlock(input.nonAiScores, input.aiVisibility),
    aiVisibilityTests: input.aiVisibility.tests,
    strengths: input.claims.strengths,
    coreIssues: input.claims.coreIssues,
    competitorGaps: input.claims.competitorGaps,
    geoOpportunities: input.claims.geoOpportunities,
    demonstrationFix: input.claims.demonstrationFix,
    evidence: [...input.evidence],
  };

  const parsed = DiagnosisReport.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
    };
  }
  return { ok: true, report: parsed.data };
}

// ---------------------------------------------------------------------------
// End-to-end convenience: run the analysis stages over already-obtained DeepSeek
// stage JSON + evidence, then assemble. Provider calls / retries / checkpoints are
// still Agent E's concern; this only consumes stage outputs it is handed.
// ---------------------------------------------------------------------------

export interface StageOutputs {
  companyProfile: unknown;
  dimensionSignals: unknown;
  aiVisibility: unknown;
  claims: unknown;
}

export interface BuildReportInput {
  identity: ReportIdentity;
  profileInput: CompanyProfileInput;
  aiVisibilityInput: AiVisibilityInput;
  evidence: readonly EvidenceItem[];
  stageOutputs: StageOutputs;
}

export type BuildReportResult =
  | { ok: true; report: DiagnosisReportType }
  | { ok: false; stage: string; error: ProviderFailure }
  | { ok: false; stage: "assemble"; issues: string[] };

/**
 * Compose the four analysis stages and assemble. Any per-stage schema mismatch is
 * surfaced as the originating stage's ProviderFailure; assembly problems surface
 * the Zod issue list.
 */
export function buildReportFromStageOutputs(input: BuildReportInput): BuildReportResult {
  const { evidence, stageOutputs } = input;

  const profile = extractCompanyProfile(input.profileInput, stageOutputs.companyProfile);
  if (!profile.ok) return { ok: false, stage: "company_profile", error: profile.error };

  const nonAiScores = scoreNonAiDimensions(evidence, stageOutputs.dimensionSignals);
  if (!nonAiScores.ok) return { ok: false, stage: "dimension_signals", error: nonAiScores.error };

  const aiVisibility = buildAiVisibility(evidence, input.aiVisibilityInput, stageOutputs.aiVisibility);
  if (!aiVisibility.ok) return { ok: false, stage: "ai_visibility", error: aiVisibility.error };

  const claims = buildClaims(evidence, stageOutputs.claims);
  if (!claims.ok) return { ok: false, stage: "claims", error: claims.error };

  const assembled = assembleReport({
    identity: input.identity,
    companyProfile: profile.value,
    nonAiScores: nonAiScores.value,
    aiVisibility: aiVisibility.value,
    claims: claims.value,
    evidence,
  });
  if (!assembled.ok) return { ok: false, stage: "assemble", issues: assembled.issues };
  return { ok: true, report: assembled.report };
}
