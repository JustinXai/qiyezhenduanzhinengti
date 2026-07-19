import { describe, expect, it } from "vitest";
import { deriveCoverage, emptyCoverage } from "../../src/contracts/claim-evidence";
import { buildClaims } from "../../src/diagnosis/analysis/claims";
import {
  APPROVED_NEGATIVE_OPPORTUNITY_PREFIX,
  OPPORTUNITY_BANNED_PHRASES,
} from "../../src/diagnosis/analysis/opportunity-copy-policy";
import { PublishableGeoOpportunityStageItem } from "../../src/diagnosis/analysis/stage-schemas";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

const evidence = SAMPLE_DIAGNOSIS_REPORT.evidence;
const evidenceId = evidence[0]!.id;
const establishedCoverage = deriveCoverage({
  evidence,
  firstPartyDomains: [evidence[0]!.sourceDomain],
  executedQueries: ["site query"],
});

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    statement: "围绕客户选型问题建立结构化问答",
    businessImpact: "帮助客户理解适用场景与选择条件",
    claimType: "DIAGNOSTIC_INFERENCE",
    customerQuestion: "应如何选择合适方案？",
    contentGap: `${APPROVED_NEGATIVE_OPPORTUNITY_PREFIX}系统性的选型指南`,
    sourceIssueId: "iss_1",
    recommendedAction: "围绕场景、条件与验证材料建立选型问答页",
    priorityReason: "该问题直接关联采购决策阶段的信息核验",
    evidenceIds: [evidenceId],
    ...overrides,
  };
}

function payload(candidate: Record<string, unknown>) {
  return {
    strengths: [],
    coreIssues: [
      {
        statement: "客户选型信息仍需补充",
        businessImpact: "客户需要额外咨询确认适用条件",
        claimType: "DIAGNOSTIC_INFERENCE",
        fixDirection: "补充结构化选型说明",
        evidenceIds: [evidenceId],
      },
    ],
    geoOpportunities: [candidate],
    competitorGaps: [],
    demonstrationFix: null,
  };
}

describe("negative opportunity copy policy", () => {
  it("distinguishes no measurement coverage from an established scope missing its prefix", () => {
    const raw = opportunity({ contentGap: "官网缺少系统性的选型指南" });
    const withoutCoverage = buildClaims(evidence, payload(raw), emptyCoverage());
    const withoutPrefix = buildClaims(evidence, payload(raw), establishedCoverage);
    if (!withoutCoverage.ok || !withoutPrefix.ok) throw new Error("expected claims output");

    expect(withoutCoverage.value.dropped[0]).toMatchObject({
      reasonCode: "NO_MEASUREMENT_COVERAGE",
      guardRule: "COVERAGE_NOT_ESTABLISHED",
      coverageStatus: "NOT_ESTABLISHED",
    });
    expect(withoutPrefix.value.dropped[0]).toMatchObject({
      reasonCode: "MISSING_COVERAGE_PREFIX",
      guardRule: "SCOPE_LIMITATION_MISSING",
      coverageStatus: "SCOPE_LIMITATION_MISSING",
    });
  });

  it("publishes bounded copy and never mutates the source stage output", () => {
    const stageOutput = payload(opportunity());
    const before = structuredClone(stageOutput);
    const result = buildClaims(evidence, stageOutput, establishedCoverage);
    if (!result.ok) throw new Error("expected claims output");

    expect(result.value.geoOpportunities).toHaveLength(1);
    expect(result.value.dropped).toHaveLength(0);
    expect(stageOutput).toEqual(before);
  });

  it.each(OPPORTUNITY_BANNED_PHRASES)("audits banned generated copy: %s", (phrase) => {
    const result = buildClaims(
      evidence,
      payload(opportunity({ businessImpact: `该动作将${phrase}` })),
      establishedCoverage,
    );
    if (!result.ok) throw new Error("expected claims output");

    expect(result.value.geoOpportunities).toEqual([]);
    expect(result.value.dropped[0]?.reasonCode).toBe(
      phrase === "竞品已经积累"
        ? "UNVERIFIED_COMPETITOR_ASSERTION"
        : "BANNED_OR_OVERPROMISING_COPY",
    );
  });

  it("keeps the outer stage parseable while the candidate publication schema rejects bad copy", () => {
    expect(PublishableGeoOpportunityStageItem.safeParse(opportunity()).success).toBe(true);
    expect(
      PublishableGeoOpportunityStageItem.safeParse(
        opportunity({ contentGap: "官网缺少系统性的选型指南" }),
      ).success,
    ).toBe(false);
    expect(
      PublishableGeoOpportunityStageItem.safeParse(
        opportunity({ businessImpact: "必然增长" }),
      ).success,
    ).toBe(false);
  });
});
