import { afterEach, describe, expect, it } from "vitest";
import { createSchema, openDatabase, type SqliteDatabase } from "../../src/storage/migrate";
import { createSqliteStorageAdapter } from "../../src/storage/sqlite-adapter";

describe("Frozen-Evidence Reanalysis storage migration", () => {
  let db: SqliteDatabase | undefined;

  afterEach(() => db?.close());

  it("relaxes only missing legacy provenance and preserves a Round-5.2B stage row", () => {
    db = openDatabase(":memory:");
    db.exec(`
      CREATE TABLE analysis_stage_runs (
        id text PRIMARY KEY,
        diagnosis_id text NOT NULL,
        stage text NOT NULL,
        attempt integer NOT NULL,
        status text NOT NULL,
        input_hash text NOT NULL,
        evidence_registry_hash text NOT NULL,
        competitor_resolution_hash text NOT NULL,
        query_plan_hash text NOT NULL,
        output_json text,
        output_hash text,
        schema_version text NOT NULL,
        prompt_version text NOT NULL,
        provider_model text NOT NULL,
        provider_usage_id text,
        started_at integer NOT NULL,
        completed_at integer,
        error_category text,
        error_metadata_json text
      );
      INSERT INTO analysis_stage_runs VALUES (
        'legacy-run', 'diag_legacy', 'REPORT_PROFILE', 0, 'SUCCEEDED',
        'input', 'evidence', 'competitor', 'query', '{}',
        '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        'schema', 'prompt', 'model', NULL, 1, 2, NULL, NULL
      );
    `);
    createSchema(db);
    const columns = db.prepare("PRAGMA table_info(analysis_stage_runs)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns.find((column) => column.name === "competitor_resolution_hash")?.notnull).toBe(0);
    expect(columns.find((column) => column.name === "query_plan_hash")?.notnull).toBe(0);
    expect(columns.some((column) => column.name === "frozen_evidence_snapshot_hash")).toBe(true);
    expect(db.prepare("SELECT * FROM analysis_stage_runs").get()).toMatchObject({
      id: "legacy-run",
      competitor_resolution_hash: "competitor",
      query_plan_hash: "query",
      frozen_evidence_snapshot_hash: null,
    });
    createSchema(db);
    expect(
      (db.prepare("SELECT COUNT(*) count FROM analysis_stage_runs").get() as { count: number }).count,
    ).toBe(1);
  });

  it("persists explicit recovery mode, missing provenance and Snapshot hash", async () => {
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    const storage = created.adapter;
    await storage.createDiagnosisRequest({
      id: "diag_snapshot",
      inputJson: "{}",
      publicToken: "private",
    });
    await storage.updateDiagnosisStatus("diag_snapshot", "FAILED");
    const snapshotJson = '{"diagnosisId":"diag_snapshot"}';
    const snapshotHash = "f".repeat(64);
    await storage.beginAnalysisRepairAttempt({
      diagnosisId: "diag_snapshot",
      repairAttempt: 1,
      originalFailureStage: "REPORT_CLAIMS_FAILED",
      authorizedAt: new Date("2026-07-19T08:00:00.000Z"),
      reusedStages: [],
      rerunStages: [
        "REPORT_PROFILE",
        "REPORT_SCORING",
        "REPORT_AI_VISIBILITY",
        "REPORT_CLAIMS",
      ],
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      missingHistoricalProvenance: ["QUERY_PLAN_HASH", "COMPETITOR_RESOLUTION_HASH"],
      frozenEvidenceSnapshotJson: snapshotJson,
      frozenEvidenceSnapshotHash: snapshotHash,
    });
    expect((await storage.getAnalysisRepairAttempts("diag_snapshot"))[0]).toMatchObject({
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      missingHistoricalProvenance: ["QUERY_PLAN_HASH", "COMPETITOR_RESOLUTION_HASH"],
      frozenEvidenceSnapshotJson: snapshotJson,
      frozenEvidenceSnapshotHash: snapshotHash,
    });
  });
});
