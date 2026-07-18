import { describe, expect, it } from "vitest";
import { scoreNonAiDimensions } from "../../src/diagnosis/analysis";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import signalsFixture from "../providers/fixtures/dimension-signals.json";

const EVIDENCE = SAMPLE_DIAGNOSIS_REPORT.evidence;

describe("scoreNonAiDimensions — programmatic scoring", () => {
  it("computes deterministic scores from the fixed rubric, not from the LLM", () => {
    const res = scoreNonAiDimensions(EVIDENCE, signalsFixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.value;

    // companyClarity: 3 PRESENT + 1 ABSENT over 4 keys → round(75).
    expect(s.companyClarity.score).toBe(75);
    expect(s.companyClarity.measurementStatus).toBe("MEASURED"); // ev_first_home DIRECT

    // websiteCompleteness: (1+1+.5+.5+0)/5 → 60.
    expect(s.websiteCompleteness.score).toBe(60);
    expect(s.websiteCompleteness.measurementStatus).toBe("MEASURED");

    // customerQuestionCoverage: (.5+0+.5+0)/4 → 25, only CONTEXT_ONLY evidence → ESTIMATED.
    expect(s.customerQuestionCoverage.score).toBe(25);
    expect(s.customerQuestionCoverage.measurementStatus).toBe("ESTIMATED");

    // trustEvidence: (0+.5+.5+0)/4 → 25, CONTEXT_ONLY → ESTIMATED.
    expect(s.trustEvidence.score).toBe(25);
    expect(s.trustEvidence.measurementStatus).toBe("ESTIMATED");
  });

  it("keeps every dimension score within 0..100 and confidence within 0..1", () => {
    const res = scoreNonAiDimensions(EVIDENCE, signalsFixture);
    if (!res.ok) throw new Error("expected ok");
    for (const dim of Object.values(res.value)) {
      if (dim.score !== null) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }
      expect(dim.confidence).toBeGreaterThanOrEqual(0);
      expect(dim.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("returns null score + INSUFFICIENT_EVIDENCE when no evidence resolves (no array[0] backfill)", () => {
    const orphan = {
      ...signalsFixture,
      companyClarity: { ...signalsFixture.companyClarity, evidenceIds: ["ev_missing"] },
    };
    const res = scoreNonAiDimensions(EVIDENCE, orphan);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.companyClarity.score).toBeNull();
    expect(res.value.companyClarity.measurementStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(res.value.companyClarity.confidence).toBe(0);
    expect(res.value.companyClarity.evidenceIds).toEqual([]);
  });

  it("scores an all-ABSENT rubric as 0, distinct from null", () => {
    const absent = {
      ...signalsFixture,
      companyClarity: {
        criteria: [
          { key: "brandIdentityClear", rating: "ABSENT" },
          { key: "offeringClear", rating: "ABSENT" },
          { key: "targetCustomerClear", rating: "ABSENT" },
          { key: "valuePropositionClear", rating: "ABSENT" },
        ],
        evidenceIds: ["ev_first_home"],
      },
    };
    const res = scoreNonAiDimensions(EVIDENCE, absent);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.companyClarity.score).toBe(0);
    expect(res.value.companyClarity.measurementStatus).toBe("MEASURED");
  });

  it("treats an omitted rubric criterion as ABSENT (score determined by the rubric, not the payload length)", () => {
    const partial = {
      ...signalsFixture,
      companyClarity: {
        criteria: [{ key: "brandIdentityClear", rating: "PRESENT" }],
        evidenceIds: ["ev_first_home"],
      },
    };
    const res = scoreNonAiDimensions(EVIDENCE, partial);
    if (!res.ok) throw new Error("expected ok");
    // Only 1 of 4 canonical keys PRESENT → 25.
    expect(res.value.companyClarity.score).toBe(25);
  });

  it("reports PROVIDER_SCHEMA_MISMATCH when a dimension block is missing", () => {
    const res = scoreNonAiDimensions(EVIDENCE, { companyClarity: signalsFixture.companyClarity });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
  });
});
