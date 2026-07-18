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
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
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
export function buildCreateTableSql(table: SQLiteTable): string {
  const cfg = getTableConfig(table);
  const cols = cfg.columns.map((col) => {
    const parts = [quoteIdent(col.name), col.getSQLType()];
    if (col.primary) parts.push("PRIMARY KEY");
    if (col.notNull) parts.push("NOT NULL");
    if (col.hasDefault && col.default !== undefined) {
      parts.push(`DEFAULT ${formatDefault(col.default)}`);
    }
    return "  " + parts.join(" ");
  });
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(cfg.name)} (\n${cols.join(",\n")}\n);`;
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
  const run = db.transaction((statements: string[]) => {
    for (const sql of statements) db.exec(sql);
  });
  run(buildSchemaSql());
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
