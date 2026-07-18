import { describe, expect, it } from "vitest";
import {
  buildAiVisibility,
  buildAiVisibilityTests,
  computeAiVisibilityDimension,
  type AiVisibilityInput,
} from "../../src/diagnosis/analysis";
import type { AIVisibilityTest } from "../../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";
import aiVisibilityFixture from "../providers/fixtures/ai-visibility.json";

const EVIDENCE = SAMPLE_DIAGNOSIS_REPORT.evidence;
const INPUT: AiVisibilityInput = {
  brandName: "示例智能装备",
  modelUsed: "deepseek-v4-flash",
  testedAt: "2026-07-18T00:00:00.000Z",
};

describe("buildAiVisibilityTests — programmatic classification", () => {
  it("detects brand mention programmatically and forces NOT_MENTIONED/NONE when absent", () => {
    const res = buildAiVisibilityTests(EVIDENCE, INPUT, aiVisibilityFixture);
    if (!res.ok) throw new Error("expected ok");
    const [t1, t2, t3, t4] = res.value;

    // aiv_1: answer never names the brand → VALID but not mentioned.
    expect(t1?.status).toBe("VALID");
    expect(t1?.brandMentioned).toBe(false);
    expect(t1?.accuracy).toBe("NOT_MENTIONED");
    expect(t1?.recommendationStrength).toBe("NONE");

    // aiv_2 / aiv_3: brand named → keep the model's self-classification.
    expect(t2?.brandMentioned).toBe(true);
    expect(t2?.accuracy).toBe("PARTIAL");
    expect(t3?.brandMentioned).toBe(true);
    expect(t3?.recommendationStrength).toBe("MODERATE");

    // aiv_4: empty answer → INSUFFICIENT_EVIDENCE, no classifications.
    expect(t4?.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(t4?.brandMentioned).toBeNull();
  });

  it("ignores a model brandMentioned claim that contradicts the answer text", () => {
    const contradicting = {
      tests: [
        {
          id: "x",
          questionCategory: "BRAND_DIRECT",
          question: "q",
          answerText: "答案完全没有提到这家公司。",
          accuracy: "ACCURATE",
          recommendationStrength: "STRONG",
          evidenceIds: [],
        },
      ],
    };
    const res = buildAiVisibilityTests(EVIDENCE, INPUT, contradicting);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value[0]?.brandMentioned).toBe(false);
    expect(res.value[0]?.accuracy).toBe("NOT_MENTIONED"); // model's ACCURATE overridden
    expect(res.value[0]?.recommendationStrength).toBe("NONE");
  });

  it("filters unknown evidence ids on each test", () => {
    const res = buildAiVisibilityTests(EVIDENCE, INPUT, aiVisibilityFixture);
    if (!res.ok) throw new Error("expected ok");
    for (const t of res.value) {
      for (const id of t.evidenceIds) {
        expect(EVIDENCE.some((e) => e.id === id)).toBe(true);
      }
    }
  });
});

describe("computeAiVisibilityDimension — programmatic score (PRODUCT_TRUTH_RULES §8)", () => {
  it("computes the weighted score with ≥3 VALID tests", () => {
    const res = buildAiVisibility(EVIDENCE, INPUT, aiVisibilityFixture);
    if (!res.ok) throw new Error("expected ok");
    const dim = res.value.dimension;
    // brandMentionRate=66.67, accuracyAvg=40, recAvg=28.33
    // score = round(.5*66.67 + .3*40 + .2*28.33) = round(51.0) = 51
    expect(dim.score).toBe(51);
    expect(dim.measurementStatus).toBe("MEASURED");
    expect(dim.confidence).toBeCloseTo(0.64, 5);
  });

  it("returns null score and confidence ≤ 0.40 with fewer than 3 VALID tests", () => {
    const twoValid: AIVisibilityTest[] = [
      {
        id: "a", questionCategory: "BRAND_DIRECT", question: "q", status: "VALID",
        brandMentioned: true, accuracy: "ACCURATE", recommendationStrength: "STRONG",
        modelUsed: "m", testedAt: "t", evidenceIds: [],
      },
      {
        id: "b", questionCategory: "OTHER", question: "q", status: "VALID",
        brandMentioned: false, accuracy: "NOT_MENTIONED", recommendationStrength: "NONE",
        modelUsed: "m", testedAt: "t", evidenceIds: [],
      },
      {
        id: "c", questionCategory: "OTHER", question: "q", status: "PROVIDER_FAILED",
        brandMentioned: null, accuracy: null, recommendationStrength: null,
        modelUsed: "m", testedAt: "t", evidenceIds: [],
      },
    ];
    const dim = computeAiVisibilityDimension(twoValid);
    expect(dim.score).toBeNull();
    expect(dim.confidence).toBeLessThanOrEqual(0.4);
    expect(dim.measurementStatus).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("reports PROVIDER_FAILED when there are no valid tests and at least one failed", () => {
    const allFailed: AIVisibilityTest[] = [
      {
        id: "c", questionCategory: "OTHER", question: "q", status: "PROVIDER_FAILED",
        brandMentioned: null, accuracy: null, recommendationStrength: null,
        modelUsed: "m", testedAt: "t", evidenceIds: [],
      },
    ];
    expect(computeAiVisibilityDimension(allFailed).measurementStatus).toBe("PROVIDER_FAILED");
  });
});
