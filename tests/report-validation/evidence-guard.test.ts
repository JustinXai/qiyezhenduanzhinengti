import { describe, expect, it } from "vitest";
import { evidenceGuard } from "../../src/report/validation/evidence-guard";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import { buildValidReport, codesOf } from "./support";

describe("evidenceGuard", () => {
  it("passes a §4-valid report", () => {
    expect(evidenceGuard(buildValidReport())).toEqual({ ok: true });
  });

  it("documents the current fixture under-support (PRODUCT_TRUTH_RULES §4)", () => {
    // GREEN today, but pinned so the Supervisor is alerted the moment the
    // frozen fixture's evidence support levels are corrected upstream.
    // See agent-output/agent-b/CHECKPOINT.md for the seam finding.
    const result = evidenceGuard(SAMPLE_DIAGNOSIS_REPORT);
    expect(result.ok).toBe(false);
    const codes = codesOf(result);
    // iss_1 (PARTIAL) & iss_3 (PARTIAL) -> §4.1 ; iss_2 & geo_2 (CONTEXT_ONLY)
    // -> §4.4 ; geo_1 (single PARTIAL) -> §4.3.
    expect(codes.filter((c) => c === "TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT")).toHaveLength(2);
    expect(codes.filter((c) => c === "TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT")).toHaveLength(2);
    expect(codes).toContain("TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT");
    expect(codes).toHaveLength(5);
  });

  it("§4.1 flags a core issue lacking DIRECT_SUPPORT (only PARTIAL)", () => {
    const report = buildValidReport();
    // downgrade the evidence the first core issue depends on to PARTIAL
    report.evidence = report.evidence.map((e) =>
      e.id === report.coreIssues[0]!.evidenceIds[0]
        ? { ...e, supportLevel: "PARTIAL_SUPPORT" as const }
        : e,
    );
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT");
  });

  it("§4.2 flags a strength with a single PARTIAL_SUPPORT", () => {
    const report = buildValidReport();
    report.strengths = [
      { ...report.strengths[0]!, evidenceIds: ["ev_first_about"] }, // PARTIAL only
    ];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_2_STRENGTH_NEEDS_SUPPORT");
  });

  it("§4.2 accepts a strength backed by two PARTIAL_SUPPORT items", () => {
    const report = buildValidReport();
    // ev_first_about is PARTIAL; add a second PARTIAL sibling.
    report.evidence = [
      ...report.evidence,
      { ...report.evidence.find((e) => e.id === "ev_first_about")!, id: "ev_first_about_2" },
    ];
    report.strengths = [
      { ...report.strengths[0]!, evidenceIds: ["ev_first_about", "ev_first_about_2"] },
    ];
    expect(evidenceGuard(report).ok).toBe(true);
  });

  it("§4.3 flags a GEO opportunity with a single PARTIAL_SUPPORT", () => {
    const report = buildValidReport();
    report.geoOpportunities = [
      { ...report.geoOpportunities[0]!, evidenceIds: ["ev_first_about"] }, // 1 PARTIAL
    ];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_3_OPPORTUNITY_NEEDS_SUPPORT");
  });

  it("§4.4 flags a core issue backed only by CONTEXT_ONLY", () => {
    const report = buildValidReport();
    report.evidence = [
      ...report.evidence,
      { ...report.evidence[0]!, id: "ev_ctx_only", supportLevel: "CONTEXT_ONLY" as const },
    ];
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_ctx_only"] }];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT");
    expect(codes).not.toContain("TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT");
  });

  it("§4.5 flags a claim referencing UNSUPPORTED evidence (kept adequately supported otherwise)", () => {
    const report = buildValidReport();
    report.evidence = [
      ...report.evidence,
      { ...report.evidence[0]!, id: "ev_unsupported", supportLevel: "UNSUPPORTED" as const },
    ];
    // keep a DIRECT so §4.2 still passes -> isolate §4.5
    report.strengths = [
      { ...report.strengths[0]!, evidenceIds: ["ev_first_home", "ev_unsupported"] },
    ];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED");
    expect(codes).not.toContain("TRUTH_4_2_STRENGTH_NEEDS_SUPPORT");
  });

  it("§4.6 flags a dangling evidenceId", () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_does_not_exist"] }];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
  });

  it("§4.8 blocks 3+ GEO opportunities reusing an identical evidence set", () => {
    const report = buildValidReport();
    const base = report.geoOpportunities[0]!;
    report.geoOpportunities = [
      { ...base, id: "geo_a", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_b", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_c", evidenceIds: ["ev_first_product"] },
    ];
    const codes = codesOf(evidenceGuard(report));
    expect(codes).toContain("TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET");
  });

  it("§4.8 allows two opportunities sharing an evidence set", () => {
    const report = buildValidReport();
    const base = report.geoOpportunities[0]!;
    report.geoOpportunities = [
      { ...base, id: "geo_a", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_b", evidenceIds: ["ev_first_product"] },
    ];
    expect(codesOf(evidenceGuard(report))).not.toContain(
      "TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET",
    );
  });
});
