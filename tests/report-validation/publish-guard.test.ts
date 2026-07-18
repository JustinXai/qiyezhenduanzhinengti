import { describe, expect, it } from "vitest";
import { publishGuard } from "../../src/report/validation/publish-guard";
import {
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
} from "../../src/report/validation/cta-guard";
import { buildValidReport, codesOf, coverageOf, verifiedRelations } from "./support";

describe("publishGuard (ROUND-3 — relations decide §4)", () => {
  it("passes a fully valid report (with frozen CTA labels)", async () => {
    const report = buildValidReport();
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    const result = publishGuard({
      report,
      relations,
      coverage,
      cta: { primaryLabel: PRIMARY_CTA_LABEL, secondaryLabel: SECONDARY_CTA_LABEL },
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks on an evidence-guard violation (dangling candidate id)", async () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_ghost"] }];
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    const result = publishGuard({ report, relations, coverage });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
  });

  it("blocks on a cross-field score inconsistency", async () => {
    const report = buildValidReport();
    report.scores.overallScore = 1; // real value is 62.53
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    expect(codesOf(publishGuard({ report, relations, coverage }))).toContain(
      "CROSS_FIELD_OVERALL_SCORE_MISMATCH",
    );
  });

  it("blocks on a banned-copy / CTA violation", async () => {
    const report = buildValidReport();
    report.coreIssues[0]!.businessImpact = "保证提升您的收入。";
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    expect(codesOf(publishGuard({ report, relations, coverage }))).toContain("CTA_BANNED_PHRASE");
  });

  it("blocks on a view-model evidenceId that does not resolve", async () => {
    const report = buildValidReport();
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    const result = publishGuard({
      report,
      relations,
      coverage,
      viewModels: { evidenceView: { items: [{ ...report.evidence[0]!, id: "ev_ghost" }] } },
    });
    expect(codesOf(result)).toContain("CROSS_FIELD_VIEWMODEL_EVIDENCE_ID_NOT_FOUND");
  });

  it("aggregates violations from multiple guards at once", async () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_ghost"] }]; // evidence
    report.scores.overallScore = 1; // cross-field
    report.strengths[0]!.statement = "保证排名第一。"; // cta
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    const codes = codesOf(publishGuard({ report, relations, coverage }));
    expect(codes).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
    expect(codes).toContain("CROSS_FIELD_OVERALL_SCORE_MISMATCH");
    expect(codes).toContain("CTA_BANNED_PHRASE");
  });

  it("passes the corrected raw frozen sample through every guard", async () => {
    const report = buildValidReport();
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    expect(publishGuard({ report, relations, coverage })).toEqual({ ok: true });
  });
});
