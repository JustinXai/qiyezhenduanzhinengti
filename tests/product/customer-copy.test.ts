// ============================================================================
// tests/product/customer-copy.test.ts — Agent L (product-copy-freeze).
//
// Locks src/product/customer-copy.ts as the single program source of frozen
// customer-facing copy:
//   (1) the guard and report components read the SAME values (no divergence),
//   (2) every frozen string matches the copy-paste source doc verbatim
//       (whitespace-insensitive, since the doc soft-wraps lines),
//   (3) customer-visible copy uses full-width Chinese punctuation (incl. OQ-1),
//   (4) the AI-sample disclaimer conveys all four required facts,
//   (5) no consumer file retypes a frozen literal (single source enforced).
// ============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DemonstrationFix } from "../../src/contracts";
import {
  AI_SAMPLE_DISCLAIMER,
  BANNED_MARKETING_PHRASES,
  BANNED_SCORE_ALIASES,
  COMPETITOR_INSUFFICIENT_EVIDENCE,
  CTA_DESCRIPTION,
  DEMONSTRATION_FIX_DISCLAIMER,
  OVERALL_SCORE_LABEL,
  PRIMARY_CTA_LABEL,
  ROADMAP_PHASE_GOALS,
  SCORE_HINT_ALL_ESTIMATED,
  SCORE_HINT_SOME_UNMEASURED,
  SECONDARY_CTA_LABEL,
  THIRTY_MINUTE_POINTS,
} from "../../src/product/customer-copy";
import {
  BANNED_PHRASES,
  PRIMARY_CTA_LABEL as GUARD_PRIMARY,
  SECONDARY_CTA_LABEL as GUARD_SECONDARY,
} from "../../src/report/validation/cta-guard";
import { OVERALL_SCORE_LABEL as LABELS_SCORE } from "../../components/report/labels";

const strip = (s: string): string => s.replace(/\s+/g, "");
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");
const DOC_STRIPPED = strip(read("docs/product/CTA_AND_DISCLAIMER_STRINGS.md"));

describe("customer-copy is the single program source", () => {
  it("cta-guard reads its CTA labels + banned phrases from customer-copy", () => {
    expect(GUARD_PRIMARY).toBe(PRIMARY_CTA_LABEL);
    expect(GUARD_SECONDARY).toBe(SECONDARY_CTA_LABEL);
    expect(BANNED_PHRASES).toBe(BANNED_MARKETING_PHRASES); // same reference
  });

  it("component labels read the composite-score name from customer-copy", () => {
    expect(LABELS_SCORE).toBe(OVERALL_SCORE_LABEL);
  });

  it("the demonstrationFix disclaimer is the Zod literal itself (never retyped)", () => {
    expect(DEMONSTRATION_FIX_DISCLAIMER).toBe(DemonstrationFix.shape.disclaimer.value);
  });
});

describe("frozen copy matches the copy-paste source doc verbatim", () => {
  const frozen: Array<[string, string]> = [
    ["primary CTA", PRIMARY_CTA_LABEL],
    ["secondary CTA", SECONDARY_CTA_LABEL],
    ["CTA description", CTA_DESCRIPTION],
    ["competitor placeholder", COMPETITOR_INSUFFICIENT_EVIDENCE],
    ["score hint (all estimated)", SCORE_HINT_ALL_ESTIMATED],
    ["score hint (some unmeasured)", SCORE_HINT_SOME_UNMEASURED],
    ["overall score label", OVERALL_SCORE_LABEL],
    ["demonstrationFix disclaimer", DEMONSTRATION_FIX_DISCLAIMER],
    ...THIRTY_MINUTE_POINTS.map((p, i): [string, string] => [`30-min point ${i + 1}`, p]),
    ...BANNED_SCORE_ALIASES.map((a): [string, string] => [`score alias「${a}」`, a]),
    ...BANNED_MARKETING_PHRASES.map((p): [string, string] => [`banned phrase「${p}」`, p]),
    ...ROADMAP_PHASE_GOALS.map((g): [string, string] => [`roadmap goal「${g}」`, g]),
  ];

  it.each(frozen)("doc contains the %s", (_label, value) => {
    expect(DOC_STRIPPED).toContain(strip(value));
  });
});

describe("customer-visible copy uses full-width Chinese punctuation", () => {
  it("OQ-1: the disclaimer comma is full-width 「，」(U+FF0C)", () => {
    expect(DEMONSTRATION_FIX_DISCLAIMER).toContain("优化方向，正式"); // U+FF0C
    expect(DEMONSTRATION_FIX_DISCLAIMER).not.toContain("优化方向,正式"); // U+002C
  });

  it("the CTA description uses full-width commas", () => {
    expect(CTA_DESCRIPTION).toContain("业务，进一步");
    expect(CTA_DESCRIPTION).not.toContain("业务,进一步");
  });

  it("the 30-minute points use full-width semicolons/commas", () => {
    expect(THIRTY_MINUTE_POINTS[0].endsWith("；")).toBe(true);
    expect(THIRTY_MINUTE_POINTS[1].endsWith("；")).toBe(true);
    expect(THIRTY_MINUTE_POINTS[2]).toContain("什么，以及");
  });

  it("the competitor placeholder uses full-width commas", () => {
    expect(COMPETITOR_INSUFFICIENT_EVIDENCE).toContain("竞品输入，但");
    expect(COMPETITOR_INSUFFICIENT_EVIDENCE).not.toContain("竞品输入,但");
  });
});

describe("AI-sample disclaimer conveys all four required facts (PRODUCT_TRUTH_RULES §8)", () => {
  it("fact 1 — current model / time / question-set diagnostic sample", () => {
    for (const t of ["当前模型", "当前时间", "当前问题集", "样本"]) {
      expect(AI_SAMPLE_DISCLAIMER).toContain(t);
    }
  });
  it("fact 2 — not multi-platform market-share monitoring", () => {
    expect(AI_SAMPLE_DISCLAIMER).toContain("多平台");
    expect(AI_SAMPLE_DISCLAIMER).toContain("市场份额");
  });
  it("fact 3 — not 豆包 / 元宝 / Kimi platform monitoring", () => {
    for (const t of ["豆包", "元宝", "Kimi"]) {
      expect(AI_SAMPLE_DISCLAIMER).toContain(t);
    }
  });
  it("fact 4 — not whole-web AI recommendation rate", () => {
    expect(AI_SAMPLE_DISCLAIMER).toContain("全网");
    expect(AI_SAMPLE_DISCLAIMER).toContain("推荐率");
  });
});

describe("no consumer file retypes a frozen literal (single source enforced)", () => {
  const cases: Array<[string, string]> = [
    ["components/report/cta-section.tsx", PRIMARY_CTA_LABEL],
    ["components/report/cta-section.tsx", SECONDARY_CTA_LABEL],
    ["components/report/cta-section.tsx", CTA_DESCRIPTION],
    ["components/report/quick-report.tsx", PRIMARY_CTA_LABEL],
    ["components/report/ai-test-card.tsx", "以下为当前模型"],
    ["components/report/labels.ts", OVERALL_SCORE_LABEL],
    ["components/report/roadmap.tsx", ROADMAP_PHASE_GOALS[0]],
    ["src/report/validation/cta-guard.ts", PRIMARY_CTA_LABEL],
    ["src/report/validation/cta-guard.ts", BANNED_MARKETING_PHRASES[0]],
  ];

  it.each(cases)("%s does not contain the raw literal", (file, literal) => {
    expect(read(file)).not.toContain(literal);
  });
});
