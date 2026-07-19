import { describe, expect, it } from "vitest";
import { evidenceGuard } from "../../src/report/validation/evidence-guard";
import type { ClaimEvidenceRelation } from "../../src/contracts/claim-evidence";
import { emptyCoverage } from "../../src/contracts/claim-evidence";
import { buildValidReport, codesOf, coverageOf, rel, verifiedRelations } from "./support";

describe("evidenceGuard (relation-based, ROUND-3)", () => {
  it("passes the shared fixture when verified relations back every claim", async () => {
    const report = buildValidReport();
    report.coreIssues = [];
    report.geoOpportunities = [];
    const coverage = coverageOf(report);
    const relations = await verifiedRelations(report, coverage);
    expect(evidenceGuard({ report, relations, coverage })).toEqual({ ok: true });
  });

  it("§4.1/coverage — a negative core issue WITHOUT a measurement boundary is rejected", async () => {
    const report = buildValidReport();
    // Same relations, but no coverage → bounded-negative claims cannot publish.
    const relations = await verifiedRelations(report, coverageOf(report));
    const codes = codesOf(
      evidenceGuard({ report, relations, coverage: emptyCoverage() }),
    );
    expect(codes).toContain("TRUTH_4_1_CORE_ISSUE_NEEDS_DIRECT_SUPPORT");
  });

  it("a bounded negative core issue WITH DIRECT and coverage passes", () => {
    const report = buildValidReport();
    report.strengths = [];
    report.geoOpportunities = [];
    report.coreIssues = [{
      ...report.coreIssues[0]!,
      statement: "本次检查的公开页面中未发现完整采购说明",
      evidenceIds: ["ev_first_product"],
    }];
    const coverage = coverageOf(report);
    const relations: ClaimEvidenceRelation[] = [
      rel({
        claimId: report.coreIssues[0]!.id,
        claimKind: "coreIssue",
        evidenceId: "ev_first_product",
        supportLevel: "DIRECT_SUPPORT",
        basis: "MEASUREMENT_BOUNDARY",
      }),
    ];
    const res = evidenceGuard({ report, relations, coverage });
    expect(res.ok).toBe(true);
  });

  it("§4.2 — a strength with a single PARTIAL relation is under-supported", () => {
    const report = buildValidReport();
    report.strengths = [{ ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home"] }];
    const relations: ClaimEvidenceRelation[] = [
      rel({
        claimId: "str_1",
        claimKind: "strength",
        evidenceId: "ev_first_home",
        supportLevel: "PARTIAL_SUPPORT",
        basis: "CONTENT_MATCH",
      }),
    ];
    const codes = codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_2_STRENGTH_NEEDS_SUPPORT");
  });

  it("§4.2 — a strength backed by two independent-domain PARTIAL relations passes", () => {
    const report = buildValidReport();
    report.evidence = report.evidence.map((item) =>
      item.id === "ev_first_about"
        ? {
            ...item,
            sourceType: "OBSERVED_WEB_EVIDENCE" as const,
            sourceDomain: "independent-source.example.net",
            normalizedDomain: "independent-source.example.net",
            url: "https://independent-source.example.net/about",
          }
        : item,
    );
    report.strengths = [
      { ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home", "ev_first_about"] },
    ];
    const relations: ClaimEvidenceRelation[] = [
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home", supportLevel: "PARTIAL_SUPPORT", basis: "CONTENT_MATCH" }),
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_about", supportLevel: "PARTIAL_SUPPORT", basis: "CONTENT_MATCH" }),
    ];
    // Only assert the strength itself is satisfied (ignore other claims' relations).
    report.coreIssues = [];
    report.geoOpportunities = [];
    expect(evidenceGuard({ report, relations, coverage: coverageOf(report) })).toEqual({ ok: true });
  });

  it("§4.2 — two PARTIAL relation rows from one root domain are not independent", () => {
    const report = buildValidReport();
    report.strengths = [
      { ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home", "ev_first_about"] },
    ];
    report.coreIssues = [];
    report.geoOpportunities = [];
    const relations: ClaimEvidenceRelation[] = [
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home", supportLevel: "PARTIAL_SUPPORT", basis: "CONTENT_MATCH" }),
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_about", supportLevel: "PARTIAL_SUPPORT", basis: "CONTENT_MATCH" }),
    ];
    expect(codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }))).toContain(
      "TRUTH_4_2_STRENGTH_NEEDS_SUPPORT",
    );
  });

  it("§4.4 — a positive strength backed only by CONTEXT_ONLY relations", () => {
    const report = buildValidReport();
    report.strengths = [{ ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home"] }];
    report.coreIssues = [];
    report.geoOpportunities = [];
    const relations: ClaimEvidenceRelation[] = [
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home", supportLevel: "CONTEXT_ONLY", basis: "CONTENT_MATCH" }),
    ];
    const codes = codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_4_CONTEXT_ONLY_INSUFFICIENT");
    expect(codes).not.toContain("TRUTH_4_2_STRENGTH_NEEDS_SUPPORT");
  });

  it("§4.5 — a relation judged UNSUPPORTED blocks the claim", () => {
    const report = buildValidReport();
    report.strengths = [{ ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home"] }];
    report.coreIssues = [];
    report.geoOpportunities = [];
    const relations: ClaimEvidenceRelation[] = [
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home", supportLevel: "DIRECT_SUPPORT", basis: "CONTENT_MATCH" }),
      rel({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home", supportLevel: "UNSUPPORTED", basis: "CONTENT_MATCH" }),
    ];
    const codes = codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_5_UNSUPPORTED_EVIDENCE_USED");
  });

  it("§4.6 — a dangling candidate evidenceId is flagged", async () => {
    const report = buildValidReport();
    report.coreIssues = [{ ...report.coreIssues[0]!, evidenceIds: ["ev_does_not_exist"] }];
    const relations = await verifiedRelations(report);
    const codes = codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
  });

  it("§4.6 — a cited candidate with no verification relation is flagged", () => {
    const report = buildValidReport();
    report.strengths = [{ ...report.strengths[0]!, id: "str_1", evidenceIds: ["ev_first_home"] }];
    report.coreIssues = [];
    report.geoOpportunities = [];
    // No relation supplied for str_1's candidate.
    const codes = codesOf(evidenceGuard({ report, relations: [], coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
  });

  // Test 9 — 3+ GEO opportunities reusing the identical RELATION set is blocked.
  it("§4.8 — blocks 3+ GEO opportunities reusing an identical relation set", () => {
    const report = buildValidReport();
    const base = report.geoOpportunities[0]!;
    report.geoOpportunities = [
      { ...base, id: "geo_a", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_b", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_c", evidenceIds: ["ev_first_product"] },
    ];
    report.coreIssues = [];
    report.strengths = [];
    const relations: ClaimEvidenceRelation[] = ["geo_a", "geo_b", "geo_c"].map((id) =>
      rel({ claimId: id, claimKind: "geoOpportunity", evidenceId: "ev_first_product", supportLevel: "PARTIAL_SUPPORT", basis: "MEASUREMENT_BOUNDARY" }),
    );
    const codes = codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }));
    expect(codes).toContain("TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET");
  });

  it("§4.8 — allows two opportunities sharing a relation set", () => {
    const report = buildValidReport();
    const base = report.geoOpportunities[0]!;
    report.geoOpportunities = [
      { ...base, id: "geo_a", evidenceIds: ["ev_first_product"] },
      { ...base, id: "geo_b", evidenceIds: ["ev_first_product"] },
    ];
    const relations: ClaimEvidenceRelation[] = ["geo_a", "geo_b"].map((id) =>
      rel({ claimId: id, claimKind: "geoOpportunity", evidenceId: "ev_first_product", supportLevel: "PARTIAL_SUPPORT", basis: "MEASUREMENT_BOUNDARY" }),
    );
    expect(codesOf(evidenceGuard({ report, relations, coverage: coverageOf(report) }))).not.toContain(
      "TRUTH_4_8_DUPLICATE_OPPORTUNITY_EVIDENCE_SET",
    );
  });
});
