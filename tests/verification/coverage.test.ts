import { describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { deriveCoverage, emptyCoverage } from "../../src/contracts/claim-evidence";
import { classifyPolarity } from "../../src/diagnosis/verification";

describe("deriveCoverage — measurement boundary", () => {
  it("establishes a boundary when in-scope first-party pages were checked", () => {
    const report = buildSampleReport();
    const cov = deriveCoverage({
      evidence: report.evidence,
      firstPartyDomains: ["example-equip.com"],
      executedQueries: ["q1", "q2"],
    });
    expect(cov.boundaryEstablished).toBe(true);
    expect(cov.crawledFirstPartyUrls.length).toBeGreaterThanOrEqual(1);
    expect(cov.firstPartyDomains).toContain("example-equip.com");
  });

  it("does NOT establish a boundary when no first-party page is in scope", () => {
    const report = buildSampleReport();
    const observedOnly = report.evidence.filter(
      (e) => e.sourceType !== "FIRST_PARTY_EVIDENCE",
    );
    const cov = deriveCoverage({
      evidence: observedOnly,
      firstPartyDomains: ["example-equip.com"],
    });
    expect(cov.boundaryEstablished).toBe(false);
  });

  it("emptyCoverage never establishes a boundary", () => {
    expect(emptyCoverage().boundaryEstablished).toBe(false);
  });
});

describe("classifyPolarity", () => {
  it("flags missing/negative statements as NEGATIVE_MISSING", () => {
    expect(classifyPolarity({ kind: "coreIssue", text: "官网缺少采购验收说明" })).toBe(
      "NEGATIVE_MISSING",
    );
    expect(classifyPolarity({ kind: "coreIssue", text: "本企业落后于竞品" })).toBe(
      "NEGATIVE_MISSING",
    );
    expect(classifyPolarity({ kind: "geoOpportunity", text: "官网无系统性选型指南" })).toBe(
      "NEGATIVE_MISSING",
    );
  });

  it("treats a capability statement as ENTERPRISE_CAPABILITY", () => {
    expect(
      classifyPolarity({ kind: "strength", text: "官网首页清晰说明了核心产品线" }),
    ).toBe("ENTERPRISE_CAPABILITY");
  });

  it("treats competitorGap claims as COMPETITOR_FACT", () => {
    expect(
      classifyPolarity({ kind: "competitorGap", text: "竞品展示了交付周期" }),
    ).toBe("COMPETITOR_FACT");
  });
});
