import { describe, expect, it } from "vitest";
import type { AIVisibilityTest } from "../../src/contracts";
import {
  computeAIVisibility,
  INSUFFICIENT_CONFIDENCE_CAP,
  MIN_VALID_AI_TESTS,
} from "../../src/report/validation/ai-visibility-calculator";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

let seq = 0;
function test(overrides: Partial<AIVisibilityTest> = {}): AIVisibilityTest {
  seq += 1;
  const base: AIVisibilityTest = {
    id: `aiv_${seq}`,
    questionCategory: "BRAND_DIRECT",
    question: "示例问题?",
    status: "VALID",
    brandMentioned: false,
    accuracy: "NOT_MENTIONED",
    recommendationStrength: "NONE",
    modelUsed: "deepseek-v4-flash",
    testedAt: "2026-07-18T00:00:00.000Z",
    evidenceIds: [],
  };
  return { ...base, ...overrides };
}

describe("computeAIVisibility", () => {
  it("returns null score and confidence 0 with no tests", () => {
    const r = computeAIVisibility([]);
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.measurementStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.validTestCount).toBe(0);
  });

  it("returns null score and caps confidence at 0.40 below the minimum (2 VALID)", () => {
    const r = computeAIVisibility([test(), test()]);
    expect(r.validTestCount).toBe(2);
    expect(r.score).toBeNull();
    expect(r.confidence).toBeLessThanOrEqual(INSUFFICIENT_CONFIDENCE_CAP);
    expect(r.confidence).toBe(0.27); // 0.40 * 2/3 = 0.2667 -> 0.27
  });

  it("ignores non-VALID tests when counting toward the minimum", () => {
    const r = computeAIVisibility([
      test({ status: "VALID" }),
      test({ status: "INSUFFICIENT_EVIDENCE" }),
      test({ status: "PROVIDER_FAILED" }),
    ]);
    expect(r.validTestCount).toBe(1);
    expect(r.score).toBeNull();
  });

  it("mirrors the canonical sample (2 VALID tests -> null, INSUFFICIENT)", () => {
    // Documents the §8 seam: the fixture's aiVisibility.score=40 does NOT come
    // from this calculator, because only 2 of its tests are VALID.
    const r = computeAIVisibility(SAMPLE_DIAGNOSIS_REPORT.aiVisibilityTests);
    expect(r.validTestCount).toBe(2);
    expect(r.score).toBeNull();
    expect(r.measurementStatus).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("computes the §8 weighted score once 3 VALID tests exist", () => {
    const r = computeAIVisibility([
      test({ brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG" }),
      test({ brandMentioned: true, accuracy: "PARTIAL", recommendationStrength: "MODERATE" }),
      test({ brandMentioned: false, accuracy: "NOT_MENTIONED", recommendationStrength: "NONE" }),
    ]);
    // rate=2/3*100=66.67 ; acc=(100+60+0)/3=53.33 ; rec=(100+60+0)/3=53.33
    // 0.5*66.67 + 0.3*53.33 + 0.2*53.33 = 60
    expect(r.validTestCount).toBe(3);
    expect(r.score).toBe(60);
    expect(r.measurementStatus).toBe("MEASURED");
    expect(r.brandMentionCount).toBe(2);
    expect(r.confidence).toBe(0.5); // base confidence at exactly the minimum
    expect(r.rationale).toContain("品牌被提及 2/3");
  });

  it("hits a perfect 100 when every VALID signal is maximal", () => {
    const r = computeAIVisibility([
      test({ brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG" }),
      test({ brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG" }),
      test({ brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG" }),
    ]);
    expect(r.score).toBe(100);
  });

  it("treats null accuracy/recommendation on a VALID test as the zero bucket", () => {
    const r = computeAIVisibility([
      test({ brandMentioned: true, accuracy: null, recommendationStrength: null }),
      test({ brandMentioned: true, accuracy: null, recommendationStrength: null }),
      test({ brandMentioned: true, accuracy: null, recommendationStrength: null }),
    ]);
    // rate=100 -> 50 ; accuracy/rec both 0 -> score = 50
    expect(r.score).toBe(50);
  });

  it("ramps confidence with sample size but clamps at 0.90", () => {
    const many = Array.from({ length: 8 }, () =>
      test({ brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG" }),
    );
    const r = computeAIVisibility(many);
    expect(r.validTestCount).toBe(8);
    // 0.5 + 0.1*(8-3) = 1.0 -> clamped to 0.90
    expect(r.confidence).toBe(0.9);
  });

  it("unions evidenceIds across VALID tests only", () => {
    const r = computeAIVisibility([
      test({ status: "VALID", evidenceIds: ["ev_a", "ev_b"] }),
      test({ status: "VALID", evidenceIds: ["ev_b", "ev_c"] }),
      test({ status: "PROVIDER_FAILED", evidenceIds: ["ev_z"] }),
    ]);
    expect(r.evidenceIds.sort()).toEqual(["ev_a", "ev_b", "ev_c"]);
  });

  it("exposes MIN_VALID_AI_TESTS as 3 per §8", () => {
    expect(MIN_VALID_AI_TESTS).toBe(3);
  });
});
