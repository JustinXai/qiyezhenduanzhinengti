import { describe, expect, it } from "vitest";
import { buildUniversalLimitedReport } from "../../src/diagnosis/limited-report/universal-limited-report";
import type { EvidenceItem } from "../../src/contracts";

const snippets: EvidenceItem[] = [{
  id: "ev_1", title: "赣州悦熙医疗美容公开信息", sourceDomain: "example.com",
  sourceType: "OBSERVED_WEB_EVIDENCE", authorityLevel: "MEDIA", supportLevel: "CONTEXT_ONLY",
  acquisitionLevel: "SEARCH_SNIPPET", fetchedAt: "2026-07-22T00:00:00.000Z", snippet: "公开检索摘要", url: "https://example.com/yuexi",
}];

describe("universal limited report", () => {
  it("uses the regulated medical MVP pack without publishing medical conclusions", () => {
    const report = buildUniversalLimitedReport({ brandName: "任意机构", website: "", industry: "医疗美容服务", customerQuestions: [{ question: "如何预约？" }] }, snippets, true);
    expect(report.algorithmVersion).toBe("fast-mvp-geo-diagnostic-report.v1");
    expect(report.verticalPolicy.selectedPack).toBe("REGULATED_MEDICAL");
    expect(report.mvpReport?.strategyPack).toBe("REGULATED_MEDICAL");
    expect(report.verticalPolicy.prohibitedClaims).toContain("没有资质");
    expect(report.contentAssetPlans.length).toBeGreaterThanOrEqual(5);
    expect(report.sourceCoverageMatrix.some((slot) => slot.status === "NOT_FOUND_IN_CHECKED_SCOPE")).toBe(true);
  });

  it("does not turn unchecked scope into a zero score", () => {
    const report = buildUniversalLimitedReport({ brandName: "任意企业", website: "", industry: "品牌服务" }, [], false);
    expect(report.readinessScore.score).toBeNull();
    expect(report.readinessScore.scoreCoverage).toBe(0);
    expect(report.sourceCoverageMatrix.every((slot) => slot.status === "NOT_CHECKED")).toBe(true);
  });

  it("scores completed public checks with clear, partial, and missing statuses", () => {
    const report = buildUniversalLimitedReport({ brandName: "任意企业", website: "", industry: "品牌服务" }, snippets, true);
    const mvp = report.mvpReport!;
    expect(mvp.score.completionRate).toBe(100);
    expect(mvp.score.overall).not.toBeNull();
    expect(mvp.score.dimensions).toHaveLength(5);
    expect(mvp.score.dimensions.flatMap((dimension) => dimension.findings).some((finding) => finding.status === "NOT_FOUND_IN_CHECKED_SCOPE" && finding.score === 0)).toBe(true);
  });
});
