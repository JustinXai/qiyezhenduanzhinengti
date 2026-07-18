import { describe, expect, it } from "vitest";
import type { QuickReportViewModel } from "../../src/contracts";
import {
  ctaGuard,
  PRIMARY_CTA_LABEL,
  QUICK_CHARACTER_BUDGET,
  SECONDARY_CTA_LABEL,
} from "../../src/report/validation/cta-guard";
import { buildValidReport, codesOf } from "./support";

function minimalQuick(overrides: Partial<QuickReportViewModel> = {}): QuickReportViewModel {
  const report = buildValidReport();
  return {
    diagnosisId: report.diagnosisId,
    publicToken: report.publicToken,
    reportLanguage: "zh-CN" as const,
    brandName: report.companyProfile.brandName,
    reportDate: report.generatedAt,
    headlineConclusion: "企业在 AI 问答中的基础可见度仍有提升空间。",
    overallScore: report.scores.overallScore,
    scoreCoverage: report.scores.scoreCoverage,
    measurementStatusSummary: "部分维度暂未测得。",
    measurementComposition: { measuredWeight: 0.15, estimatedWeight: 0.85, insufficientWeight: 0, providerFailedWeight: 0 },
    estimationNotice: null,
    topStrength: report.strengths[0] ?? null,
    topIssue: report.coreIssues[0] ?? null,
    topOpportunity: report.geoOpportunities[0] ?? null,
    aiVisibilitySamples: [],
    competitorGapSummary: {
      available: false,
      reason: "已收到竞品输入,但本次公开证据不足,暂不做确定性比较。",
    },
    coreIssues: [],
    demonstrationFix: null,
    geoOpportunities: [],
    ...overrides,
  };
}

describe("ctaGuard", () => {
  it("passes a clean report with the frozen CTA labels", () => {
    const result = ctaGuard({
      report: buildValidReport(),
      cta: { primaryLabel: PRIMARY_CTA_LABEL, secondaryLabel: SECONDARY_CTA_LABEL },
    });
    expect(result).toEqual({ ok: true });
  });

  it("flags a banned phrase in report copy (§9)", () => {
    const report = buildValidReport();
    report.coreIssues[0]!.businessImpact = "只要照做就能保证排名第一。";
    expect(codesOf(ctaGuard({ report }))).toContain("CTA_BANNED_PHRASE");
  });

  it("catches a whitespace-alias of a banned phrase", () => {
    const report = buildValidReport();
    report.coreIssues[0]!.statement = "本方案 保证 排名 稳定上升。";
    expect(codesOf(ctaGuard({ report }))).toContain("CTA_BANNED_PHRASE");
  });

  it("catches a banned phrase in Quick copy", () => {
    const report = buildValidReport();
    const quick = minimalQuick({ headlineConclusion: "我们显著提升您的曝光。" });
    expect(codesOf(ctaGuard({ report, quick }))).toContain("CTA_BANNED_PHRASE");
  });

  it("flags a wrong primary CTA label", () => {
    const codes = codesOf(
      ctaGuard({
        report: buildValidReport(),
        cta: { primaryLabel: "立即购买", secondaryLabel: SECONDARY_CTA_LABEL },
      }),
    );
    expect(codes).toContain("CTA_PRIMARY_LABEL_MISMATCH");
    expect(codes).not.toContain("CTA_SECONDARY_LABEL_MISMATCH");
  });

  it("flags a wrong secondary CTA label", () => {
    const codes = codesOf(
      ctaGuard({
        report: buildValidReport(),
        cta: { primaryLabel: PRIMARY_CTA_LABEL, secondaryLabel: "马上下单" },
      }),
    );
    expect(codes).toContain("CTA_SECONDARY_LABEL_MISMATCH");
  });

  it("flags a Quick view model over the character budget", () => {
    const report = buildValidReport();
    const quick = minimalQuick({ headlineConclusion: "字".repeat(QUICK_CHARACTER_BUDGET + 1) });
    expect(codesOf(ctaGuard({ report, quick }))).toContain("CTA_QUICK_CHARACTER_BUDGET_EXCEEDED");
  });

  it("passes a Quick view model within the character budget", () => {
    const report = buildValidReport();
    expect(codesOf(ctaGuard({ report, quick: minimalQuick() }))).not.toContain(
      "CTA_QUICK_CHARACTER_BUDGET_EXCEEDED",
    );
  });
});
