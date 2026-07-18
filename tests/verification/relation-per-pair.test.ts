// Section 5 — support is a property of the (Claim, Evidence) RELATION, not a
// global property of the Evidence: the SAME evidence can support claim A and only
// contextualise claim B, decided per-pair by the verifier.
import { describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import {
  createDeterministicVerifier,
  verifyReport,
} from "../../src/diagnosis/verification";

describe("ClaimEvidenceRelation is per-(claim, evidence)", () => {
  it("the same evidence yields different support for two different claims", async () => {
    const report = buildSampleReport();
    const evidence = report.evidence.find((e) => e.id === "ev_first_home")!;
    // Two strengths cite the SAME evidence; one overlaps its content strongly, the
    // other not at all.
    report.strengths = [
      { ...report.strengths[0]!, id: "str_match", statement: evidence.snippet, businessImpact: evidence.snippet, evidenceIds: ["ev_first_home"] },
      { ...report.strengths[0]!, id: "str_nomatch", statement: "一段与该证据毫不相关的占位表述", businessImpact: "无关", evidenceIds: ["ev_first_home"] },
    ];
    report.coreIssues = [];
    report.geoOpportunities = [];

    const coverage = deriveCoverage({
      evidence: report.evidence,
      firstPartyDomains: ["example-equip.com"],
      executedQueries: ["q1"],
    });
    const { relations } = await verifyReport({
      report,
      coverage,
      strategy: createDeterministicVerifier(),
    });

    const forMatch = relations.find((r) => r.claimId === "str_match" && r.evidenceId === "ev_first_home");
    const forNoMatch = relations.find((r) => r.claimId === "str_nomatch" && r.evidenceId === "ev_first_home");
    expect(forMatch).toBeDefined();
    expect(forNoMatch).toBeDefined();
    // Same evidence id, different verified support level.
    expect(forMatch!.evidenceId).toBe(forNoMatch!.evidenceId);
    expect(forMatch!.supportLevel).not.toBe(forNoMatch!.supportLevel);
    expect(forMatch!.supportLevel).toBe("DIRECT_SUPPORT");
    expect(forNoMatch!.supportLevel).not.toBe("DIRECT_SUPPORT");
  });
});
