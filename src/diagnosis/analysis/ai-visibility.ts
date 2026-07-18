// Stage: AI visibility — the single source of truth for the `aiVisibility` score.
//
// docs/PRODUCT_TRUTH_RULES.md §8 (frozen):
//   - AI visibility may only come from aiVisibilityTests.
//   - brandMentioned is decided PROGRAMMATICALLY (substring match on the answer),
//     overriding any model claim; if the brand is not mentioned, accuracy and
//     recommendation are forced to NOT_MENTIONED / NONE.
//   - With < 3 VALID tests: score = null and confidence ≤ 0.40.
//   - With ≥ 3 VALID tests the score is computed by the fixed formula:
//       50% brand-mention rate + 30% accuracy avg + 20% recommendation avg.
// The model NEVER emits the numeric score or any percentage.

import type {
  AIVisibilityTest,
  EvidenceItem,
  ScoreDimension,
} from "../../contracts";
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import { clamp, indexEvidence, resolveEvidenceIds, round2 } from "./evidence-index";
import { AiVisibilityStageOutput, type AiVisibilityProbe } from "./stage-schemas";

const MIN_VALID_TESTS = 3;
const INSUFFICIENT_CONFIDENCE_CAP = 0.4;

// The enums are value-only exports in contracts; derive the value types from
// the canonical AIVisibilityTest shape so the maps stay exhaustive.
type Accuracy = NonNullable<AIVisibilityTest["accuracy"]>;
type Recommendation = NonNullable<AIVisibilityTest["recommendationStrength"]>;

const ACCURACY_VALUE: Record<Accuracy, number> = {
  ACCURATE: 100,
  PARTIAL: 60,
  INACCURATE: 0,
  NOT_MENTIONED: 0,
};
const RECOMMENDATION_VALUE: Record<Recommendation, number> = {
  STRONG: 100,
  MODERATE: 60,
  WEAK: 25,
  NONE: 0,
};

export interface AiVisibilityInput {
  brandName: string;
  modelUsed: string;
  testedAt: string;
}

function classifyProbe(
  probe: AiVisibilityProbe,
  input: AiVisibilityInput,
  evidenceIds: string[],
): AIVisibilityTest {
  const base = {
    id: probe.id,
    questionCategory: probe.questionCategory,
    question: probe.question,
    modelUsed: input.modelUsed,
    testedAt: input.testedAt,
    evidenceIds,
  };

  if (probe.providerFailed) {
    return {
      ...base,
      status: "PROVIDER_FAILED",
      brandMentioned: null,
      accuracy: null,
      recommendationStrength: null,
    };
  }

  if (probe.answerText.trim().length === 0) {
    return {
      ...base,
      status: "INSUFFICIENT_EVIDENCE",
      brandMentioned: null,
      accuracy: null,
      recommendationStrength: null,
    };
  }

  // Programmatic brand-mention detection — the model's own claim is not trusted.
  const brandMentioned =
    input.brandName.trim().length > 0 &&
    probe.answerText.toLowerCase().includes(input.brandName.trim().toLowerCase());

  let accuracy: Accuracy;
  let recommendationStrength: Recommendation;
  if (!brandMentioned) {
    // Cannot be accurate about or recommend a brand it never named.
    accuracy = "NOT_MENTIONED";
    recommendationStrength = "NONE";
  } else {
    accuracy = probe.accuracy ?? "PARTIAL";
    recommendationStrength = probe.recommendationStrength ?? "NONE";
  }

  return { ...base, status: "VALID", brandMentioned, accuracy, recommendationStrength };
}

export function buildAiVisibilityTests(
  evidence: readonly EvidenceItem[],
  input: AiVisibilityInput,
  deepSeekJson: unknown,
): StageParseResult<AIVisibilityTest[]> {
  const parsed = parseStageJson("ai_visibility", AiVisibilityStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const tests = parsed.value.tests.map((probe) =>
    classifyProbe(probe, input, resolveEvidenceIds(probe.evidenceIds, index)),
  );
  return { ok: true, value: tests };
}

function unionEvidenceIds(tests: readonly AIVisibilityTest[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tests) {
    for (const id of t.evidenceIds) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the `aiVisibility` ScoreDimension purely from the classified tests.
 * Never consumes an LLM-provided score.
 */
export function computeAiVisibilityDimension(tests: readonly AIVisibilityTest[]): ScoreDimension {
  const valid = tests.filter((t) => t.status === "VALID");

  if (valid.length < MIN_VALID_TESTS) {
    const anyFailed = tests.some((t) => t.status === "PROVIDER_FAILED");
    const measurementStatus = valid.length === 0 && anyFailed ? "PROVIDER_FAILED" : "INSUFFICIENT_EVIDENCE";
    return {
      score: null,
      measurementStatus,
      confidence: round2(clamp(0.13 * valid.length, 0, INSUFFICIENT_CONFIDENCE_CAP)),
      evidenceIds: unionEvidenceIds(valid),
    };
  }

  const brandMentionRate = (valid.filter((t) => t.brandMentioned === true).length / valid.length) * 100;
  const accuracyAvg = mean(valid.map((t) => ACCURACY_VALUE[t.accuracy ?? "NOT_MENTIONED"]));
  const recommendationAvg = mean(valid.map((t) => RECOMMENDATION_VALUE[t.recommendationStrength ?? "NONE"]));
  const score = Math.round(0.5 * brandMentionRate + 0.3 * accuracyAvg + 0.2 * recommendationAvg);

  return {
    score,
    measurementStatus: "MEASURED",
    confidence: round2(clamp(0.4 + 0.08 * valid.length, 0, 0.9)),
    evidenceIds: unionEvidenceIds(valid),
  };
}

export interface AiVisibilityResult {
  tests: AIVisibilityTest[];
  dimension: ScoreDimension;
}

export function buildAiVisibility(
  evidence: readonly EvidenceItem[],
  input: AiVisibilityInput,
  deepSeekJson: unknown,
): StageParseResult<AiVisibilityResult> {
  const built = buildAiVisibilityTests(evidence, input, deepSeekJson);
  if (!built.ok) return built;
  return { ok: true, value: { tests: built.value, dimension: computeAiVisibilityDimension(built.value) } };
}
