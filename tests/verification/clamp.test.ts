import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/contracts";
import { emptyCoverage, type EvidenceCoverage } from "../../src/contracts/claim-evidence";
import { clampVerdict } from "../../src/diagnosis/verification/clamp";
import type { RawVerdict } from "../../src/diagnosis/verification/types";

function ev(partial: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: "ev_x",
    title: "title",
    sourceDomain: "example-equip.com",
    sourceType: "FIRST_PARTY_EVIDENCE",
    authorityLevel: "OWNED",
    supportLevel: "CONTEXT_ONLY",
    fetchedAt: new Date(0).toISOString(),
    snippet: "snippet",
    url: "https://example-equip.com/page",
    ...partial,
  };
}

function coverage(partial: Partial<EvidenceCoverage> = {}): EvidenceCoverage {
  return {
    ...emptyCoverage(),
    executedQueries: ["q1"],
    crawledFirstPartyUrls: ["https://example-equip.com/page"],
    firstPartyDomains: ["example-equip.com"],
    observedEvidenceIds: ["ev_x"],
    boundaryEstablished: true,
    ...partial,
  };
}

const rawDirect: RawVerdict = {
  evidenceId: "ev_x",
  supportLevel: "DIRECT_SUPPORT",
  confidence: 0.9,
  justification: "raw",
};

describe("clampVerdict — deterministic support ceiling", () => {
  // Test 1: first-party About page cannot DIRECTLY support a "采购缺失" claim.
  it("negative/missing claim: first-party in-scope page is coverage-backed PARTIAL, never DIRECT", () => {
    const out = clampVerdict(rawDirect, ev(), "NEGATIVE_MISSING", coverage());
    expect(out.supportLevel).not.toBe("DIRECT_SUPPORT");
    expect(out.supportLevel).toBe("PARTIAL_SUPPORT");
    expect(out.basis).toBe("MEASUREMENT_BOUNDARY");
  });

  // Test 8 (clamp half): negative claim without a measurement boundary is context only.
  it("negative/missing claim without coverage boundary collapses to CONTEXT_ONLY", () => {
    const out = clampVerdict(
      rawDirect,
      ev(),
      "NEGATIVE_MISSING",
      coverage({ boundaryEstablished: false, crawledFirstPartyUrls: [] }),
    );
    expect(out.supportLevel).toBe("CONTEXT_ONLY");
    expect(out.basis).toBe("CONTENT_MATCH");
  });

  // Test 2: first-party product page can DIRECTLY support a product-capability claim.
  it("positive capability: first-party content match stays DIRECT", () => {
    const out = clampVerdict(rawDirect, ev(), "ENTERPRISE_CAPABILITY", coverage());
    expect(out.supportLevel).toBe("DIRECT_SUPPORT");
    expect(out.basis).toBe("CONTENT_MATCH");
  });

  // Test 3: third-party news can only PARTIALLY support the enterprise's own capability.
  it("positive capability: observed third-party is capped at PARTIAL", () => {
    const out = clampVerdict(
      rawDirect,
      ev({ sourceType: "OBSERVED_WEB_EVIDENCE", sourceDomain: "news.example.org" }),
      "ENTERPRISE_CAPABILITY",
      coverage(),
    );
    expect(out.supportLevel).toBe("PARTIAL_SUPPORT");
  });

  // Test 4a: competitor page directly supports a competitor fact.
  it("competitor fact: competitor page stays DIRECT", () => {
    const out = clampVerdict(
      rawDirect,
      ev({ sourceType: "COMPETITOR_WEB_EVIDENCE", sourceDomain: "rival.example.net" }),
      "COMPETITOR_FACT",
      coverage(),
    );
    expect(out.supportLevel).toBe("DIRECT_SUPPORT");
  });

  // Test 4b: competitor page alone cannot support "本企业落后" (an enterprise-negative claim).
  it("negative claim about the enterprise: competitor evidence is only CONTEXT_ONLY", () => {
    const out = clampVerdict(
      rawDirect,
      ev({ sourceType: "COMPETITOR_WEB_EVIDENCE", sourceDomain: "rival.example.net" }),
      "NEGATIVE_MISSING",
      coverage(),
    );
    expect(out.supportLevel).toBe("CONTEXT_ONLY");
  });

  // Test 7: a raw DIRECT that violates a deterministic precondition is downgraded.
  it("downgrades a raw DIRECT when the source/polarity precondition forbids it", () => {
    // model says DIRECT, but competitor evidence cannot support enterprise capability.
    const out = clampVerdict(
      rawDirect,
      ev({ sourceType: "COMPETITOR_WEB_EVIDENCE" }),
      "ENTERPRISE_CAPABILITY",
      coverage(),
    );
    expect(out.supportLevel).toBe("CONTEXT_ONLY");
  });

  it("never upgrades: a raw CONTEXT_ONLY first-party stays CONTEXT_ONLY (no authority shortcut)", () => {
    const rawContext: RawVerdict = { ...rawDirect, supportLevel: "CONTEXT_ONLY" };
    const out = clampVerdict(rawContext, ev(), "ENTERPRISE_CAPABILITY", coverage());
    expect(out.supportLevel).toBe("CONTEXT_ONLY");
  });
});
