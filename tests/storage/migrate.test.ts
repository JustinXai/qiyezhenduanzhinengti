import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  buildCreateTableSql,
  buildSchemaSql,
  createSchema,
  openDatabase,
  schemaTables,
} from "../../src/storage/migrate";

describe("schema-driven migrate", () => {
  it("discovers every table declared in schema.ts", () => {
    const names = schemaTables()
      .map((t) => getTableConfig(t).name)
      .sort();
    expect(names).toEqual([
      "analysis_checkpoints",
      "analysis_repair_attempts",
      "analysis_stage_runs",
      "claim_evidence_relations",
      "diagnosis_requests",
      "evidence",
      "provider_usage",
      "reports",
    ]);
  });

  it("derives CREATE TABLE DDL from the schema columns (not a forked copy)", () => {
    const table = schemaTables().find(
      (t) => getTableConfig(t).name === "provider_usage",
    )!;
    const ddl = buildCreateTableSql(table);
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "provider_usage"');
    expect(ddl).toContain('"id" text PRIMARY KEY NOT NULL');
    // default carried through from schema.ts (.default(0))
    expect(ddl).toContain('"call_count" integer NOT NULL DEFAULT 0');
    expect(ddl).toContain('"cost_estimate" real');
  });

  it("creates all tables in a fresh database", () => {
    const db = openDatabase(":memory:");
    createSchema(db);
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual([
      "analysis_checkpoints",
      "analysis_repair_attempts",
      "analysis_stage_runs",
      "claim_evidence_relations",
      "diagnosis_requests",
      "evidence",
      "provider_usage",
      "reports",
    ]);
    db.close();
  });

  it("is idempotent (re-running does not throw)", () => {
    const db = openDatabase(":memory:");
    createSchema(db);
    expect(() => createSchema(db)).not.toThrow();
    db.close();
  });

  it("emits lookup indexes for diagnosis_id and public_token", () => {
    const sql = buildSchemaSql().join("\n");
    expect(sql).toContain("idx_evidence_diagnosis_id");
    expect(sql).toContain("idx_diagnosis_requests_public_token");
  });
});
