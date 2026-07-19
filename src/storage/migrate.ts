// Schema-driven migration runner for the SQLite backend.
//
// The DDL is DERIVED from src/storage/schema.ts via drizzle's getTableConfig,
// so the column definitions live in exactly one place. Adding a table to
// schema.ts (or a column to an existing table) automatically extends the
// generated `CREATE TABLE IF NOT EXISTS` statements — no forked copy of the
// schema to keep in sync. `pnpm db:migrate` runs this against DATABASE_URL.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

export type SqliteDatabase = Database.Database;

/**
 * All tables declared in schema.ts, discovered by structural type so new
 * exports are picked up without editing this file.
 */
export function schemaTables(): SQLiteTable[] {
  return (Object.values(schema) as unknown[]).filter((v): v is SQLiteTable =>
    is(v, SQLiteTable),
  );
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function formatDefault(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Build `CREATE TABLE IF NOT EXISTS` DDL for one drizzle table. */
function buildColumnSql(col: SQLiteColumn): string {
  const parts = [quoteIdent(col.name), col.getSQLType()];
  if (col.primary) parts.push("PRIMARY KEY");
  if (col.notNull) parts.push("NOT NULL");
  if (col.hasDefault && col.default !== undefined) {
    parts.push(`DEFAULT ${formatDefault(col.default)}`);
  }
  return parts.join(" ");
}

export function buildCreateTableSql(table: SQLiteTable): string {
  const cfg = getTableConfig(table);
  const cols = cfg.columns.map((col) => `  ${buildColumnSql(col)}`);
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(cfg.name)} (\n${cols.join(",\n")}\n);`;
}

/** Add newly declared columns to an existing table without touching rows. */
function addMissingColumns(db: SqliteDatabase, table: SQLiteTable): void {
  const cfg = getTableConfig(table);
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${quoteIdent(cfg.name)})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  for (const column of cfg.columns) {
    if (!existing.has(column.name)) {
      db.exec(
        `ALTER TABLE ${quoteIdent(cfg.name)} ADD COLUMN ${buildColumnSql(column)};`,
      );
    }
  }
}

/**
 * Round-5.2C needs explicit NULL provenance for two missing legacy artifacts.
 * SQLite cannot drop NOT NULL in place, so rebuild only the affected ledger
 * once. Existing strict-resume rows and their hashes are copied byte-for-byte.
 */
function relaxAnalysisStageRunProvenance(db: SqliteDatabase): void {
  const tableName = "analysis_stage_runs";
  const columns = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const needsRebuild = columns.some(
    (column) =>
      (column.name === "competitor_resolution_hash" || column.name === "query_plan_hash") &&
      column.notnull === 1,
  );
  if (!needsRebuild) return;

  const legacy = "analysis_stage_runs_round_52b";
  const currentColumns = getTableConfig(schema.analysisStageRuns).columns.map((column) => column.name);
  const legacyColumns = new Set(columns.map((column) => column.name));
  const copiedColumns = currentColumns.filter((column) => legacyColumns.has(column));
  const list = copiedColumns.map(quoteIdent).join(", ");
  db.exec(`ALTER TABLE ${quoteIdent(tableName)} RENAME TO ${quoteIdent(legacy)};`);
  db.exec(buildCreateTableSql(schema.analysisStageRuns));
  db.exec(
    `INSERT INTO ${quoteIdent(tableName)} (${list}) SELECT ${list} FROM ${quoteIdent(legacy)};`,
  );
  db.exec(`DROP TABLE ${quoteIdent(legacy)};`);
}

/**
 * Lookup indexes the adapter relies on. Derived from column presence, not
 * hand-maintained per table: any table exposing these columns gets the index.
 */
function buildIndexStatements(table: SQLiteTable): string[] {
  const cfg = getTableConfig(table);
  const colNames = new Set(cfg.columns.map((c) => c.name));
  const stmts: string[] = [];
  if (colNames.has("diagnosis_id")) {
    stmts.push(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(
        `idx_${cfg.name}_diagnosis_id`,
      )} ON ${quoteIdent(cfg.name)} (${quoteIdent("diagnosis_id")});`,
    );
  }
  if (colNames.has("public_token")) {
    stmts.push(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(
        `idx_${cfg.name}_public_token`,
      )} ON ${quoteIdent(cfg.name)} (${quoteIdent("public_token")});`,
    );
  }
  return stmts;
}

/** Full ordered list of DDL statements needed to build the schema. */
export function buildSchemaSql(): string[] {
  const tables = schemaTables();
  const statements: string[] = [];
  for (const table of tables) statements.push(buildCreateTableSql(table));
  for (const table of tables) statements.push(...buildIndexStatements(table));
  return statements;
}

/** Create every table + index (idempotent) on the given connection. */
export function createSchema(db: SqliteDatabase): void {
  const tables = schemaTables();
  const run = db.transaction(() => {
    for (const table of tables) db.exec(buildCreateTableSql(table));
    for (const table of tables) addMissingColumns(db, table);
    relaxAnalysisStageRunProvenance(db);
    for (const table of tables) {
      for (const sql of buildIndexStatements(table)) db.exec(sql);
    }
  });
  run();
}

/**
 * Open a better-sqlite3 connection. Use `:memory:` for tests. For a file path,
 * the parent directory is created and pragmatic pragmas are applied.
 */
export function openDatabase(filename: string): SqliteDatabase {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Open (creating dirs as needed) and migrate a database file in one call. */
export function openMigratedDatabase(filename: string): SqliteDatabase {
  const db = openDatabase(filename);
  createSchema(db);
  return db;
}

const DEFAULT_DB_URL = "./data/dev.sqlite";

function resolveDbUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DB_URL;
}

/** CLI entry for `pnpm db:migrate`. */
function main(): void {
  const url = resolveDbUrl();
  const db = openDatabase(url);
  createSchema(db);
  const tables = schemaTables()
    .map((t) => getTableConfig(t).name)
    .sort();
  db.close();
  console.log(
    `[storage] migrate: applied schema to ${url} (${tables.length} tables: ${tables.join(", ")})`,
  );
}

// Run only when invoked directly (tsx src/storage/migrate.ts), never on import.
if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  main();
}
