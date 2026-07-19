import { describe, expect, it } from "vitest";
import type { ClaimEvidenceRelation } from "../../src/contracts/claim-evidence";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { applyClaimPublicationPolicyToReport } from "../../src/runtime/claim-publication";

function setup() {
  const base = buildSampleReport();
  const issue = {
    ...base.coreIssues[0]!,
    statement: "本次已检查的公开页面和搜索结果中未发现完整的采购选型说明",
  };
  const opportunity = {
    ...base.geoOpportunities[0]!,
    sourceIssueId: issue.id,
    contentGap: "本次已检查的公开页面和搜索结果中未发现系统性的选型指南",
  };
  const report = buildSampleReport({
    strengths: [],
    coreIssues: [issue],
    geoOpportunities: [opportunity],
    competitorGaps: [],
    demonstrationFix: base.demonstrationFix
      ? { ...base.demonstrationFix, currentIssue: issue.statement }
      : null,
  });
  const coverage = deriveCoverage({
    evidence: report.evidence,
    firstPartyDomains: report.evidence
      .filter((item) => item.sourceType === "FIRST_PARTY_EVIDENCE")
      .map((item) => item.sourceDomain),
    executedQueries: ["采购选型"],
  });
  const relation = (
    claimId: string,
    claimKind: ClaimEvidenceRelation["claimKind"],
    supportLevel: ClaimEvidenceRelation["supportLevel"],
  ): ClaimEvidenceRelation => ({
    claimId,
    claimKind,
    evidenceId:
      claimKind === "coreIssue" ? issue.evidenceIds[0]! : opportunity.evidenceIds[0]!,
    supportLevel,
    confidence: 0.9,
    justification: "test",
    basis: supportLevel === "PARTIAL_SUPPORT" ? "MEASUREMENT_BOUNDARY" : "CONTENT_MATCH",
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "test.v1",
  });
  return { report, coverage, issue, opportunity, relation };
}

describe("shared report publication projection", () => {
  it("retains DIRECT issue/opportunity without mutating the candidate report", () => {
    const { report, coverage, issue, opportunity, relation } = setup();
    const before = structuredClone(report);
    const result = applyClaimPublicationPolicyToReport({
      report,
      coverage,
      relations: [
        relation(issue.id, "coreIssue", "DIRECT_SUPPORT"),
        relation(opportunity.id, "geoOpportunity", "DIRECT_SUPPORT"),
      ],
    });

    expect(result.report.coreIssues.map((item) => item.id)).toEqual([issue.id]);
    expect(result.report.geoOpportunities.map((item) => item.id)).toEqual([opportunity.id]);
    expect(result.prunes).toEqual([]);
    expect(report).toEqual(before);
  });

  it("uses policy for issue support then audits orphan opportunity and demonstration fix lineage", () => {
    const { report, coverage, issue, opportunity, relation } = setup();
    const result = applyClaimPublicationPolicyToReport({
      report,
      coverage,
      relations: [
        relation(issue.id, "coreIssue", "PARTIAL_SUPPORT"),
        relation(opportunity.id, "geoOpportunity", "DIRECT_SUPPORT"),
      ],
      preserveNegativeIssuesAsUnresolved: true,
    });

    expect(result.report.coreIssues).toEqual([]);
    expect(result.report.geoOpportunities).toEqual([]);
    expect(result.report.demonstrationFix).toBeNull();
    expect(result.prunes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "POLICY",
          candidate: expect.objectContaining({ candidateRef: issue.id }),
          decision: expect.objectContaining({ rule: "INSUFFICIENT_DIRECT_SUPPORT" }),
        }),
        expect.objectContaining({
          type: "STRUCTURAL",
          candidate: expect.objectContaining({ candidateRef: opportunity.id }),
          reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        }),
        expect.objectContaining({
          type: "STRUCTURAL",
          candidate: expect.objectContaining({ claimKind: "demonstrationFix" }),
          reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        }),
      ]),
    );
    expect(result.deepNeedsConfirmation[0]).toContain("仅限本次保存的公开证据范围");
  });

  it("prunes an observed-only competitor assertion with an exact structural audit reason", () => {
    const { report, coverage } = setup();
    const base = buildSampleReport();
    report.coreIssues = [];
    report.geoOpportunities = [];
    report.demonstrationFix = null;
    report.competitorGaps = [
      { ...base.competitorGaps[0]!, evidenceIds: ["ev_observed_news"] },
    ];
    const result = applyClaimPublicationPolicyToReport({
      report,
      coverage,
      relations: [
        {
          claimId: report.competitorGaps[0]!.id,
          claimKind: "competitorGap",
          evidenceId: "ev_observed_news",
          supportLevel: "DIRECT_SUPPORT",
          confidence: 0.9,
          justification: "test",
          basis: "CONTENT_MATCH",
          verifierMode: "MOCK_DETERMINISTIC",
          verifierVersion: "test.v1",
        },
      ],
    });

    expect(result.report.competitorGaps).toEqual([]);
    expect(result.prunes).toContainEqual(
      expect.objectContaining({
        type: "STRUCTURAL",
        reasonCode: "UNVERIFIED_COMPETITOR_ASSERTION",
        guardRule: "TRUTH_4_9_COMPETITOR_ASSERTION_NEEDS_CONFIRMED_EVIDENCE",
      }),
    );
  });

  it("retains a competitor assertion with a verified official-source relation", () => {
    const { report, coverage } = setup();
    const base = buildSampleReport();
    report.coreIssues = [];
    report.geoOpportunities = [];
    report.demonstrationFix = null;
    const gap = base.competitorGaps[0]!;
    report.competitorGaps = [gap];
    const result = applyClaimPublicationPolicyToReport({
      report,
      coverage,
      relations: [
        {
          claimId: gap.id,
          claimKind: "competitorGap",
          evidenceId: gap.evidenceIds[0]!,
          supportLevel: "PARTIAL_SUPPORT",
          confidence: 0.7,
          justification: "test",
          basis: "CONTENT_MATCH",
          verifierMode: "MOCK_DETERMINISTIC",
          verifierVersion: "test.v1",
        },
      ],
    });

    expect(result.report.competitorGaps).toEqual([gap]);
    expect(result.prunes).toEqual([]);
  });
});
