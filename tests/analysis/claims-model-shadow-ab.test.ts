import { describe, expect, it } from "vitest";
import {
  CLAIMS_MODEL_POLICY_DEFAULT,
  CLAIMS_SHADOW_MAX_TOKENS,
  CLAIMS_SHADOW_TEMPERATURE,
  assertShadowBudget,
  buildShadowPlan,
  claimsModelPolicy,
  evaluateShadowOutput,
  type FrozenClaimsInput,
} from "../../scripts/claims-model-shadow-ab";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import claimsFixture from "../providers/fixtures/claims.json";

function frozenInput(): FrozenClaimsInput {
  return {
    company: "qiaqia",
    databasePath: "private.sqlite",
    diagnosisId: SAMPLE_DIAGNOSIS_REPORT.diagnosisId,
    diagnosisInput: {
      website: SAMPLE_DIAGNOSIS_REPORT.companyProfile.website,
      brandName: SAMPLE_DIAGNOSIS_REPORT.companyProfile.brandName,
    },
    evidence: [...SAMPLE_DIAGNOSIS_REPORT.evidence],
    canonical: SAMPLE_DIAGNOSIS_REPORT,
    relations: [],
    bochaCallCount: 1,
    frozenHashes: {
      databaseFile: "db",
      diagnosisInput: "input",
      evidenceSnapshot: "evidence",
      profileOutput: "profile",
      scoreInput: "score",
      aiVisibilityInput: "ai",
      canonical: "canonical",
    },
  };
}

describe("Claims Flash/Pro shadow A/B budget", () => {
  it("keeps FLASH as the formal default and only accepts frozen policy values", () => {
    expect(CLAIMS_MODEL_POLICY_DEFAULT).toBe("FLASH");
    expect(claimsModelPolicy({})).toBe("FLASH");
    expect(claimsModelPolicy({ CLAIMS_MODEL_POLICY: "PRO" })).toBe("PRO");
    expect(() => claimsModelPolicy({ CLAIMS_MODEL_POLICY: "pro" })).toThrow();
  });

  it("fixes exactly six serial calls with three per model, zero retries and parameter parity", () => {
    const plan = buildShadowPlan();
    expect(() => assertShadowBudget(plan)).not.toThrow();
    expect(plan.map((item) => `${item.company}:${item.model}`)).toEqual([
      "qiaqia:deepseek-v4-flash",
      "qiaqia:deepseek-v4-pro",
      "iflytek:deepseek-v4-flash",
      "iflytek:deepseek-v4-pro",
      "heli:deepseek-v4-flash",
      "heli:deepseek-v4-pro",
    ]);
    expect(plan.every((item) => item.retries === 0)).toBe(true);
    expect(new Set(plan.map((item) => item.maxTokens))).toEqual(new Set([CLAIMS_SHADOW_MAX_TOKENS]));
    expect(new Set(plan.map((item) => item.temperature))).toEqual(new Set([CLAIMS_SHADOW_TEMPERATURE]));
    expect(new Set(plan.map((item) => item.thinking))).toEqual(new Set(["disabled"]));
  });

  it("fails closed when the call budget or parameter parity is changed", () => {
    expect(() => assertShadowBudget(buildShadowPlan().slice(0, 5))).toThrow(
      "SHADOW_PLAN_ORDER_MISMATCH",
    );
    const changed = buildShadowPlan();
    changed[1] = { ...changed[1]!, maxTokens: 4095 as 4096 };
    expect(() => assertShadowBudget(changed)).toThrow("SHADOW_PARAMETER_PARITY_MISMATCH");
  });
});

describe("Claims shadow metrics", () => {
  it("records usage and latency while applying the unchanged builder and publication policy", () => {
    const metrics = evaluateShadowOutput(
      frozenInput(),
      "deepseek-v4-flash",
      claimsFixture,
      321,
      { rawContent: JSON.stringify(claimsFixture), inputTokens: 1000, outputTokens: 300 },
    );
    expect(metrics.schemaPass).toBe(true);
    expect(metrics.latencyMs).toBe(321);
    expect(metrics.inputTokens).toBe(1000);
    expect(metrics.outputTokens).toBe(300);
    expect(metrics.candidateIssueCount).toBe(claimsFixture.coreIssues.length);
    // No persisted verifier relations are invented for the shadow output.
    expect(metrics.candidatesPassingSameTruthPolicy).toBe(0);
    expect(metrics.publishableIssueCount).toBe(0);
    expect(metrics.publishableOpportunityCount).toBe(0);
  });

  it("counts invalid evidence and source-issue references without repairing them", () => {
    const payload = {
      ...claimsFixture,
      strengths: [{ ...claimsFixture.strengths[0]!, evidenceIds: ["ev_missing"] }],
      geoOpportunities: [
        {
          ...claimsFixture.geoOpportunities[0]!,
          sourceIssueId: "iss_99",
          contentGap: "缺少采购问答",
        },
      ],
      demonstrationFix: null,
    };
    const metrics = evaluateShadowOutput(
      frozenInput(),
      "deepseek-v4-pro",
      payload,
      10,
      { rawContent: JSON.stringify(payload), inputTokens: 10, outputTokens: 20 },
    );
    expect(metrics.schemaPass).toBe(true);
    expect(metrics.invalidEvidenceReferenceCount).toBeGreaterThanOrEqual(1);
    expect(metrics.invalidSourceIssueReferenceCount).toBe(1);
    expect(metrics.missingCoveragePrefixCount).toBe(1);
  });

  it("returns a schema failure without candidate fabrication", () => {
    const metrics = evaluateShadowOutput(
      frozenInput(),
      "deepseek-v4-pro",
      { coreIssues: "invalid" },
      20,
      { rawContent: "{}", inputTokens: 5, outputTokens: 1 },
    );
    expect(metrics).toMatchObject({
      schemaPass: false,
      candidateIssueCount: 0,
      candidatesPassingSameTruthPolicy: 0,
      inputTokens: 5,
      outputTokens: 1,
    });
  });

  it("never reuses a positional historical relation when the Shadow claim text changed", () => {
    const frozen = frozenInput();
    const evidenceId = frozen.evidence[0]!.id;
    frozen.relations = [{
      claimId: "iss_1",
      claimKind: "coreIssue",
      evidenceId,
      supportLevel: "DIRECT_SUPPORT",
      confidence: 1,
      justification: "historical verifier result for the frozen text only",
      basis: "CONTENT_MATCH",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "historical.v1",
    }];
    const payload = {
      strengths: [],
      coreIssues: [{
        statement: "同一个位置编号上的全新语义主张",
        businessImpact: "不得继承旧关系",
        claimType: "DIAGNOSTIC_INFERENCE",
        fixDirection: "需要重新验证",
        evidenceIds: [evidenceId],
      }],
      geoOpportunities: [],
      competitorGaps: [],
      demonstrationFix: null,
    };
    const metrics = evaluateShadowOutput(
      frozen,
      "deepseek-v4-pro",
      payload,
      10,
      { rawContent: JSON.stringify(payload), inputTokens: 10, outputTokens: 20 },
    );
    expect(metrics.semanticRelationReuseCount).toBe(0);
    expect(metrics.truthPolicyUnverifiedCandidateCount).toBe(1);
    expect(metrics.publishableIssueCount).toBe(0);
    expect(metrics.candidatesPassingSameTruthPolicy).toBe(0);
  });
});
