import { describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import type {
  ClaimPublicationDecisionCandidateKey,
  ClaimPublicationDecisionRecordInput,
  PruneDecisionRecordInput,
} from "../../src/storage/adapter";
import { openMigratedDatabase } from "../../src/storage/migrate";
import {
  canonicalReportJson,
  applyReportRevisionSchema,
  SqliteReportRevisionRepository,
} from "../../src/storage/report-revisions";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";

const NOW = new Date("2026-07-20T00:00:00.000Z");
const DIAGNOSIS_ID = "diag_decision_1";
const SOURCE_HASH = "a".repeat(64);
const refs = ["str_1", "str_2", "iss_1", "iss_2", "gap_1", "geo_1", "geo_2", "demo_1"];
const expectedCandidates: ClaimPublicationDecisionCandidateKey[] = refs.map((candidateRef) => ({
  candidateRef,
  claimKind: candidateRef.startsWith("str_")
    ? "strength"
    : candidateRef.startsWith("iss_")
      ? "coreIssue"
      : candidateRef.startsWith("geo_")
        ? "geoOpportunity"
        : candidateRef.startsWith("gap_")
          ? "competitorGap"
          : "demonstrationFix",
}));

function decisions(
  lineage: { reportId: string | null; revisionId: string | null },
): ClaimPublicationDecisionRecordInput[] {
  return expectedCandidates.map((candidate, index) => ({
    id: `decision_${index + 1}`,
    diagnosisId: DIAGNOSIS_ID,
    ...lineage,
    stageRunId: null,
    legacyCheckpointId: "checkpoint_2",
    candidateSourceProvenance: "LEGACY_ANALYSIS_CHECKPOINT",
    candidateSourcePayloadHash: SOURCE_HASH,
    candidateRef: candidate.candidateRef,
    claimKind: candidate.claimKind,
    publicationStatus: candidate.candidateRef === "gap_1" ? "PRUNED" : "PUBLISHED",
    reasonCode:
      candidate.candidateRef === "gap_1"
        ? "MISSING_COMPETITOR_OFFICIAL_RELATION"
        : "PUBLISHED_BY_CURRENT_TRUTH_POLICY",
    guardRule: "competitor-gap-publication-policy.v1",
    evidenceIds: ["ev_first_home"],
    directCount: 1,
    partialCount: 0,
    contextCount: 0,
    independentSupportSourceCount: 0,
    coverageStatus: "NOT_REQUIRED",
    algorithmVersion: "competitor-gap-publication-policy.v1",
    createdAt: NOW,
  }));
}

function historicalPrune(): PruneDecisionRecordInput {
  return {
    id: "historical_prune_1",
    diagnosisId: DIAGNOSIS_ID,
    reportId: "report_1",
    revisionId: null,
    stageRunId: "ANALYZING:legacy",
    claimKind: "geoOpportunity",
    candidateRef: "geo_legacy",
    sourceIssueId: "iss_1",
    reasonCode: "INSUFFICIENT_INDEPENDENT_SUPPORT",
    guardRule: "INSUFFICIENT_INDEPENDENT_SUPPORT",
    evidenceIds: ["ev_first_home"],
    independentSupportSourceCount: 1,
    directCount: 0,
    partialCount: 1,
    contextCount: 0,
    coverageStatus: "NOT_REQUIRED",
    createdAt: NOW,
    algorithmVersion: "round6-prune-audit.v1",
  };
}

describe("ClaimPublicationDecision append-only ledger", () => {
  it("writes exactly one final Decision for each of 8 candidates without touching PruneDecision", async () => {
    const db = openMigratedDatabase(":memory:");
    const storage = new SqliteStorageAdapter(db, { now: () => NOW });
    await storage.appendPruneDecisions([historicalPrune()]);
    await storage.appendClaimPublicationDecisionBatch({
      expectedCandidates,
      decisions: decisions({ reportId: "report_1", revisionId: null }),
    });

    const stored = await storage.getClaimPublicationDecisions(DIAGNOSIS_ID);
    expect(stored).toHaveLength(8);
    expect(new Set(stored.map((item) => `${item.claimKind}:${item.candidateRef}`)).size).toBe(8);
    expect(stored.find((item) => item.candidateRef === "gap_1")).toMatchObject({
      publicationStatus: "PRUNED",
      reasonCode: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    });
    expect(await storage.getPruneDecisions(DIAGNOSIS_ID)).toEqual([historicalPrune()]);
    db.close();
  });

  it("rejects missing, extra, and duplicate candidate decisions atomically", async () => {
    const db = openMigratedDatabase(":memory:");
    const storage = new SqliteStorageAdapter(db, { now: () => NOW });
    const valid = decisions({ reportId: "report_1", revisionId: null });
    await expect(
      storage.appendClaimPublicationDecisionBatch({
        expectedCandidates,
        decisions: valid.slice(0, 7),
      }),
    ).rejects.toThrow("CLAIM_PUBLICATION_DECISION_COUNT_MISMATCH");
    await expect(
      storage.appendClaimPublicationDecisionBatch({
        expectedCandidates,
        decisions: [...valid.slice(0, 7), { ...valid[0]!, id: "duplicate" }],
      }),
    ).rejects.toThrow("CLAIM_PUBLICATION_DECISION_DUPLICATE_CANDIDATE");
    expect(await storage.getClaimPublicationDecisions(DIAGNOSIS_ID)).toEqual([]);
    db.close();
  });

  it("enforces append-only uniqueness for a report candidate", async () => {
    const db = openMigratedDatabase(":memory:");
    const storage = new SqliteStorageAdapter(db, { now: () => NOW });
    const batch = {
      expectedCandidates,
      decisions: decisions({ reportId: "report_1", revisionId: null }),
    };
    await storage.appendClaimPublicationDecisionBatch(batch);
    await expect(storage.appendClaimPublicationDecisionBatch(batch)).rejects.toThrow();
    expect(await storage.getClaimPublicationDecisions(DIAGNOSIS_ID)).toHaveLength(8);
    db.close();
  });

  it("rolls back the revision, report row, and decisions when the candidate set is incomplete", async () => {
    const db = openMigratedDatabase(":memory:");
    applyReportRevisionSchema(db);
    const storage = new SqliteStorageAdapter(db, { now: () => NOW });
    const original = buildSampleReport({ diagnosisId: DIAGNOSIS_ID });
    await storage.saveReport({
      id: "report_original",
      diagnosisId: DIAGNOSIS_ID,
      reportContractVersion: original.reportContractVersion,
      scoreContractVersion: original.scoreContractVersion,
      canonicalJson: canonicalReportJson(original),
    });
    const revised = structuredClone(original);
    revised.companyProfile.unresolvedQuestions.push("Round-6A revision marker");
    const repository = new SqliteReportRevisionRepository(db, {
      now: () => new Date("2026-07-20T00:01:00.000Z"),
      idFactory: () => "revision_1",
    });
    const drafts = decisions({ reportId: null, revisionId: "placeholder" }).map((decision) => ({
      stageRunId: decision.stageRunId,
      legacyCheckpointId: decision.legacyCheckpointId,
      candidateSourceProvenance: decision.candidateSourceProvenance,
      candidateSourcePayloadHash: decision.candidateSourcePayloadHash,
      candidateRef: decision.candidateRef,
      claimKind: decision.claimKind,
      publicationStatus: decision.publicationStatus,
      reasonCode: decision.reasonCode,
      guardRule: decision.guardRule,
      evidenceIds: decision.evidenceIds,
      directCount: decision.directCount,
      partialCount: decision.partialCount,
      contextCount: decision.contextCount,
      independentSupportSourceCount: decision.independentSupportSourceCount,
      coverageStatus: decision.coverageStatus,
      algorithmVersion: decision.algorithmVersion,
      createdAt: decision.createdAt,
    }));
    await expect(
      repository.append({
        diagnosisId: DIAGNOSIS_ID,
        expectedParentReportId: "report_original",
        revisionReason: "ROUND6A_COMPETITOR_TRUTH_GUARD",
        algorithmVersion: "competitor-gap-publication-policy.v1",
        canonicalJson: canonicalReportJson(revised),
        prunedClaims: [],
        claimPublicationDecisionBatch: {
          expectedCandidates,
          decisions: drafts.slice(0, 7),
        },
      }),
    ).rejects.toThrow("CLAIM_PUBLICATION_DECISION_COUNT_MISMATCH");
    expect(await repository.list(DIAGNOSIS_ID)).toEqual([]);
    expect(
      (db.prepare("SELECT COUNT(*) AS count FROM reports").get() as { count: number }).count,
    ).toBe(1);
    expect(await storage.getClaimPublicationDecisions(DIAGNOSIS_ID)).toEqual([]);
    db.close();
  });
});
