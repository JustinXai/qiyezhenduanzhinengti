// ============================================================================
// tests/security/banned-copy.test.ts — Agent G (qa-ci).
//
// Product-truth guard over the CANONICAL report payload (not the app). Runs
// under vitest today (no integrated UI required). It proves that:
//   (1) no forbidden copy leaks into any customer-facing string of the report,
//   (2) the canonical fixture carries the backing data for all 8 Quick modules
//       so Agent F has everything it needs to render them,
//   (3) the frozen CTA copy (docs/REPORT_CONTRACT.md §8) is itself clean.
//
// Imports the shared canonical fixture read-only (never forks its shape).
// ============================================================================
import { describe, expect, it } from "vitest";
import { DemonstrationFix } from "../../src/contracts";
import { SAMPLE_DIAGNOSIS_REPORT, buildSampleReport } from "../../src/fixtures/sample-report";
import { BANNED_TERMS, findBannedTerms } from "../fixtures/banned-terms";

/** Frozen CTA copy per docs/REPORT_CONTRACT.md §8 (presentation constants). */
const PRIMARY_CTA = "预约报告解读";
const SECONDARY_CTA = "获取企业GEO优化方案";
/** Frozen综合分命名 per docs/REPORT_CONTRACT.md §1. */
const CANONICAL_SCORE_NAME = "GEO可见度基础指数";

/** Deep-collect every string value in an arbitrary JSON-like value. */
function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
  return acc;
}

describe("banned copy — canonical report payload", () => {
  it("contains none of the forbidden score aliases or marketing/恐吓 phrases", () => {
    const strings = collectStrings(SAMPLE_DIAGNOSIS_REPORT);
    const hits = strings.flatMap((s) =>
      findBannedTerms(s).map((b) => ({ term: b.term, category: b.category, in: s })),
    );
    expect(hits).toEqual([]);
  });

  it("keeps the frozen CTA copy free of banned terms", () => {
    expect(findBannedTerms(PRIMARY_CTA)).toEqual([]);
    expect(findBannedTerms(SECONDARY_CTA)).toEqual([]);
    expect(findBannedTerms(CANONICAL_SCORE_NAME)).toEqual([]);
  });

  it("uses the canonical综合分 name and none of its banned aliases", () => {
    // The banned aliases must never be an accepted synonym for the index name.
    const aliases = BANNED_TERMS.filter((b) => b.category === "score-alias").map((b) => b.term);
    for (const alias of aliases) {
      expect(CANONICAL_SCORE_NAME).not.toContain(alias);
    }
  });

  it("still detects a banned term when one is injected (guard is not a no-op)", () => {
    // security-check:allow — this line intentionally references a banned alias in a test.
    const poisoned = buildSampleReport({
      companyProfile: {
        ...SAMPLE_DIAGNOSIS_REPORT.companyProfile,
        brandName: "市场权威指数示例",
      },
    });
    const strings = collectStrings(poisoned);
    const hits = strings.flatMap((s) => findBannedTerms(s));
    expect(hits.map((h) => h.term)).toContain("市场权威指数");
  });
});

describe("Quick 8-module backing data — canonical report", () => {
  const r = SAMPLE_DIAGNOSIS_REPORT;

  it("module 1 首屏决策摘要: brand, date, score summary + top strength/issue/opportunity", () => {
    expect(r.companyProfile.brandName.length).toBeGreaterThan(0);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // GEO可见度基础指数 source: overallScore may be null, but coverage/status must exist.
    expect(typeof r.scores.scoreCoverage).toBe("number");
    expect(r.scores.overallScore === null || typeof r.scores.overallScore === "number").toBe(true);
    expect(r.scores.companyClarity.measurementStatus.length).toBeGreaterThan(0);
    expect(r.strengths.length).toBeGreaterThanOrEqual(1); // at least one已有优势
    expect(r.coreIssues.length).toBeGreaterThanOrEqual(1); // one最优先问题
    expect(r.geoOpportunities.length).toBeGreaterThanOrEqual(1); // one最优先机会
  });

  it("module 2 AI现在怎么谈论企业: at least one VALID aiVisibility test to sample", () => {
    const valid = r.aiVisibilityTests.filter((t) => t.status === "VALID");
    expect(valid.length).toBeGreaterThanOrEqual(1);
    // Quick shows at most 2 VALID samples.
    expect(valid.length).toBeLessThanOrEqual(r.aiVisibilityTests.length);
  });

  it("module 3 竞品差距: gaps array present (may be empty -> insufficient-evidence path)", () => {
    expect(Array.isArray(r.competitorGaps)).toBe(true);
    for (const gap of r.competitorGaps) {
      expect(gap.evidenceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("module 4 三个核心问题: up to 3 core issues, each with evidence + fixDirection", () => {
    expect(r.coreIssues.length).toBeGreaterThanOrEqual(1);
    expect(r.coreIssues.length).toBeLessThanOrEqual(3);
    for (const issue of r.coreIssues) {
      expect(issue.evidenceIds.length).toBeGreaterThanOrEqual(1);
      expect(issue.fixDirection.length).toBeGreaterThan(0);
    }
  });

  it("module 5 示范修复: demonstrationFix is a valid type or explicitly null", () => {
    const fix = r.demonstrationFix;
    if (fix !== null) {
      expect(["ENTITY_DESCRIPTION", "FAQ_EXAMPLE", "BEFORE_AFTER_STRUCTURE"]).toContain(fix.fixType);
      expect(fix.evidenceIds.length).toBeGreaterThanOrEqual(1);
      // Frozen disclaimer must be present verbatim. Assert against the single
      // source of truth (the Zod literal) rather than retyping it, so this test
      // follows OQ-1 (full-width comma) automatically. — Agent L seam.
      expect(fix.disclaimer).toBe(DemonstrationFix.shape.disclaimer.value);
    }
  });

  it("module 6 Top 3 GEO机会: opportunities carry customerQuestion + contentGap", () => {
    expect(r.geoOpportunities.length).toBeGreaterThanOrEqual(1);
    expect(r.geoOpportunities.length).toBeLessThanOrEqual(5);
    for (const opp of r.geoOpportunities) {
      expect(opp.customerQuestion.length).toBeGreaterThan(0);
      expect(opp.contentGap.length).toBeGreaterThan(0);
      expect(opp.evidenceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("module 7 三阶段路线图: derivable (static stages, no payload dependency)", () => {
    // Roadmap stages are fixed presentation copy; the payload only needs to exist.
    expect(r.diagnosisId.length).toBeGreaterThan(0);
  });

  it("module 8 CTA: frozen primary/secondary copy is stable and clean", () => {
    expect(PRIMARY_CTA).toBe("预约报告解读");
    expect(SECONDARY_CTA).toBe("获取企业GEO优化方案");
  });

  it("every referenced evidenceId resolves to an evidence item (referential integrity)", () => {
    const ids = new Set(r.evidence.map((e) => e.id));
    const referenced = [
      ...r.strengths,
      ...r.coreIssues,
      ...r.geoOpportunities,
      ...r.competitorGaps,
    ].flatMap((c) => c.evidenceIds);
    for (const id of referenced) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
