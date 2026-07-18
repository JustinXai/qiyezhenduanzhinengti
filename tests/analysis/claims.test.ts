import { describe, expect, it } from "vitest";
import { buildClaims } from "../../src/diagnosis/analysis";
import { DemonstrationFix } from "../../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import claimsFixture from "../providers/fixtures/claims.json";

const EVIDENCE = SAMPLE_DIAGNOSIS_REPORT.evidence;
const FROZEN_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

describe("buildClaims", () => {
  it("builds structurally valid claims with deterministic ids", () => {
    const res = buildClaims(EVIDENCE, claimsFixture);
    if (!res.ok) throw new Error("expected ok");
    const { strengths, coreIssues, geoOpportunities, competitorGaps } = res.value;

    expect(strengths.map((s) => s.id)).toEqual(["str_1"]);
    expect(coreIssues.map((c) => c.id)).toEqual(["iss_1", "iss_2", "iss_3"]);
    expect(geoOpportunities.map((g) => g.id)).toEqual(["geo_1", "geo_2"]);
    expect(competitorGaps.map((g) => g.id)).toEqual(["gap_1"]);
    expect(coreIssues[0]?.fixDirection).toBeTruthy();
    expect(geoOpportunities[0]?.customerQuestion).toBeTruthy();
  });

  it("filters unknown evidence ids but keeps the claim when at least one resolves (no array[0] backfill)", () => {
    const res = buildClaims(EVIDENCE, claimsFixture);
    if (!res.ok) throw new Error("expected ok");
    // iss_3 fixture references ["ev_first_product", "ev_does_not_exist"].
    const iss3 = res.value.coreIssues[2];
    expect(iss3?.evidenceIds).toEqual(["ev_first_product"]);
  });

  it("drops any claim left with zero resolvable evidence", () => {
    const orphaned = {
      ...claimsFixture,
      strengths: [
        { statement: "s", businessImpact: "b", claimType: "DIAGNOSTIC_INFERENCE", evidenceIds: ["ev_nope"] },
      ],
    };
    const res = buildClaims(EVIDENCE, orphaned);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.strengths).toEqual([]);
  });

  it("stamps the frozen demonstrationFix disclaimer and ignores the model's disclaimer field", () => {
    const res = buildClaims(EVIDENCE, claimsFixture);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.demonstrationFix).not.toBeNull();
    expect(res.value.demonstrationFix?.disclaimer).toBe(FROZEN_DISCLAIMER);
    expect(res.value.demonstrationFix?.id).toBe("demo_1");
  });

  it("nulls the demonstrationFix when its evidence does not resolve (never fabricates the module)", () => {
    const noEvidenceDemo = {
      ...claimsFixture,
      demonstrationFix: { ...claimsFixture.demonstrationFix, evidenceIds: ["ev_nope"] },
    };
    const res = buildClaims(EVIDENCE, noEvidenceDemo);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.demonstrationFix).toBeNull();
  });

  it("reports PROVIDER_SCHEMA_MISMATCH for malformed claim output", () => {
    const res = buildClaims(EVIDENCE, { strengths: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
  });
});
