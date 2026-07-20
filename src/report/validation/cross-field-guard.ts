// ============================================================================
// Cross-field guard — internal consistency across the canonical report and,
// optionally, its projected view models.
//
// crossFieldGuard(report):
//   - scoreCoverage matches the value recomputed from the five dimensions,
//   - overallScore matches the recomputed value (and is null exactly when
//     coverage is below the 70% threshold) — docs/SCORE_CONTRACT.md,
//   - demonstrationFix, when present, cites evidence that actually exists.
//
// viewModelEvidenceGuard(report, viewModels):
//   - every evidenceId referenced by a Quick/Deep/Evidence view model resolves
//     to an EvidenceItem in the canonical report (projections never invent
//     evidence). Exposed separately so Agent F can validate its projections;
//     publish-guard runs the report-only crossFieldGuard by default.
// ============================================================================

import type {
  DiagnosisReport,
  DeepReportViewModel,
  EvidenceViewModel,
  QuickReportViewModel,
} from "../../contracts";
import type { GuardResult, GuardViolation } from "../../contracts/guard-types";
import { computeScoreBlock, SCORE_COVERAGE_THRESHOLD } from "./score-calculator";

// Tolerance for comparing 2-decimal internal numbers (guards against float dust).
const EPSILON = 0.005;

export function crossFieldGuard(report: DiagnosisReport): GuardResult {
  const violations: GuardViolation[] = [];
  const { scores } = report;

  const computed = computeScoreBlock({
    companyClarity: scores.companyClarity,
    websiteCompleteness: scores.websiteCompleteness,
    customerQuestionCoverage: scores.customerQuestionCoverage,
    trustEvidence: scores.trustEvidence,
    aiVisibility: scores.aiVisibility,
  });

  if (Math.abs(computed.scoreCoverage - scores.scoreCoverage) > EPSILON) {
    violations.push({
      guard: "cross-field",
      rule: "CROSS_FIELD_SCORE_COVERAGE_MISMATCH",
      message: `scoreCoverage 与维度不一致:声明 ${scores.scoreCoverage},按维度计算 ${computed.scoreCoverage}`,
    });
  }

  if (computed.overallScore === null) {
    // Coverage below threshold (or nothing measured): overallScore must be null.
    if (scores.overallScore !== null) {
      violations.push({
        guard: "cross-field",
        rule: "CROSS_FIELD_OVERALL_SCORE_NOT_NULL_BELOW_COVERAGE_THRESHOLD",
        message: `覆盖率 ${computed.scoreCoverage} 低于阈值 ${SCORE_COVERAGE_THRESHOLD},overallScore 必须为 null,但为 ${scores.overallScore}`,
      });
    }
  } else if (scores.overallScore === null) {
    violations.push({
      guard: "cross-field",
      rule: "CROSS_FIELD_OVERALL_SCORE_MISMATCH",
      message: `overallScore 应为 ${computed.overallScore},但声明为 null`,
    });
  } else if (Math.abs(computed.overallScore - scores.overallScore) > EPSILON) {
    violations.push({
      guard: "cross-field",
      rule: "CROSS_FIELD_OVERALL_SCORE_MISMATCH",
      message: `overallScore 与维度不一致:声明 ${scores.overallScore},按维度计算 ${computed.overallScore}`,
    });
  }

  // demonstrationFix must be backed by evidence that exists (§5 module gate).
  const demo = report.demonstrationFix;
  if (demo) {
    const known = new Set(report.evidence.map((e) => e.id));
    const missing = demo.evidenceIds.filter((id) => !known.has(id));
    if (demo.evidenceIds.length === 0 || missing.length > 0) {
      violations.push({
        guard: "cross-field",
        rule: "CROSS_FIELD_DEMONSTRATION_FIX_WITHOUT_EVIDENCE",
        message: `demonstrationFix ${demo.id} 引用的 Evidence 为空或不存在:${missing.join(", ") || "(空)"}`,
        claimType: "demonstrationFix",
        claimId: demo.id,
        evidenceIds: missing,
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export interface ReportViewModels {
  quick?: QuickReportViewModel;
  deep?: DeepReportViewModel;
  evidenceView?: EvidenceViewModel;
}

export function viewModelEvidenceGuard(
  report: DiagnosisReport,
  viewModels: ReportViewModels,
): GuardResult {
  const violations: GuardViolation[] = [];
  const known = new Set(report.evidence.map((e) => e.id));

  const check = (ids: readonly string[], where: string): void => {
    for (const id of ids) {
      if (!known.has(id)) {
        violations.push({
          guard: "cross-field",
          rule: "CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND",
          message: `视图模型 ${where} 引用了报告中不存在的 Evidence:${id}`,
          evidenceIds: [id],
        });
      }
    }
  };

  const { quick, deep, evidenceView } = viewModels;

  if (quick) {
    if (quick.topStrength) check(quick.topStrength.evidenceIds, "quick.topStrength");
    if (quick.topIssue) check(quick.topIssue.evidenceIds, "quick.topIssue");
    if (quick.topOpportunity) check(quick.topOpportunity.evidenceIds, "quick.topOpportunity");
    // Round-8 FINAL: coreIssues, geoOpportunities, aiVisibilitySamples removed from Quick.
    if (quick.demonstrationFix) check(quick.demonstrationFix.evidenceIds, "quick.demonstrationFix");
    if (quick.competitorGapSummary.available) {
      quick.competitorGapSummary.gaps.forEach((g, i) =>
        check(g.evidenceIds, `quick.competitorGapSummary.gaps[${i}]`),
      );
    }
  }

  if (deep) {
    deep.strengths.forEach((c, i) => check(c.evidenceIds, `deep.strengths[${i}]`));
    deep.coreIssues.forEach((c, i) => check(c.evidenceIds, `deep.coreIssues[${i}]`));
    deep.geoOpportunities.forEach((c, i) => check(c.evidenceIds, `deep.geoOpportunities[${i}]`));
    deep.competitorGaps.forEach((g, i) => check(g.evidenceIds, `deep.competitorGaps[${i}]`));
    deep.aiVisibilityTests.forEach((t, i) => check(t.evidenceIds, `deep.aiVisibilityTests[${i}]`));
  }

  if (evidenceView) {
    check(
      evidenceView.items.map((i) => i.id),
      "evidenceView.items",
    );
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
