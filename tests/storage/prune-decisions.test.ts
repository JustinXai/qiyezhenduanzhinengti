import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PruneDecisionRecordInput } from "../../src/storage/adapter";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  createSqliteStorageAdapter,
  type SqliteStorageAdapter,
} from "../../src/storage/sqlite-adapter";

describe("append-only prune decision ledger", () => {
  let db: SqliteDatabase;
  let storage: SqliteStorageAdapter;

  beforeEach(() => {
    const created = createSqliteStorageAdapter({
      filename: ":memory:",
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    });
    db = created.db;
    storage = created.adapter;
  });

  afterEach(() => db.close());

  const decision = (overrides: Partial<PruneDecisionRecordInput> = {}): PruneDecisionRecordInput => ({
    id: "prune_1",
    diagnosisId: "diag_1",
    reportId: "report_1",
    revisionId: null,
    stageRunId: "stage_claims_1",
    claimKind: "geoOpportunity",
    candidateRef: "geo_candidate_1",
    sourceIssueId: "iss_1",
    reasonCode: "MISSING_COVERAGE_PREFIX",
    guardRule: "SCOPE_LIMITATION_MISSING",
    evidenceIds: ["ev_1", "ev_2"],
    independentSupportSourceCount: 1,
    directCount: 0,
    partialCount: 2,
    contextCount: 0,
    coverageStatus: "SCOPE_LIMITATION_MISSING",
    createdAt: new Date("2026-07-19T12:00:00.000Z"),
    algorithmVersion: "round6-prune-audit.v1",
    ...overrides,
  });

  it("persists every required field and distinguishes missing measurement from missing prefix", async () => {
    await storage.appendPruneDecisions([
      decision(),
      decision({
        id: "prune_2",
        candidateRef: "geo_candidate_2",
        reasonCode: "NO_MEASUREMENT_COVERAGE",
        guardRule: "COVERAGE_NOT_ESTABLISHED",
        coverageStatus: "NOT_ESTABLISHED",
      }),
    ]);

    expect(await storage.getPruneDecisions("diag_1")).toEqual([
      decision(),
      decision({
        id: "prune_2",
        candidateRef: "geo_candidate_2",
        reasonCode: "NO_MEASUREMENT_COVERAGE",
        guardRule: "COVERAGE_NOT_ESTABLISHED",
        coverageStatus: "NOT_ESTABLISHED",
      }),
    ]);
  });

  it("is append-only and rolls back a duplicate batch without overwriting prior rows", async () => {
    await storage.appendPruneDecisions([decision()]);
    await expect(
      storage.appendPruneDecisions([
        decision({ id: "prune_2", candidateRef: "new" }),
        decision({ candidateRef: "attempted overwrite" }),
      ]),
    ).rejects.toThrow();

    expect(await storage.getPruneDecisions("diag_1")).toEqual([decision()]);
  });

  it("rejects ambiguous publication lineage", async () => {
    await expect(
      storage.appendPruneDecisions([decision({ revisionId: "revision_1" })]),
    ).rejects.toThrow("PRUNE_DECISION_EXACTLY_ONE_PUBLICATION_ID_REQUIRED");
    await expect(
      storage.appendPruneDecisions([decision({ reportId: null })]),
    ).rejects.toThrow("PRUNE_DECISION_EXACTLY_ONE_PUBLICATION_ID_REQUIRED");
  });
});
