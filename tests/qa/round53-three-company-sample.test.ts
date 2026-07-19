import { describe, expect, it } from "vitest";
import {
  ROUND53_SAMPLE_GATE_IDS,
  computeCompanySampleMetrics,
  evaluateThreeCompanySample,
  type Round53SampleGateId,
} from "../../scripts/round53-three-company-sample";
import { buildRound53ThreeCompanyMockFixture } from "../fixtures/round53-three-company-sample";

function gate(result: ReturnType<typeof evaluateThreeCompanySample>, id: Round53SampleGateId) {
  return result.gates.find((item) => item.id === id)!;
}

describe("Round-5.3 three-company sample harness", () => {
  it("records all required company metrics and passes the exact ten aggregate gates", () => {
    const result = evaluateThreeCompanySample(buildRound53ThreeCompanyMockFixture());
    expect(result.ready).toBe(true);
    expect(result.gates.map((item) => item.id)).toEqual(ROUND53_SAMPLE_GATE_IDS);
    expect(result.gates).toHaveLength(10);
    expect(result.gates.every((item) => item.passed)).toBe(true);

    const alpha = result.companyMetrics[0]!;
    expect(alpha).toMatchObject({
      evidenceCount: 3,
      chineseEvidenceRatio: 0.6667,
      tierDistribution: { A: 1, B: 1, C: 1 },
      issueCandidateCount: 1,
      issuePublishedCount: 1,
      opportunityCandidateCount: 1,
      opportunityPublishedCount: 1,
      demonstrationFixCandidate: true,
      demonstrationFixPublished: true,
      credibleDemonstrationFix: true,
      evidenceUtilization: 0.6667,
      claimPublicationRate: 0.75,
      opportunityYieldRate: 1,
      quickVisibleCharacters: 900,
      durationMs: 1_000,
      providerCalls: { bocha: 0, crawler: 0, deepseek: 0, viewSwitchAdditional: 0, analysisTotal: 0 },
      scoreCoverage: 1,
      measurementComposition: {
        measuredWeight: 0.4,
        estimatedWeight: 0.6,
        insufficientWeight: 0,
        providerFailedWeight: 0,
      },
      truthGuardPassed: true,
      publishedUnsupportedClaimCount: 0,
      hasCredibleOpportunity: true,
      sparseButTruthful: false,
    });
    expect(alpha.pruneReasons).toEqual({ INSUFFICIENT_INDEPENDENT_SUPPORT: 1 });
  });

  it("treats a zero-opportunity company as sparse-but-truthful, not a system failure", () => {
    const result = evaluateThreeCompanySample(buildRound53ThreeCompanyMockFixture());
    const gamma = result.companyMetrics[2]!;
    expect(gamma.opportunityCandidateCount).toBe(0);
    expect(gamma.opportunityPublishedCount).toBe(0);
    expect(gamma.opportunityYieldRate).toBeNull();
    expect(gamma.hasCredibleOpportunity).toBe(false);
    expect(gamma.sparseButTruthful).toBe(true);
    expect(gate(result, "OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY").passed).toBe(true);
    expect(gate(result, "SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE").passed).toBe(true);
    expect(result.ready).toBe(true);
  });

  it("accepts a bounded Deep needs-confirmation observation but rejects a partial-only Quick issue", () => {
    const deepFixtures = buildRound53ThreeCompanyMockFixture();
    deepFixtures[2]!.claims[1] = {
      ...deepFixtures[2]!.claims[1]!,
      publicationStatus: "DEEP_NEEDS_CONFIRMATION",
      support: [{ evidenceId: "gamma-ev-b", supportLevel: "PARTIAL_SUPPORT" }],
      needsConfirmationNotice: true,
      savedEvidenceScopeNotice: true,
      notDeterministicConclusion: true,
    };
    expect(computeCompanySampleMetrics(deepFixtures[2]!).truthGuardPassed).toBe(true);

    const quickFixtures = buildRound53ThreeCompanyMockFixture();
    quickFixtures[0]!.claims[1] = {
      ...quickFixtures[0]!.claims[1]!,
      support: [{ evidenceId: "alpha-ev-b", supportLevel: "PARTIAL_SUPPORT" }],
    };
    const result = evaluateThreeCompanySample(quickFixtures);
    expect(gate(result, "ALL_TRUTH_GUARDS_PASS").passed).toBe(false);
    expect(result.ready).toBe(false);
  });

  it.each([
    ["UNSUPPORTED", "NO_UNSUPPORTED_PUBLISHED_CLAIMS"],
    ["QUICK_OVERFLOW", "ALL_QUICK_WITHIN_1800"],
    ["VIEW_SWITCH_CALL", "ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS"],
    ["INVALID_LINEAGE", "ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID"],
    ["GENERIC_OPPORTUNITY", "NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES"],
  ] as const)("fails the %s aggregate violation", (scenario, expectedGate) => {
    const fixtures = buildRound53ThreeCompanyMockFixture();
    if (scenario === "UNSUPPORTED") fixtures[0]!.claims[0]!.verificationVerdict = "UNSUPPORTED";
    if (scenario === "QUICK_OVERFLOW") fixtures[0]!.quickVisibleCharacters = 1801;
    if (scenario === "VIEW_SWITCH_CALL") fixtures[0]!.providerCalls.viewSwitchAdditional = 1;
    if (scenario === "INVALID_LINEAGE") fixtures[0]!.opportunities[0]!.sourceIssueId = "missing-issue";
    if (scenario === "GENERIC_OPPORTUNITY") fixtures[0]!.opportunities[0]!.genericTemplate = true;
    const result = evaluateThreeCompanySample(fixtures);
    expect(gate(result, expectedGate).passed).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("requires two opportunity-producing companies and one credible demonstration fix", () => {
    const tooSparse = buildRound53ThreeCompanyMockFixture();
    tooSparse[1]!.opportunities = [];
    const sparseResult = evaluateThreeCompanySample(tooSparse);
    expect(gate(sparseResult, "AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY").passed).toBe(false);
    expect(sparseResult.ready).toBe(false);

    const noFix = buildRound53ThreeCompanyMockFixture();
    noFix[0]!.demonstrationFix = null;
    const noFixResult = evaluateThreeCompanySample(noFix);
    expect(gate(noFixResult, "AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX").passed).toBe(false);
    expect(noFixResult.ready).toBe(false);
  });

  it("rejects malformed sample cardinality and inconsistent measurement composition", () => {
    expect(() => evaluateThreeCompanySample(buildRound53ThreeCompanyMockFixture().slice(0, 2))).toThrow(
      "exactly 3 companies",
    );
    const fixtures = buildRound53ThreeCompanyMockFixture();
    fixtures[0]!.measurementComposition.estimatedWeight = 0.5;
    expect(() => evaluateThreeCompanySample(fixtures)).toThrow("measurementComposition must sum to 1");
  });
});
