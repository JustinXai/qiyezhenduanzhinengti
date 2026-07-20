import { describe, expect, it } from "vitest";
import {
  buildCustomerEvidenceRequestPackV1,
  planEvidenceClosureV1,
  type EvidenceClosureCandidateV1,
} from "../../src/diagnosis/evidence/evidence-closure-planner-v1";

const candidates: EvidenceClosureCandidateV1[] = [
  {
    candidateRef: "geo_1",
    claimKind: "geoOpportunity",
    publicationStatus: "PRUNED",
    reasonCode: "INSUFFICIENT_INDEPENDENT_SUPPORT",
    evidenceIds: ["ev_1", "ev_2"],
    directCount: 0,
    partialCount: 0,
    contextCount: 2,
    independentSupportSourceCount: 0,
  },
  {
    candidateRef: "iss_1",
    claimKind: "coreIssue",
    publicationStatus: "PRUNED",
    reasonCode: "INSUFFICIENT_DIRECT_SUPPORT",
    evidenceIds: ["ev_3"],
    directCount: 0,
    partialCount: 1,
    contextCount: 0,
    independentSupportSourceCount: 1,
  },
  {
    candidateRef: "gap_1",
    claimKind: "competitorGap",
    publicationStatus: "PRUNED",
    reasonCode: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    evidenceIds: ["ev_4"],
    directCount: 0,
    partialCount: 1,
    contextCount: 0,
    independentSupportSourceCount: 0,
  },
  {
    candidateRef: "str_2",
    claimKind: "strength",
    publicationStatus: "PRUNED",
    reasonCode: "MISSING_COVERAGE_PREFIX",
    evidenceIds: ["ev_5"],
    directCount: 0,
    partialCount: 0,
    contextCount: 1,
    independentSupportSourceCount: 0,
  },
];

describe("EvidenceClosurePlannerV1", () => {
  it("selects at most three highest-value candidates and two slots each", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_1",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates,
    });
    expect(plan.selectedCandidateRefs).toEqual(["geo_1", "iss_1", "gap_1"]);
    expect(plan.slots).toHaveLength(6);
    expect(plan.slots.filter((slot) => slot.candidateRef === "geo_1")).toHaveLength(2);
    expect(plan.nextActions.every((action) => !action.executesAutomatically)).toBe(true);
    expect(plan.nextActions.every((action) => !action.mayPublishClaim)).toBe(true);
    expect(plan.nextActions.every((action) => !action.mayUpgradeSupport)).toBe(true);
  });

  it("never plans around a system failure as if it were a business gap", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_2",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates: [
        {
          ...candidates[0]!,
          candidateRef: "geo_system",
          reasonCode: "SYSTEM_FAILURE_NOT_BUSINESS_ISSUE",
        },
      ],
    });
    expect(plan.selectedCandidateRefs).toEqual([]);
    expect(plan.noPlanReason).toBe("NO_ELIGIBLE_CANDIDATES");
  });

  it("marks non-closable lineage defects for permanent pruning", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_3",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates: [
        {
          ...candidates[1]!,
          candidateRef: "demo_1",
          claimKind: "demonstrationFix",
          reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        },
      ],
    });
    expect(plan.nextActions[0]!.action).toBe("PRUNE_PERMANENTLY");
    expect(plan.slots[0]!.cannotBeClosedReason).toContain("sourceIssueId");
  });

  it("does not let an unclosable candidate displace a closable candidate at the budget edge", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_4",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates: [
        ...candidates.slice(0, 3),
        {
          ...candidates[1]!,
          candidateRef: "demo_1",
          claimKind: "demonstrationFix",
          reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        },
      ],
    });
    expect(plan.selectedCandidateRefs).toEqual(["geo_1", "iss_1", "gap_1"]);
  });

  it("builds no more than five second-stage requests with publication approval", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_1",
      companyKey: "sample",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates,
    });
    const pack = buildCustomerEvidenceRequestPackV1({ plan });
    expect(pack.requests.length).toBeLessThanOrEqual(5);
    expect(pack.visibleInFreeQuickReport).toBe(false);
    expect(pack.featureEnabled).toBe(false);
    expect(pack.requests.every((item) => item.requiresApprovalBeforePublication)).toBe(true);
    expect(pack.requests.every((item) => item.prohibitedContentReminder.includes("API Key"))).toBe(
      true,
    );
  });

  it("returns an explicit empty plan for a company with zero candidates", () => {
    const plan = planEvidenceClosureV1({
      diagnosisId: "diag_empty",
      companyKey: "empty",
      generatedAt: "2026-07-20T00:00:00.000Z",
      candidates: [],
    });
    expect(plan.noPlanReason).toBe("NO_PRUNED_CANDIDATES");
    expect(plan.slots).toEqual([]);
    expect(plan.nextActions).toEqual([]);
  });
});
