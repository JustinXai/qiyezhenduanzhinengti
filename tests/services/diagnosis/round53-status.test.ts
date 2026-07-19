import { describe, expect, it } from "vitest";
import {
  classifyProductYield,
  classifyRound53Canary,
  classifyTechnicalCanary,
  type TechnicalCanaryChecks,
} from "../../../src/services/diagnosis/round53-status";

const ALL_TECHNICAL_PASS: TechnicalCanaryChecks = {
  completeChain: true,
  providerBudget: true,
  stateMachine: true,
  schemas: true,
  claimEvidenceTruth: true,
  scoring: true,
  chineseReport: true,
  security: true,
  reportViews: true,
  pageExperience: true,
  publicApi: true,
  auditPersistence: true,
};

describe("Round-5.3 canary status contract", () => {
  it("keeps technical PASS when Opportunity is zero but sparse yield is truthful", () => {
    const decision = classifyRound53Canary({
      technicalChecks: ALL_TECHNICAL_PASS,
      productYieldFacts: {
        publishedIssueCount: 3,
        publishedOpportunityCount: 0,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: false,
        zeroOpportunityRootCause: "VALID_SPARSE_RESULT",
      },
    });
    expect(decision.technical).toEqual({ status: "PASS", failedChecks: [] });
    expect(decision.productYield).toEqual({
      status: "SPARSE_BUT_TRUTHFUL",
      reason: "VALID_SPARSE_RESULT",
    });
  });

  it("classifies model-returned zero candidates as insufficient sample, not technical failure", () => {
    expect(
      classifyProductYield({
        publishedIssueCount: 2,
        publishedOpportunityCount: 0,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: false,
        zeroOpportunityRootCause: "MODEL_RETURNED_ZERO_CANDIDATES",
      }),
    ).toEqual({
      status: "INSUFFICIENT_SAMPLE",
      reason: "MODEL_RETURNED_ZERO_CANDIDATES",
    });
  });

  it("uses confirmed implementation evidence rather than count to mark a blocker", () => {
    expect(
      classifyProductYield({
        publishedIssueCount: 2,
        publishedOpportunityCount: 0,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: true,
        zeroOpportunityRootCause: "BUILDER_OR_GUARD_BUG",
      }).status,
    ).toBe("BLOCKED_BY_IMPLEMENTATION_BUG");
  });

  it("maps confirmed insufficient support to sparse-but-truthful", () => {
    expect(
      classifyProductYield({
        publishedIssueCount: 0,
        publishedOpportunityCount: 0,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: false,
        zeroOpportunityRootCause: "INSUFFICIENT_SUPPORT",
      }),
    ).toEqual({
      status: "SPARSE_BUT_TRUTHFUL",
      reason: "INSUFFICIENT_SUPPORT",
    });
  });

  it("rejects guessing the cause from a zero final count", () => {
    expect(() =>
      classifyProductYield({
        publishedIssueCount: 3,
        publishedOpportunityCount: 0,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: false,
        zeroOpportunityRootCause: null,
      }),
    ).toThrow("ZERO_OPPORTUNITY_ROOT_CAUSE_REQUIRED");
  });

  it("reports technical failures independently and never adds product-yield checks", () => {
    const decision = classifyTechnicalCanary({
      ...ALL_TECHNICAL_PASS,
      schemas: false,
      publicApi: false,
    });
    expect(decision).toEqual({ status: "FAIL", failedChecks: ["schemas", "publicApi"] });
  });

  it("marks published, valid-lineage yield healthy", () => {
    expect(
      classifyProductYield({
        publishedIssueCount: 1,
        publishedOpportunityCount: 1,
        publishedDemonstrationFixCount: 0,
        allPublishedOpportunitiesHaveValidLineage: true,
        implementationBugConfirmed: false,
        zeroOpportunityRootCause: null,
      }).status,
    ).toBe("HEALTHY");
  });
});
