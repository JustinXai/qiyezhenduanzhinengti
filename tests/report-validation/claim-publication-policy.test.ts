import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/contracts";
import type { ClaimEvidenceRelation, EvidenceCoverage } from "../../src/contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../src/contracts/independent-support-source";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  ClaimPublicationPolicy,
  evaluateClaimPublication,
  publicationSourceContextFromReport,
  type ClaimPublicationCandidate,
  type ClaimPublicationPolicyInput,
} from "../../src/report/validation/claim-publication-policy";
import { coverageOf } from "./support";

const template = buildSampleReport().evidence[0]!;

function ev(
  id: string,
  sourceType: EvidenceItem["sourceType"],
  domain: string,
): EvidenceItem {
  return {
    ...template,
    id,
    sourceType,
    sourceDomain: domain,
    normalizedDomain: domain,
    url: `https://${domain}/${id}`,
  };
}

function relation(
  claim: ClaimPublicationCandidate,
  evidenceId: string,
  supportLevel: ClaimEvidenceRelation["supportLevel"],
  basis: ClaimEvidenceRelation["basis"] = "CONTENT_MATCH",
): ClaimEvidenceRelation {
  return {
    claimId: claim.id,
    claimKind: claim.kind,
    evidenceId,
    supportLevel,
    confidence: 0.7,
    justification: "test",
    basis,
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "test.v1",
  };
}

const context: ClaimPublicationSourceContext = {
  companyId: "company_1",
  firstPartyDomains: ["company.com", "company.cn"],
  competitorEntities: [
    { competitorEntityId: "competitor_1", domains: ["competitor.com"] },
    { competitorEntityId: "competitor_2", domains: ["rival.example"] },
  ],
};

function coverage(overrides: Partial<EvidenceCoverage> = {}): EvidenceCoverage {
  return { ...coverageOf(buildSampleReport()), boundaryEstablished: true, ...overrides };
}

function candidate(
  kind: ClaimPublicationCandidate["kind"],
  evidenceIds: string[],
  text = "企业公开展示了可验证的产品能力",
): ClaimPublicationCandidate {
  return {
    id: kind === "coreIssue" ? "iss_1" : kind === "strength" ? "str_1" : "geo_1",
    kind,
    text,
    negativeScopeText: text,
    evidenceIds,
  };
}

function input(
  claim: ClaimPublicationCandidate,
  evidence: EvidenceItem[],
  relations: ClaimEvidenceRelation[],
  overrides: Partial<ClaimPublicationPolicyInput> = {},
): ClaimPublicationPolicyInput {
  return { claim, evidence, relations, coverage: coverage(), sourceContext: context, ...overrides };
}

describe("ClaimPublicationPolicy", () => {
  it("is a single versioned policy object", () => {
    expect(ClaimPublicationPolicy.version).toBe("claim-publication-policy.v1");
  });

  it("prunes a Quick/deterministic Issue with only PARTIAL support", () => {
    const claim = candidate("coreIssue", ["a"]);
    const result = evaluateClaimPublication(
      input(claim, [ev("a", "OBSERVED_WEB_EVIDENCE", "one.example")], [relation(claim, "a", "PARTIAL_SUPPORT")]),
    );
    expect(result).toMatchObject({ outcome: "PRUNE", rule: "INSUFFICIENT_DIRECT_SUPPORT" });
  });

  it("publishes a Quick/deterministic Issue with DIRECT support", () => {
    const claim = candidate("coreIssue", ["a"]);
    expect(
      evaluateClaimPublication(
        input(claim, [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")], [relation(claim, "a", "DIRECT_SUPPORT")]),
      ).outcome,
    ).toBe("PUBLISH");
  });

  it("publishes a bounded negative Issue with DIRECT support", () => {
    const claim = candidate(
      "coreIssue",
      ["a"],
      "本次检查的公开页面中未发现完整采购说明",
    );
    expect(
      evaluateClaimPublication(
        input(
          claim,
          [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")],
          [relation(claim, "a", "DIRECT_SUPPORT", "MEASUREMENT_BOUNDARY")],
        ),
      ),
    ).toMatchObject({ outcome: "PUBLISH", rule: "PUBLISHED_DIRECT_SUPPORT" });
  });

  it("prunes a bounded negative Issue with only PARTIAL support", () => {
    const claim = candidate(
      "coreIssue",
      ["a"],
      "本次检查的公开页面中未发现完整采购说明",
    );
    expect(
      evaluateClaimPublication(
        input(
          claim,
          [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")],
          [relation(claim, "a", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY")],
        ),
      ),
    ).toMatchObject({ outcome: "PRUNE", rule: "INSUFFICIENT_DIRECT_SUPPORT" });
  });

  it("publishes a Strength with one DIRECT relation", () => {
    const claim = candidate("strength", ["a"]);
    expect(
      evaluateClaimPublication(
        input(claim, [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")], [relation(claim, "a", "DIRECT_SUPPORT")]),
      ).rule,
    ).toBe("PUBLISHED_DIRECT_SUPPORT");
  });

  it("publishes an Opportunity with one DIRECT relation", () => {
    const claim = candidate("geoOpportunity", ["a"]);
    expect(
      evaluateClaimPublication(
        input(claim, [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")], [relation(claim, "a", "DIRECT_SUPPORT")]),
      ).outcome,
    ).toBe("PUBLISH");
  });

  it("publishes an Opportunity with PARTIAL support from two independent observed roots", () => {
    const claim = candidate("geoOpportunity", ["a", "b"]);
    const evidence = [
      ev("a", "OBSERVED_WEB_EVIDENCE", "one.example"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "two.example"),
    ];
    const result = evaluateClaimPublication(
      input(claim, evidence, [relation(claim, "a", "PARTIAL_SUPPORT"), relation(claim, "b", "PARTIAL_SUPPORT")]),
    );
    expect(result).toMatchObject({
      outcome: "PUBLISH",
      rule: "PUBLISHED_INDEPENDENT_PARTIAL_SUPPORT",
      independentPartialSourceCount: 2,
    });
  });

  it("prunes two PARTIAL relations from the same observed root", () => {
    const claim = candidate("geoOpportunity", ["a", "b"]);
    const evidence = [
      ev("a", "OBSERVED_WEB_EVIDENCE", "news.example.com"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "reviews.example.com"),
    ];
    expect(
      evaluateClaimPublication(
        input(claim, evidence, [relation(claim, "a", "PARTIAL_SUPPORT"), relation(claim, "b", "PARTIAL_SUPPORT")]),
      ),
    ).toMatchObject({ outcome: "PRUNE", rule: "INSUFFICIENT_INDEPENDENT_SUPPORT", independentPartialSourceCount: 1 });
  });

  it("counts confirmed .com and .cn first-party Evidence as one entity source", () => {
    const claim = candidate("strength", ["a", "b"]);
    const evidence = [
      ev("a", "FIRST_PARTY_EVIDENCE", "company.com"),
      ev("b", "FIRST_PARTY_EVIDENCE", "company.cn"),
    ];
    const result = evaluateClaimPublication(
      input(claim, evidence, [relation(claim, "a", "PARTIAL_SUPPORT"), relation(claim, "b", "PARTIAL_SUPPORT")]),
    );
    expect(result).toMatchObject({ outcome: "PRUNE", independentPartialSourceCount: 1 });
  });

  it("does not count CONTEXT_ONLY toward publication", () => {
    const claim = candidate("strength", ["a", "b"]);
    const evidence = [
      ev("a", "OBSERVED_WEB_EVIDENCE", "one.example"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "two.example"),
    ];
    expect(
      evaluateClaimPublication(
        input(claim, evidence, [relation(claim, "a", "CONTEXT_ONLY"), relation(claim, "b", "CONTEXT_ONLY")]),
      ).rule,
    ).toBe("CONTEXT_ONLY_INSUFFICIENT");
  });

  it("hard-blocks any UNSUPPORTED relation", () => {
    const claim = candidate("strength", ["a"]);
    expect(
      evaluateClaimPublication(
        input(claim, [ev("a", "OBSERVED_WEB_EVIDENCE", "one.example")], [relation(claim, "a", "UNSUPPORTED")]),
      ),
    ).toMatchObject({ outcome: "BLOCK", rule: "UNSUPPORTED_EVIDENCE" });
  });

  it("distinguishes absent Coverage from a missing public scope limitation", () => {
    const claim = candidate("geoOpportunity", ["a", "b"], "企业内容缺少采购说明");
    const evidence = [
      ev("a", "FIRST_PARTY_EVIDENCE", "company.com"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "one.example"),
    ];
    const relations = [
      relation(claim, "a", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
      relation(claim, "b", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
    ];
    expect(
      evaluateClaimPublication(input(claim, evidence, relations, { coverage: coverage({ boundaryEstablished: false }) })),
    ).toMatchObject({ rule: "COVERAGE_NOT_ESTABLISHED", coverageStatus: "NOT_ESTABLISHED" });
    expect(evaluateClaimPublication(input(claim, evidence, relations))).toMatchObject({
      rule: "SCOPE_LIMITATION_MISSING",
      coverageStatus: "SCOPE_LIMITATION_MISSING",
    });
  });

  it("publishes a bounded standard negative Opportunity with independent boundary support", () => {
    const claim = candidate(
      "geoOpportunity",
      ["a", "b"],
      "本次已检查的公开页面和搜索结果中未发现完整采购说明，建议补充问答",
    );
    const evidence = [
      ev("a", "FIRST_PARTY_EVIDENCE", "company.com"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "one.example"),
    ];
    const result = evaluateClaimPublication(
      input(claim, evidence, [
        relation(claim, "a", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
        relation(claim, "b", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
      ]),
    );
    expect(result).toMatchObject({ outcome: "PUBLISH", coverageStatus: "ESTABLISHED_AND_BOUNDED" });
  });

  it("requires the approved prefix at the start of the exact negative field", () => {
    const claim = {
      ...candidate(
        "geoOpportunity",
        ["a"],
        "本次已检查的公开页面和搜索结果中未发现采购说明，官网内容缺少采购说明",
      ),
      negativeScopeText: "官网内容缺少采购说明",
    };
    const evidence = [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")];
    expect(
      evaluateClaimPublication(
        input(claim, evidence, [relation(claim, "a", "DIRECT_SUPPORT")]),
      ),
    ).toMatchObject({ outcome: "PRUNE", rule: "SCOPE_LIMITATION_MISSING" });

    const prefixedLater = {
      ...claim,
      negativeScopeText:
        "官网内容缺少采购说明；本次已检查的公开页面和搜索结果中未发现采购说明",
    };
    expect(
      evaluateClaimPublication(
        input(prefixedLater, evidence, [relation(prefixedLater, "a", "DIRECT_SUPPORT")]),
      ).rule,
    ).toBe("SCOPE_LIMITATION_MISSING");
  });

  it("requires the frozen scope phrase in FROZEN_EVIDENCE mode", () => {
    const claim = candidate(
      "geoOpportunity",
      ["a", "b"],
      "本次已检查的公开页面和搜索结果中未发现完整采购说明",
    );
    const evidence = [
      ev("a", "FIRST_PARTY_EVIDENCE", "company.com"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "one.example"),
    ];
    expect(
      evaluateClaimPublication(
        input(
          claim,
          evidence,
          [
            relation(claim, "a", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
            relation(claim, "b", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
          ],
          { coverageScope: "FROZEN_EVIDENCE" },
        ),
      ).rule,
    ).toBe("SCOPE_LIMITATION_MISSING");
  });

  it("publishes a correctly bounded frozen negative Opportunity", () => {
    const claim = candidate(
      "geoOpportunity",
      ["a", "b"],
      "在本次保存的公开证据中，暂未发现完整采购说明，建议补充问答",
    );
    const evidence = [
      ev("a", "FIRST_PARTY_EVIDENCE", "company.com"),
      ev("b", "OBSERVED_WEB_EVIDENCE", "one.example"),
    ];
    expect(
      evaluateClaimPublication(
        input(
          claim,
          evidence,
          [
            relation(claim, "a", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
            relation(claim, "b", "PARTIAL_SUPPORT", "MEASUREMENT_BOUNDARY"),
          ],
          { coverageScope: "FROZEN_EVIDENCE" },
        ),
      ).outcome,
    ).toBe("PUBLISH");
  });

  it("publishes a bounded negative Opportunity with DIRECT support", () => {
    const claim = candidate(
      "geoOpportunity",
      ["a"],
      "本次已检查的公开页面和搜索结果中未发现采购说明",
    );
    expect(
      evaluateClaimPublication(
        input(claim, [ev("a", "FIRST_PARTY_EVIDENCE", "company.com")], [relation(claim, "a", "DIRECT_SUPPORT")]),
      ),
    ).toMatchObject({ outcome: "PUBLISH", rule: "PUBLISHED_DIRECT_SUPPORT" });
  });

  it("default-denies a missing Evidence id", () => {
    const claim = candidate("strength", ["missing"]);
    expect(evaluateClaimPublication(input(claim, [], []))).toMatchObject({
      outcome: "BLOCK",
      rule: "EVIDENCE_REFERENCE_INVALID",
    });
  });

  it("default-denies a candidate Evidence without a verified relation", () => {
    const claim = candidate("strength", ["a"]);
    expect(
      evaluateClaimPublication(input(claim, [ev("a", "OBSERVED_WEB_EVIDENCE", "one.example")], [])),
    ).toMatchObject({ outcome: "BLOCK", rule: "EVIDENCE_REFERENCE_INVALID" });
  });

  it("collapses PARTIAL competitor pages belonging to one resolved entity", () => {
    const claim = candidate("strength", ["a", "b"]);
    const evidence = [
      ev("a", "COMPETITOR_WEB_EVIDENCE", "competitor.com"),
      ev("b", "COMPETITOR_WEB_EVIDENCE", "support.competitor.com"),
    ];
    const result = evaluateClaimPublication(
      input(claim, evidence, [relation(claim, "a", "PARTIAL_SUPPORT"), relation(claim, "b", "PARTIAL_SUPPORT")]),
    );
    expect(result).toMatchObject({ outcome: "PRUNE", independentPartialSourceCount: 1 });
  });

  it("counts PARTIAL pages from two resolved competitor entities independently", () => {
    const claim = candidate("strength", ["a", "b"]);
    const evidence = [
      ev("a", "COMPETITOR_WEB_EVIDENCE", "competitor.com"),
      ev("b", "COMPETITOR_WEB_EVIDENCE", "rival.example"),
    ];
    expect(
      evaluateClaimPublication(
        input(claim, evidence, [relation(claim, "a", "PARTIAL_SUPPORT"), relation(claim, "b", "PARTIAL_SUPPORT")]),
      ).outcome,
    ).toBe("PUBLISH");
  });

  it("provides a stable safe context for legacy report callers", () => {
    const report = buildSampleReport();
    const result = publicationSourceContextFromReport(report, coverageOf(report));
    expect(result).toEqual({
      companyId: report.diagnosisId,
      firstPartyDomains: ["example-equip.com"],
      competitorEntities: [],
    });
  });
});
