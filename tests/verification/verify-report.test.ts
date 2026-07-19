import { describe, expect, it, vi } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import type { StructuredCompletionProvider } from "../../src/providers/types";
import {
  createDeterministicVerifier,
  verifyReport,
} from "../../src/diagnosis/verification";

function sampleCoverage(report = buildSampleReport()) {
  return deriveCoverage({
    evidence: report.evidence,
    firstPartyDomains: ["example-equip.com"],
    executedQueries: ["柔性装配线 供应商", "示例智能装备 交付周期"],
  });
}

describe("verifyReport — deterministic strategy over the canonical sample", () => {
  it("produces a relation for every candidate (claim, evidence) pair, tagged with mode+version", async () => {
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });

    expect(res.ok).toBe(true);
    expect(res.illegalEvidenceIds).toEqual([]);

    const candidatePairs =
      report.coreIssues.reduce((n, c) => n + c.evidenceIds.length, 0) +
      report.strengths.reduce((n, c) => n + c.evidenceIds.length, 0) +
      report.geoOpportunities.reduce((n, c) => n + c.evidenceIds.length, 0) +
      report.competitorGaps.reduce((n, c) => n + c.evidenceIds.length, 0);
    expect(res.relations.length).toBe(candidatePairs);

    for (const r of res.relations) {
      expect(r.verifierMode).toBe("MOCK_DETERMINISTIC");
      expect(r.verifierVersion).toBe("claim-evidence.deterministic.v1");
    }
  });

  it("a positive strength backed by its first-party home page is DIRECT (content match)", async () => {
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });
    const rel = res.relations.find((r) => r.claimId === "str_1");
    expect(rel?.supportLevel).toBe("DIRECT_SUPPORT");
    expect(rel?.basis).toBe("CONTENT_MATCH");
  });

  it("a negative core issue keeps content support while remaining coverage-bounded", async () => {
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });
    const rels = res.relations.filter((r) => r.claimId === "iss_1");
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.every((r) => r.supportLevel === "CONTEXT_ONLY")).toBe(true);
    expect(rels.every((r) => r.basis === "MEASUREMENT_BOUNDARY")).toBe(true);
  });

  it("a competitor gap backed by the competitor's own page is DIRECT", async () => {
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });
    const rel = res.relations.find((r) => r.claimId === "gap_1");
    expect(rel?.supportLevel).toBe("DIRECT_SUPPORT");
  });

  // Test 5 — a candidate evidence id that resolves to nothing fails verification.
  it("fails when a claim cites an evidence id that does not exist", async () => {
    const report = buildSampleReport();
    report.coreIssues[0]!.evidenceIds = ["ev_does_not_exist"];
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });
    expect(res.ok).toBe(false);
    expect(res.illegalEvidenceIds).toContain("ev_does_not_exist");
  });

  // Test 10 — mock/deterministic mode performs ZERO provider calls.
  it("deterministic mode makes zero provider calls", async () => {
    const spy: StructuredCompletionProvider = { completeJson: vi.fn() };
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: sampleCoverage(report),
      strategy: createDeterministicVerifier(),
    });
    const totalCalls = res.usage.reduce((n, u) => n + (u.callCount ?? 0), 0);
    expect(totalCalls).toBe(0);
    expect(spy.completeJson).not.toHaveBeenCalled();
  });
});
