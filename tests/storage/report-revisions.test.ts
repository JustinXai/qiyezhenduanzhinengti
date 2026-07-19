import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import type { SqliteDatabase } from "../../src/storage/migrate";
import {
  applyReportRevisionSchema,
  canonicalReportJson,
  hashCanonicalReport,
  SqliteReportRevisionRepository,
} from "../../src/storage/report-revisions";
import { createSqliteStorageAdapter } from "../../src/storage/sqlite-adapter";
import type { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";

describe("append-only report revisions", () => {
  let db: SqliteDatabase;
  let repository: SqliteReportRevisionRepository;
  let storage: SqliteStorageAdapter;
  const original = buildSampleReport();

  beforeEach(async () => {
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    storage = created.adapter;
    applyReportRevisionSchema(db);
    await storage.createDiagnosisRequest({
      id: original.diagnosisId,
      inputJson: "{}",
      publicToken: original.publicToken,
    });
    await storage.saveReport({
      id: "report_original",
      diagnosisId: original.diagnosisId,
      reportContractVersion: original.reportContractVersion,
      scoreContractVersion: original.scoreContractVersion,
      canonicalJson: canonicalReportJson(original),
    });
    let sequence = 0;
    repository = new SqliteReportRevisionRepository(db, {
      now: () => new Date("2026-07-19T12:00:00.000Z"),
      idFactory: () => `revision_${++sequence}`,
    });
  });

  afterEach(() => db.close());

  it("appends revision 1 while preserving the original Canonical row byte-for-byte", async () => {
    const originalJsonBefore = (
      db.prepare("SELECT canonical_json FROM reports WHERE id = ?").get("report_original") as {
        canonical_json: string;
      }
    ).canonical_json;
    const revised = buildSampleReport({ coreIssues: [], geoOpportunities: [] });
    const revision = await repository.append({
      diagnosisId: original.diagnosisId,
      expectedParentReportId: "report_original",
      revisionReason: "Round-5.3 Quick DIRECT policy",
      algorithmVersion: "round53-finalizer.v1",
      canonicalJson: canonicalReportJson(revised),
      prunedClaims: [
        { kind: "coreIssue", ref: "iss_1", reasonCode: "INSUFFICIENT_INDEPENDENT_SUPPORT" },
      ],
    });
    expect(revision).toMatchObject({
      id: "revision_1",
      revisionNumber: 1,
      parentReportId: "report_original",
      originalReportHash: hashCanonicalReport(original),
      newReportHash: hashCanonicalReport(revised),
      prunedClaims: [
        { kind: "coreIssue", ref: "iss_1", reasonCode: "INSUFFICIENT_INDEPENDENT_SUPPORT" },
      ],
    });
    const originalJsonAfter = (
      db.prepare("SELECT canonical_json FROM reports WHERE id = ?").get("report_original") as {
        canonical_json: string;
      }
    ).canonical_json;
    expect(originalJsonAfter).toBe(originalJsonBefore);
    expect(
      (db.prepare("SELECT COUNT(*) count FROM reports").get() as { count: number }).count,
    ).toBe(2);
    expect((await storage.getReport(original.diagnosisId))?.id).toBe(revision.id);
    expect((await storage.getReport(original.diagnosisId))?.canonicalJson).toBe(
      revision.canonicalJson,
    );
    expect((await repository.list(original.diagnosisId))[0]?.prunedClaims).toEqual([
      { kind: "coreIssue", ref: "iss_1", reasonCode: "INSUFFICIENT_INDEPENDENT_SUPPORT" },
    ]);
  });

  it("increments revisions and points each parent to the preceding immutable revision", async () => {
    const firstReport = buildSampleReport({ coreIssues: original.coreIssues.slice(0, 2) });
    const first = await repository.append({
      diagnosisId: original.diagnosisId,
      expectedParentReportId: "report_original",
      revisionReason: "first",
      algorithmVersion: "round53-finalizer.v1",
      canonicalJson: canonicalReportJson(firstReport),
      prunedClaims: [],
    });
    const secondReport = buildSampleReport({ coreIssues: original.coreIssues.slice(0, 1) });
    const second = await repository.append({
      diagnosisId: original.diagnosisId,
      expectedParentReportId: first.id,
      revisionReason: "second",
      algorithmVersion: "round53-finalizer.v1",
      canonicalJson: canonicalReportJson(secondReport),
      prunedClaims: [],
    });
    expect(second).toMatchObject({
      revisionNumber: 2,
      parentReportId: first.id,
      originalReportHash: hashCanonicalReport(original),
    });
    expect((await repository.list(original.diagnosisId)).map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("fails stale-parent and no-change attempts without modifying history", async () => {
    await expect(
      repository.append({
        diagnosisId: original.diagnosisId,
        expectedParentReportId: "stale",
        revisionReason: "stale",
        algorithmVersion: "round53-finalizer.v1",
        canonicalJson: canonicalReportJson(buildSampleReport({ coreIssues: [] })),
        prunedClaims: [],
      }),
    ).rejects.toThrow("REPORT_REVISION_PARENT_MISMATCH");
    await expect(
      repository.append({
        diagnosisId: original.diagnosisId,
        expectedParentReportId: "report_original",
        revisionReason: "same",
        algorithmVersion: "round53-finalizer.v1",
        canonicalJson: canonicalReportJson(original),
        prunedClaims: [],
      }),
    ).rejects.toThrow("REPORT_REVISION_NO_CHANGE");
    expect(await repository.list(original.diagnosisId)).toEqual([]);
  });
});
