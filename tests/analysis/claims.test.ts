import { describe, expect, it } from "vitest";
import {
  buildClaims,
  CandidateDemonstrationFix,
  ClaimsStageOutput,
} from "../../src/diagnosis/analysis";
import {
  buildClaimsPrompt,
  REPORT_CLAIMS_ZH_PROMPT_VERSION,
} from "../../src/diagnosis/analysis/stage-prompts";
import { DemonstrationFix } from "../../src/contracts";
import { emptyCoverage } from "../../src/contracts/claim-evidence";
import { buildSampleReport, SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import { presentReport } from "../../src/report/presentation";
import { chinesePublicReportGuard, publishGuard } from "../../src/report/validation";
import claimsFixture from "../providers/fixtures/claims.json";

const EVIDENCE = SAMPLE_DIAGNOSIS_REPORT.evidence;
const FROZEN_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

const CANDIDATE = {
  sourceIssueId: "iss_1",
  assetType: "FAQ_EXAMPLE",
  beforeStructure: "产品页仅罗列参数，未回答客户关心的交付与售后问题",
  afterStructure: "增加交付周期、售后响应与选型建议的结构化问答",
  whyBetter: "客户与 AI 可以直接定位决策信息，减少理解歧义",
  confirmationNeeded: "确认真实交付周期与售后口径",
  deliverable: "FAQ 内容结构模板与首批问题清单",
  evidenceIds: ["ev_first_product"],
} as const;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    ...claimsFixture,
    demonstrationFix: CANDIDATE,
    ...overrides,
  };
}

describe("CandidateDemonstrationFix schema", () => {
  it("accepts demonstrationFix=null through the strict stage output", () => {
    expect(ClaimsStageOutput.safeParse(validPayload({ demonstrationFix: null })).success).toBe(true);
  });

  it("accepts one complete Candidate", () => {
    expect(CandidateDemonstrationFix.safeParse(CANDIDATE).success).toBe(true);
    expect(ClaimsStageOutput.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects a partial Candidate and empty strings", () => {
    const partial: Record<string, unknown> = { ...CANDIDATE };
    delete partial.deliverable;
    expect(CandidateDemonstrationFix.safeParse(partial).success).toBe(false);
    expect(
      CandidateDemonstrationFix.safeParse({ ...CANDIDATE, whyBetter: " " }).success,
    ).toBe(false);
  });

  it("rejects model-authored currentIssue and disclaimer fields", () => {
    expect(
      CandidateDemonstrationFix.safeParse({ ...CANDIDATE, currentIssue: "模型编写的问题" }).success,
    ).toBe(false);
    expect(
      CandidateDemonstrationFix.safeParse({ ...CANDIDATE, disclaimer: "模型免责声明" }).success,
    ).toBe(false);
  });
});

describe("buildClaims", () => {
  it("builds structurally valid claims with deterministic ids", () => {
    const res = buildClaims(EVIDENCE, validPayload());
    if (!res.ok) throw new Error("expected ok");
    const { strengths, coreIssues, geoOpportunities, competitorGaps } = res.value;

    expect(strengths.map((s) => s.id)).toEqual(["str_1"]);
    expect(coreIssues.map((c) => c.id)).toEqual(["iss_1", "iss_2", "iss_3"]);
    expect(geoOpportunities.map((g) => g.id)).toEqual(["geo_1", "geo_2"]);
    expect(competitorGaps.map((g) => g.id)).toEqual(["gap_1"]);
  });

  it("filters unknown evidence ids but keeps a non-demo claim when one resolves", () => {
    const res = buildClaims(EVIDENCE, validPayload());
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.coreIssues[2]?.evidenceIds).toEqual(["ev_first_product"]);
  });

  it("drops any claim left with zero resolvable evidence", () => {
    const res = buildClaims(
      EVIDENCE,
      validPayload({
        strengths: [
          {
            statement: "主张",
            businessImpact: "影响",
            claimType: "DIAGNOSTIC_INFERENCE",
            evidenceIds: ["ev_nope"],
          },
        ],
      }),
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.strengths).toEqual([]);
  });

  it("derives currentIssue from the exact source issue and injects the frozen disclaimer", () => {
    const res = buildClaims(EVIDENCE, validPayload());
    if (!res.ok) throw new Error("expected ok");

    expect(res.value.demonstrationFix?.currentIssue).toBe(res.value.coreIssues[0]?.statement);
    expect(res.value.demonstrationFix?.currentIssue).toBe(claimsFixture.coreIssues[0]?.statement);
    expect(res.value.demonstrationFix?.disclaimer).toBe(FROZEN_DISCLAIMER);
    expect(res.value.demonstrationFix?.id).toBe("demo_1");
  });

  it("nulls a fix whose sourceIssueId does not resolve, without first-issue fallback", () => {
    const res = buildClaims(
      EVIDENCE,
      validPayload({ demonstrationFix: { ...CANDIDATE, sourceIssueId: "iss_99" } }),
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.coreIssues.length).toBeGreaterThan(0);
    expect(res.value.demonstrationFix).toBeNull();
  });

  it("preserves positional issue identity when the referenced issue was dropped pre-assembly", () => {
    const coreIssues = [
      { ...claimsFixture.coreIssues[0], evidenceIds: ["ev_missing"] },
      { ...claimsFixture.coreIssues[1], evidenceIds: ["ev_observed_news"] },
    ];
    const res = buildClaims(EVIDENCE, validPayload({ coreIssues }));
    if (!res.ok) throw new Error("expected ok");

    expect(res.value.coreIssues.map((issue) => issue.id)).toEqual(["iss_2"]);
    expect(res.value.demonstrationFix).toBeNull();
  });

  it("nulls a fix with no evidence relationship to its source issue, without evidence fallback", () => {
    const res = buildClaims(
      EVIDENCE,
      validPayload({
        demonstrationFix: { ...CANDIDATE, evidenceIds: ["ev_observed_news"] },
      }),
    );
    if (!res.ok) throw new Error("expected ok");
    expect(EVIDENCE.length).toBeGreaterThan(0);
    expect(res.value.demonstrationFix).toBeNull();
  });

  it("nulls a fix when any cited evidence id does not exist", () => {
    const res = buildClaims(
      EVIDENCE,
      validPayload({
        demonstrationFix: { ...CANDIDATE, evidenceIds: ["ev_first_product", "ev_nope"] },
      }),
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.demonstrationFix).toBeNull();
  });

  it("does not change opportunity lineage when demonstrationFix is invalid", () => {
    const geoOpportunities = [
      {
        ...claimsFixture.geoOpportunities[0],
        sourceIssueId: "iss_1",
        recommendedAction: "制作选型 FAQ 并建立问答结构",
        priorityReason: "对应采购阶段高意向问题",
      },
    ];
    const res = buildClaims(
      EVIDENCE,
      validPayload({
        geoOpportunities,
        demonstrationFix: { ...CANDIDATE, sourceIssueId: "iss_99" },
      }),
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.demonstrationFix).toBeNull();
    expect(res.value.geoOpportunities).toHaveLength(1);
    expect(res.value.geoOpportunities[0]?.sourceIssueId).toBe("iss_1");
    expect(res.value.geoOpportunities[0]?.recommendedAction).toContain("FAQ");
  });

  it("reports PROVIDER_SCHEMA_MISMATCH for old or malformed model output", () => {
    const oldShape = buildClaims(EVIDENCE, claimsFixture);
    expect(oldShape.ok).toBe(false);
    if (!oldShape.ok) expect(oldShape.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");

    const malformed = buildClaims(EVIDENCE, { strengths: "nope" });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
  });
});

describe("claims prompt and downstream guards", () => {
  it("uses REPORT_CLAIMS_ZH_PROMPT_V2_1 and requests only the strict Candidate fields", () => {
    const prompt = buildClaimsPrompt(
      { website: "https://example.com" },
      EVIDENCE,
      [],
    );
    expect(prompt.version).toBe(REPORT_CLAIMS_ZH_PROMPT_VERSION);
    expect(prompt.userPrompt).toContain("只能是null或一个字段完整的Candidate对象");
    expect(prompt.userPrompt).toContain("不得输出currentIssue");
    expect(prompt.userPrompt).toContain("不得输出disclaimer");
    expect(prompt.userPrompt).toContain("无完整证据支持时必须返回null");
  });

  it("does not loosen Publish Guard: unverified generated claims remain blocked", () => {
    const built = buildClaims(EVIDENCE, validPayload({ demonstrationFix: null }));
    if (!built.ok) throw new Error("expected ok");
    const report = buildSampleReport({
      strengths: built.value.strengths,
      coreIssues: [],
      geoOpportunities: [],
      competitorGaps: [],
      demonstrationFix: null,
    });
    const guard = publishGuard({ report, relations: [], coverage: emptyCoverage() });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.violations.map((v) => v.rule)).toContain("TRUTH_4_6_EVIDENCE_ID_NOT_FOUND");
    }
  });

  it("does not loosen Chinese Guard: English customer prose remains blocked", () => {
    const base = SAMPLE_DIAGNOSIS_REPORT.strengths[0]!;
    const report = buildSampleReport({
      strengths: [
        {
          ...base,
          statement: "This generated claim is entirely written as an English sentence.",
        },
      ],
    });
    const guard = chinesePublicReportGuard(presentReport(report));
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.violations.map((v) => v.rule)).toContain("ZH_FULL_ENGLISH_SENTENCE");
    }
  });
});
