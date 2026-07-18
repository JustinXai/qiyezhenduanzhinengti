import { describe, expect, it } from "vitest";
import {
  assembleReport,
  buildReportFromStageOutputs,
  type BuildReportInput,
} from "../../src/report/generation";
import { DiagnosisReport, REPORT_CONTRACT_VERSION, SCORE_CONTRACT_VERSION } from "../../src/contracts";
import { DemonstrationFix } from "../../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import companyProfile from "../providers/fixtures/company-profile.json";
import dimensionSignals from "../providers/fixtures/dimension-signals.json";
import aiVisibility from "../providers/fixtures/ai-visibility.json";
import claims from "../providers/fixtures/claims.json";

const EVIDENCE = SAMPLE_DIAGNOSIS_REPORT.evidence;

const BASE_INPUT: BuildReportInput = {
  identity: {
    diagnosisId: "diag_gen_0001",
    publicToken: "tok_gen_0001",
    generatedAt: "2026-07-18T00:00:00.000Z",
  },
  profileInput: { website: "https://example-equip.com" },
  aiVisibilityInput: {
    brandName: "示例智能装备",
    modelUsed: "deepseek-v4-flash",
    testedAt: "2026-07-18T00:00:00.000Z",
  },
  evidence: EVIDENCE,
  stageOutputs: { companyProfile, dimensionSignals, aiVisibility, claims },
};

describe("buildReportFromStageOutputs → assembleReport → DiagnosisReport.parse", () => {
  it("assembles a canonical report that passes DiagnosisReport.parse", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Explicit re-parse per the assembler contract (must not throw).
    expect(() => DiagnosisReport.parse(res.report)).not.toThrow();

    const r = res.report;
    expect(r.reportContractVersion).toBe(REPORT_CONTRACT_VERSION);
    expect(r.scoreContractVersion).toBe(SCORE_CONTRACT_VERSION);
    expect(r.companyProfile.brandName).toBe("示例智能装备");
    expect(r.companyProfile.website).toBe("https://example-equip.com");
  });

  it("is shape-compatible with the shared SAMPLE_DIAGNOSIS_REPORT anchor", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    if (!res.ok) throw new Error("expected ok");
    const r = res.report;
    // Same top-level key set as the frozen canonical anchor.
    expect(Object.keys(r).sort()).toEqual(Object.keys(SAMPLE_DIAGNOSIS_REPORT).sort());
    expect(Object.keys(r.scores).sort()).toEqual(Object.keys(SAMPLE_DIAGNOSIS_REPORT.scores).sort());
  });

  it("carries the programmatic scores and the seam-computed overall (coverage 1.0)", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    if (!res.ok) throw new Error("expected ok");
    const s = res.report.scores;
    expect(s.companyClarity.score).toBe(75);
    expect(s.websiteCompleteness.score).toBe(60);
    expect(s.customerQuestionCoverage.score).toBe(25);
    expect(s.trustEvidence.score).toBe(25);
    expect(s.aiVisibility.score).toBe(51);
    // 0.2*75 + 0.2*60 + 0.25*25 + 0.2*25 + 0.15*51 = 45.9
    expect(s.overallScore).toBe(45.9);
    expect(s.scoreCoverage).toBe(1);
  });

  it("carries the expected claim / test / evidence counts", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    if (!res.ok) throw new Error("expected ok");
    const r = res.report;
    expect(r.strengths).toHaveLength(1);
    expect(r.coreIssues).toHaveLength(3);
    expect(r.geoOpportunities).toHaveLength(2);
    expect(r.competitorGaps).toHaveLength(1);
    expect(r.aiVisibilityTests).toHaveLength(4);
    expect(r.aiVisibilityTests.filter((t) => t.status === "VALID")).toHaveLength(3);
    expect(r.evidence).toHaveLength(5);
    expect(r.demonstrationFix?.disclaimer).toBe(DemonstrationFix.shape.disclaimer.value);
  });

  it("keeps referential integrity: every referenced evidence id exists (PRODUCT_TRUTH_RULES §4.6)", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    if (!res.ok) throw new Error("expected ok");
    const r = res.report;
    const known = new Set(r.evidence.map((e) => e.id));
    const referenced = [
      ...r.strengths.flatMap((x) => x.evidenceIds),
      ...r.coreIssues.flatMap((x) => x.evidenceIds),
      ...r.geoOpportunities.flatMap((x) => x.evidenceIds),
      ...r.competitorGaps.flatMap((x) => x.evidenceIds),
      ...r.aiVisibilityTests.flatMap((x) => x.evidenceIds),
      ...Object.values(r.scores).flatMap((v) =>
        typeof v === "object" && v !== null && "evidenceIds" in v ? v.evidenceIds : [],
      ),
      ...(r.demonstrationFix?.evidenceIds ?? []),
    ];
    for (const id of referenced) expect(known.has(id)).toBe(true);
  });

  it("surfaces the originating stage when a stage payload is malformed", () => {
    const res = buildReportFromStageOutputs({
      ...BASE_INPUT,
      stageOutputs: { ...BASE_INPUT.stageOutputs, dimensionSignals: { companyClarity: {} } },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.stage).toBe("dimension_signals");
    if ("error" in res) expect(res.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
  });

  it("assembleReport reports Zod issues rather than throwing on an invalid draft", () => {
    const res = buildReportFromStageOutputs(BASE_INPUT);
    if (!res.ok) throw new Error("expected ok");
    // Corrupt a required field and re-assemble directly.
    const broken = assembleReport({
      identity: BASE_INPUT.identity,
      companyProfile: { ...res.report.companyProfile, brandName: 123 as unknown as string },
      nonAiScores: {
        companyClarity: res.report.scores.companyClarity,
        websiteCompleteness: res.report.scores.websiteCompleteness,
        customerQuestionCoverage: res.report.scores.customerQuestionCoverage,
        trustEvidence: res.report.scores.trustEvidence,
      },
      aiVisibility: { tests: res.report.aiVisibilityTests, dimension: res.report.scores.aiVisibility },
      claims: {
        strengths: res.report.strengths,
        coreIssues: res.report.coreIssues,
        geoOpportunities: res.report.geoOpportunities,
        competitorGaps: res.report.competitorGaps,
        demonstrationFix: res.report.demonstrationFix,
      },
      evidence: res.report.evidence,
    });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.issues.join("\n")).toContain("companyProfile.brandName");
  });
});
