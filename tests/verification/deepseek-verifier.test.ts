import { describe, expect, it, vi } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import type { StructuredCompletionProvider } from "../../src/providers/types";
import {
  createDeepSeekVerifierStrategy,
  verifyReport,
} from "../../src/diagnosis/verification";
import {
  buildVerifierUserPrompt,
  parseVerifierResponse,
} from "../../src/providers/deepseek/verifier-adapter";

function coverageFor(report = buildSampleReport()) {
  return deriveCoverage({
    evidence: report.evidence,
    firstPartyDomains: ["example-equip.com"],
    executedQueries: ["q"],
  });
}

describe("DeepSeek verifier adapter (mock provider — never the real endpoint)", () => {
  // Test 12 — every verifier call is counted against the provider budget.
  it("counts one provider call per claim with candidates (budget seam)", async () => {
    const completeJson = vi.fn(async () => ({ ok: true as const, json: { verdicts: [] } }));
    const provider: StructuredCompletionProvider = { completeJson };
    const report = buildSampleReport();

    const res = await verifyReport({
      report,
      coverage: coverageFor(report),
      strategy: createDeepSeekVerifierStrategy(provider),
    });

    const claimsWithCandidates =
      report.coreIssues.length +
      report.strengths.length +
      report.geoOpportunities.length +
      report.competitorGaps.length;

    expect(completeJson).toHaveBeenCalledTimes(claimsWithCandidates);
    const budgeted = res.usage.reduce((n, u) => n + (u.callCount ?? 0), 0);
    expect(budgeted).toBe(claimsWithCandidates);
    expect(res.usage.every((u) => u.stage === "CLAIM_EVIDENCE_VERIFICATION")).toBe(true);
  });

  // Test 6 — a model that returns an evidence id outside the candidate set fails.
  it("rejects verification when the model returns an illegal evidence id", async () => {
    const provider: StructuredCompletionProvider = {
      async completeJson() {
        return {
          ok: true,
          json: {
            verdicts: [
              {
                evidenceId: "ev_model_hallucinated",
                supportLevel: "DIRECT_SUPPORT",
                confidence: 1,
                justification: "fabricated",
              },
            ],
          },
        };
      },
    };
    const report = buildSampleReport();
    const res = await verifyReport({
      report,
      coverage: coverageFor(report),
      strategy: createDeepSeekVerifierStrategy(provider),
    });

    expect(res.ok).toBe(false);
    expect(res.illegalEvidenceIds).toContain("ev_model_hallucinated");
    // The fabricated id never becomes a persisted relation.
    expect(res.relations.some((r) => r.evidenceId === "ev_model_hallucinated")).toBe(false);
  });

  // Test 7 (real-mode half) — a model DIRECT that violates a precondition is clamped.
  it("clamps a model DIRECT down when the deterministic precondition forbids it", async () => {
    const report = buildSampleReport();
    // Force the model to claim DIRECT for the third-party news backing an
    // enterprise strength — the clamp must cap it at PARTIAL.
    report.strengths[0]!.evidenceIds = ["ev_observed_news"];
    const provider: StructuredCompletionProvider = {
      async completeJson() {
        return {
          ok: true,
          json: {
            verdicts: [
              {
                evidenceId: "ev_observed_news",
                supportLevel: "DIRECT_SUPPORT",
                confidence: 0.99,
                justification: "model over-claims",
              },
            ],
          },
        };
      },
    };
    const res = await verifyReport({
      report,
      coverage: coverageFor(report),
      strategy: createDeepSeekVerifierStrategy(provider),
    });
    const rel = res.relations.find((r) => r.claimId === "str_1");
    expect(rel?.supportLevel).toBe("PARTIAL_SUPPORT");
  });

  it("parseVerifierResponse rejects a malformed body", () => {
    const bad = parseVerifierResponse({ verdicts: [{ evidenceId: "x" }] });
    expect(bad.ok).toBe(false);
  });

  it("buildVerifierUserPrompt lists candidate ids but no fabricated fields", () => {
    const report = buildSampleReport();
    const prompt = buildVerifierUserPrompt(
      { id: "iss_1", text: "缺少采购 FAQ" },
      report.evidence.slice(0, 2),
    );
    expect(prompt).toContain("iss_1");
    expect(prompt).toContain(report.evidence[0]!.id);
  });
});
