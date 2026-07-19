import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/contracts";
import {
  assertInsta360FrozenEvidenceIdentity,
  createFrozenEvidenceScopeCoverage,
  FrozenEvidenceContractError,
  hashEvidenceUrls,
  hashSortedEvidenceIds,
  INSTA360_FROZEN_EVIDENCE_IDENTITY_V1,
  parseFrozenEvidenceSnapshotV1,
  RECOVERY_CONTRACT_VERSION,
  type FrozenEvidenceSnapshotV1,
} from "../../src/diagnosis/orchestration/recovery/frozen-evidence-contract";

const hash = (character: string): string => character.repeat(64);

function evidenceSet(): EvidenceItem[] {
  return Array.from({ length: 22 }, (_, index) => {
    const firstParty = index < 6;
    const competitor = index >= 6 && index < 8;
    return {
      id: `ev_${String(index).padStart(2, "0")}`,
      title: `证据 ${index}`,
      sourceDomain: firstParty
        ? "insta360.com"
        : competitor
          ? "competitor.example"
          : "media.example",
      sourceType: firstParty
        ? "FIRST_PARTY_EVIDENCE"
        : competitor
          ? "COMPETITOR_WEB_EVIDENCE"
          : "OBSERVED_WEB_EVIDENCE",
      authorityLevel: firstParty ? "OWNED" : "PUBLIC",
      supportLevel: "CONTEXT_ONLY",
      fetchedAt: "2026-07-19T00:00:00.000Z",
      snippet: `保存的中文公开证据 ${index}`,
      url: `https://evidence.example/${index}`,
      language: "zh",
      sourceTier: firstParty ? "A" : competitor ? "B" : "C",
    } satisfies EvidenceItem;
  });
}

function snapshot(evidence = evidenceSet()): FrozenEvidenceSnapshotV1 {
  return {
    diagnosisId: "diag_d9d81ba3428f4696b088870ca7416e49",
    diagnosisInputHash: hash("1"),
    evidenceRegistryHash:
      INSTA360_FROZEN_EVIDENCE_IDENTITY_V1.evidenceRegistryHash,
    normalizedEvidenceHash:
      INSTA360_FROZEN_EVIDENCE_IDENTITY_V1.normalizedEvidenceHash,
    evidenceCount: 22,
    sortedEvidenceIdsHash: hashSortedEvidenceIds(evidence.map((item) => item.id)),
    evidenceUrlsHash: hashEvidenceUrls(evidence.map((item) => item.url)),
    firstPartyEvidenceCount: 6,
    observedEvidenceCount: 14,
    competitorEvidenceCount: 2,
    languageDistribution: { zh: 22, other: 0 },
    sourceTierDistribution: { A: 6, B: 2, C: 14, D: 0, E: 0 },
    databaseFileHash: hash("2"),
    runLockHash: hash("3"),
    capturedAt: "2026-07-19T08:00:00.000+08:00",
    recoveryContractVersion: RECOVERY_CONTRACT_VERSION,
    queryPlanProvenance: "UNAVAILABLE",
    competitorResolutionProvenance: "UNAVAILABLE",
  };
}

describe("FrozenEvidenceSnapshotV1", () => {
  it("accepts only the audited 22-Evidence identity with unavailable legacy provenance", () => {
    const parsed = parseFrozenEvidenceSnapshotV1(snapshot());
    expect(() => assertInsta360FrozenEvidenceIdentity(parsed)).not.toThrow();
    expect(parsed.queryPlanProvenance).toBe("UNAVAILABLE");
    expect(parsed.competitorResolutionProvenance).toBe("UNAVAILABLE");
  });

  it("rejects invented historical hashes and inconsistent distributions", () => {
    expect(() =>
      parseFrozenEvidenceSnapshotV1({
        ...snapshot(),
        queryPlanHash: hash("4"),
      }),
    ).toThrow(FrozenEvidenceContractError);

    expect(() =>
      parseFrozenEvidenceSnapshotV1({
        ...snapshot(),
        languageDistribution: { zh: 21, other: 0 },
      }),
    ).toThrowError("FROZEN_EVIDENCE_SNAPSHOT_INVALID");
  });

  it("fails closed if either known canary hash or the 22 count changes", () => {
    expect(() =>
      assertInsta360FrozenEvidenceIdentity({
        ...snapshot(),
        normalizedEvidenceHash: hash("5"),
      }),
    ).toThrowError("FROZEN_EVIDENCE_IDENTITY_MISMATCH");
  });
});

describe("FROZEN_EVIDENCE_SCOPE_ONLY coverage", () => {
  it("uses the saved set as the explicit boundary without fabricating a query plan", () => {
    const evidence = evidenceSet();
    const coverage = createFrozenEvidenceScopeCoverage({
      snapshot: snapshot(evidence),
      evidence,
    });

    expect(coverage.coverageMode).toBe("FROZEN_EVIDENCE_SCOPE_ONLY");
    expect(coverage.queryPlanProvenance).toBe("UNAVAILABLE");
    expect(coverage.queryPlanId).toBe("");
    expect(coverage.plannedQueries).toEqual([]);
    expect(coverage.executedQueries).toEqual([]);
    expect(coverage.observedEvidenceIds).toHaveLength(22);
    expect(coverage.boundaryEstablished).toBe(true);
  });

  it("rejects any changed Evidence id or URL set", () => {
    const evidence = evidenceSet();
    evidence[0] = { ...evidence[0]!, url: "https://evidence.example/changed" };
    expect(() =>
      createFrozenEvidenceScopeCoverage({ snapshot: snapshot(), evidence }),
    ).toThrowError("FROZEN_EVIDENCE_SET_MISMATCH");
  });
});
