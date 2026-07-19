import { describe, expect, it } from "vitest";
import {
  auditAnalysisPrune,
  auditPublicationPrune,
} from "../../src/runtime/prune-audit";

const context = {
  id: "prune_1",
  diagnosisId: "diag_1",
  reportId: "report_1",
  revisionId: null,
  stageRunId: "stage_claims_1",
  createdAt: new Date("2026-07-19T12:00:00.000Z"),
};

const policyDecisionBase = {
  policyVersion: "claim-publication-policy.v1" as const,
  polarity: "NEGATIVE_MISSING" as const,
  unsupportedCount: 0,
  independentPartialSourceKeys: [],
};

describe("unified prune audit mapping", () => {
  it("maps the shared publication-policy decision without recalculating thresholds", () => {
    expect(
      auditPublicationPrune({
        context,
        candidate: {
          claimKind: "geoOpportunity",
          candidateRef: "geo_1",
          sourceIssueId: "iss_1",
          evidenceIds: ["ev_1", "ev_2"],
        },
        decision: {
          ...policyDecisionBase,
          outcome: "PRUNE",
          rule: "SCOPE_LIMITATION_MISSING",
          directCount: 1,
          partialCount: 2,
          contextCount: 3,
          independentPartialSourceCount: 1,
          coverageStatus: "SCOPE_LIMITATION_MISSING",
        },
      }),
    ).toMatchObject({
      reasonCode: "MISSING_COVERAGE_PREFIX",
      guardRule: "SCOPE_LIMITATION_MISSING",
      directCount: 1,
      partialCount: 2,
      contextCount: 3,
      independentSupportSourceCount: 1,
    });
  });

  it("keeps no coverage distinct from missing bounded-copy prefix", () => {
    const common = {
      context,
      candidate: {
        claimKind: "geoOpportunity",
        candidateRef: "geo_1",
        sourceIssueId: "iss_1",
        evidenceIds: ["ev_1"],
      },
    };
    const noCoverage = auditPublicationPrune({
      ...common,
      decision: {
        ...policyDecisionBase,
        outcome: "PRUNE",
        rule: "COVERAGE_NOT_ESTABLISHED",
        directCount: 1,
        partialCount: 0,
        contextCount: 0,
        independentPartialSourceCount: 0,
        coverageStatus: "NOT_ESTABLISHED",
      },
    });
    const noPrefix = auditPublicationPrune({
      ...common,
      decision: {
        ...policyDecisionBase,
        outcome: "PRUNE",
        rule: "SCOPE_LIMITATION_MISSING",
        directCount: 1,
        partialCount: 0,
        contextCount: 0,
        independentPartialSourceCount: 0,
        coverageStatus: "SCOPE_LIMITATION_MISSING",
      },
    });

    expect(noCoverage.reasonCode).toBe("NO_MEASUREMENT_COVERAGE");
    expect(noPrefix.reasonCode).toBe("MISSING_COVERAGE_PREFIX");
  });

  it("records pre-verification generation rejects with zero semantic counts", () => {
    expect(
      auditAnalysisPrune({
        context,
        candidate: {
          claimKind: "geoOpportunity",
          candidateRef: "geo_candidate_1",
          sourceIssueId: "iss_1",
          reasonCode: "BANNED_OR_OVERPROMISING_COPY",
          guardRule: "OPPORTUNITY_BANNED_COPY",
          evidenceIds: ["ev_1"],
        },
      }),
    ).toMatchObject({
      reasonCode: "BANNED_OR_OVERPROMISING_COPY",
      directCount: 0,
      partialCount: 0,
      contextCount: 0,
      independentSupportSourceCount: 0,
    });
  });

  it("refuses to mislabel hard blocks or published candidates as pruning", () => {
    const candidate = {
      claimKind: "coreIssue",
      candidateRef: "iss_1",
      sourceIssueId: null,
      evidenceIds: ["ev_1"],
    };
    expect(() =>
      auditPublicationPrune({
        context,
        candidate,
        decision: {
          ...policyDecisionBase,
          outcome: "BLOCK",
          rule: "UNSUPPORTED_EVIDENCE",
          directCount: 0,
          partialCount: 0,
          contextCount: 0,
          independentPartialSourceCount: 0,
          coverageStatus: "NOT_REQUIRED",
        },
      }),
    ).toThrow("PRUNE_DECISION_REQUIRES_POLICY_PRUNE_OUTCOME");
  });
});
