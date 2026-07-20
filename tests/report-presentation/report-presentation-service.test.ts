import { describe, expect, it } from "vitest";
import {
  COMPETITOR_INSUFFICIENT_EVIDENCE_REASON,
  COMPETITOR_NOT_PROVIDED_REASON,
  presentReport,
  toDeepReportViewModel,
  toEvidenceViewModel,
  toQuickReportViewModel,
} from "../../src/report/presentation/report-presentation-service";
import {
  QuickReportViewModel,
  DeepReportViewModel,
  EvidenceViewModel,
} from "../../src/contracts";
import {
  SAMPLE_DIAGNOSIS_REPORT,
  buildSampleReport,
} from "../../src/fixtures/sample-report";
import { FORBIDDEN_COPY } from "./forbidden-copy";

describe("toQuickReportViewModel", () => {
  it("produces a schema-valid QuickReportViewModel from the canonical sample", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => QuickReportViewModel.parse(vm)).not.toThrow();
  });

  it("carries the mandated 'GEO基础诊断指数' naming and no forbidden score aliases", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.headlineConclusion).toContain("GEO基础诊断指数");
    for (const banned of FORBIDDEN_COPY) {
      expect(vm.headlineConclusion).not.toContain(banned);
      expect(vm.measurementStatusSummary).not.toContain(banned);
    }
  });

  it("carries the mandated 'GEO基础诊断指数' naming and no forbidden score aliases", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.headlineConclusion).toContain("GEO基础诊断指数");
    for (const banned of FORBIDDEN_COPY) {
      expect(vm.headlineConclusion).not.toContain(banned);
      expect(vm.measurementStatusSummary).not.toContain(banned);
    }
  });

  it("builds question coverage stats from assessments (not gaps.length)", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.questionCoverageStats.total).toBe(3);
    expect(vm.questionCoverageStats.supported).toBe(0);
    expect(vm.questionCoverageStats.partial).toBe(2);
    expect(vm.questionCoverageStats.unanswered).toBe(1);
    expect(vm.questionCoverageStats.providerFailed).toBe(0);
  });

  it("clusters question coverage gaps into priority directions (max 3)", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.priorityDirections.length).toBeGreaterThan(0);
    expect(vm.priorityDirections.length).toBeLessThanOrEqual(3);
    for (const dir of vm.priorityDirections) {
      expect(dir.title).toBeTruthy();
      expect(dir.linkedQuestionIds.length).toBeGreaterThan(0);
      expect(dir.suggestedAsset).toBeTruthy();
      expect(dir.businessValue).toBeTruthy();
    }
  });

  it("maps competitive gap availability correctly — available when gaps exist", () => {
    const vm = toQuickReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.competitorGapSummary.available).toBe(true);
  });
});

describe("toDeepReportViewModel", () => {
  it("produces a schema-valid DeepReportViewModel", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => DeepReportViewModel.parse(vm)).not.toThrow();
  });

  it("exposes only VALID AI tests", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.aiVisibilityTests.every((t) => t.status === "VALID")).toBe(true);
    expect(vm.aiVisibilityTests.map((t) => t.id)).not.toContain("aiv_3");
  });

  it("includes measurement notes that frame AI tests as a diagnostic sample, not market share", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(vm.measurementNotes.length).toBeGreaterThan(0);
    expect(vm.measurementNotes.some((n) => n.includes("诊断样本"))).toBe(true);
    expect(vm.measurementNotes.some((n) => n.includes("不代表多平台市场份额"))).toBe(true);
  });

  it("notes when fewer than 3 VALID AI tests exist", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT); // 2 VALID in sample
    expect(vm.measurementNotes.some((n) => n.includes("少于 3 项"))).toBe(true);
  });

  it("uses evidence-gated competitor gaps (weak evidence dropped)", () => {
    const report = buildSampleReport({
      competitorGaps: [
        {
          id: "gap_weak",
          competitorName: "竞品甲自动化",
          gapStatement: "证据不足",
          evidenceIds: ["ev_observed_news"], // CONTEXT_ONLY
        },
      ],
    });
    const vm = toDeepReportViewModel(report);
    expect(vm.competitorGaps).toHaveLength(0);
  });

  it("does not leak forbidden copy in measurement notes", () => {
    const vm = toDeepReportViewModel(SAMPLE_DIAGNOSIS_REPORT);
    for (const note of vm.measurementNotes) {
      for (const banned of FORBIDDEN_COPY) {
        expect(note).not.toContain(banned);
      }
    }
  });
});

describe("toEvidenceViewModel", () => {
  it("produces a schema-valid EvidenceViewModel", () => {
    const vm = toEvidenceViewModel(SAMPLE_DIAGNOSIS_REPORT);
    expect(() => EvidenceViewModel.parse(vm)).not.toThrow();
    expect(vm.items).toHaveLength(SAMPLE_DIAGNOSIS_REPORT.evidence.length);
  });

  it("sanitises sensitive material out of evidence URLs", () => {
    const dirty = buildSampleReport({
      evidence: [
        {
          ...SAMPLE_DIAGNOSIS_REPORT.evidence[0]!,
          url: "https://user:pw@example.com/a?token=abc&keep=1#frag",
        },
      ],
    });
    const vm = toEvidenceViewModel(dirty);
    const url = vm.items[0]!.url;
    expect(url).toContain("keep=1");
    expect(url).not.toMatch(/token|user|pw|frag/);
  });
});

describe("presentReport", () => {
  it("projects all three view models from one report in a single pass", () => {
    const { quick, deep, evidence } = presentReport(SAMPLE_DIAGNOSIS_REPORT);
    // Same underlying score object — Quick and Deep never diverge on numbers.
    expect(quick.overallScore).toBe(deep.scores.overallScore);
    expect(evidence.items).toHaveLength(SAMPLE_DIAGNOSIS_REPORT.evidence.length);
  });
});
