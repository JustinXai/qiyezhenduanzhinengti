import { describe, expect, it } from "vitest";
import { publishGuard } from "../../src/report/validation/publish-guard";
import {
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
} from "../../src/report/validation/cta-guard";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import { buildValidReport, codesOf } from "./support";

describe("publishGuard", () => {
  it("passes a fully valid report (with frozen CTA labels)", () => {
    const result = publishGuard({
      report: buildValidReport(),
      cta: { primaryLabel: PRIMARY_CTA_LABEL, secondaryLabel: SECONDARY_CTA_LABEL },
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks on an evidence-guard violation", () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_ghost"] }];
    const result = publishGuard({ report });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
  });

  it("blocks on a cross-field score inconsistency", () => {
    const report = buildValidReport();
    report.scores.overallScore = 1; // real value is 59.15
    expect(codesOf(publishGuard({ report }))).toContain("CROSS_FIELD_OVERALL_SCORE_MISMATCH");
  });

  it("blocks on a banned-copy / CTA violation", () => {
    const report = buildValidReport();
    report.coreIssues[0]!.businessImpact = "保证提升您的收入。";
    expect(codesOf(publishGuard({ report }))).toContain("CTA_BANNED_PHRASE");
  });

  it("blocks on a view-model evidenceId that does not resolve", () => {
    const report = buildValidReport();
    const result = publishGuard({
      report,
      viewModels: { evidenceView: { items: [{ ...report.evidence[0]!, id: "ev_ghost" }] } },
    });
    expect(codesOf(result)).toContain("CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND");
  });

  it("aggregates violations from multiple guards at once", () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_ghost"] }]; // evidence
    report.scores.overallScore = 1; // cross-field
    report.strengths[0]!.statement = "保证排名第一。"; // cta
    const codes = codesOf(publishGuard({ report }));
    expect(codes).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
    expect(codes).toContain("CROSS_FIELD_OVERALL_SCORE_MISMATCH");
    expect(codes).toContain("CTA_BANNED_PHRASE");
  });

  it("the raw frozen sample is blocked only by the evidence guard (score/cta pass)", () => {
    // Confirms the FIXTURE SEAM is isolated to §4 evidence support levels: the
    // score cross-field and CTA guards already pass on the untouched sample.
    const result = publishGuard({ report: SAMPLE_DIAGNOSIS_REPORT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.every((v) => v.guard === "evidence")).toBe(true);
  });
});
