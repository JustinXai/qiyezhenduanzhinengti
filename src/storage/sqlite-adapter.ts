// better-sqlite3 implementation of StorageAdapter.
//
// Uses raw prepared statements (not the drizzle query builder) for tight
// control over serialization; the schema itself is still the single source of
// truth via migrate.ts. Timestamps are stored as unix SECONDS to match the
// drizzle `integer({ mode: "timestamp" })` convention in schema.ts.

import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./migrate";
import { createSchema, openDatabase } from "./migrate";
import type {
  DiagnosisRequestRecord,
  DiagnosisStatus,
  EvidenceRecord,
  EvidenceRecordInput,
  ProviderUsageInput,
  ProviderUsageRecord,
  SaveReportInput,
  StorageAdapter,
  StoredReport,
} from "./adapter";

function toDbTime(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function fromDbTime(seconds: number): Date {
  return new Date(seconds * 1000);
}

interface DiagnosisRow {
  id: string;
  status: string;
  input_json: string;
  public_token: string;
  created_at: number;
  updated_at: number;
}

interface EvidenceRow {
  id: string;
  diagnosis_id: string;
  source_type: string;
  source_domain: string;
  url: string;
  title: string | null;
  snippet: string | null;
  authority_level: string | null;
  support_level: string | null;
  fetched_at: number;
}

interface ReportRow {
  id: string;
  diagnosis_id: string;
  report_contract_version: string;
  score_contract_version: string;
  canonical_json: string;
  created_at: number;
}

interface ProviderUsageRow {
  id: string;
  diagnosis_id: string;
  provider: string;
  stage: string;
  call_count: number;
  retry_count: number;
  error_code: string | null;
  cost_estimate: number | null;
  created_at: number;
}

interface CheckpointRow {
  output_json: string;
}

export interface SqliteStorageAdapterOptions {
  /** Injected clock for deterministic timestamps in tests. */
  now?: () => Date;
  /** Id generator for rows that need a synthetic primary key. */
  idFactory?: () => string;
}

export class SqliteStorageAdapter implements StorageAdapter {
  private readonly db: SqliteDatabase;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(db: SqliteDatabase, opts: SqliteStorageAdapterOptions = {}) {
    this.db = db;
    this.now = opts.now ?? (() => new Date());
    this.idFactory = opts.idFactory ?? (() => randomUUID());
  }

  // -- diagnosis_requests -----------------------------------------------------

  async createDiagnosisRequest(input: {
    id: string;
    inputJson: string;
    publicToken: string;
  }): Promise<void> {
    const ts = toDbTime(this.now());
    this.db
      .prepare(
        `INSERT INTO diagnosis_requests
           (id, status, input_json, public_token, created_at, updated_at)
         VALUES (@id, @status, @input_json, @public_token, @created_at, @updated_at)`,
      )
      .run({
        id: input.id,
        status: "CREATED" satisfies DiagnosisStatus,
        input_json: input.inputJson,
        public_token: input.publicToken,
        created_at: ts,
        updated_at: ts,
      });
  }

  async updateDiagnosisStatus(id: string, status: DiagnosisStatus): Promise<void> {
    const info = this.db
      .prepare(
        `UPDATE diagnosis_requests SET status = @status, updated_at = @updated_at WHERE id = @id`,
      )
      .run({ id, status, updated_at: toDbTime(this.now()) });
    if (info.changes === 0) {
      throw new Error(`updateDiagnosisStatus: no diagnosis_request with id ${id}`);
    }
  }

  async getDiagnosisRequest(id: string): Promise<DiagnosisRequestRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM diagnosis_requests WHERE id = ?`)
      .get(id) as DiagnosisRow | undefined;
    return row ? this.mapDiagnosisRow(row) : null;
  }

  async getDiagnosisRequestByPublicToken(
    publicToken: string,
  ): Promise<DiagnosisRequestRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM diagnosis_requests WHERE public_token = ?`)
      .get(publicToken) as DiagnosisRow | undefined;
    return row ? this.mapDiagnosisRow(row) : null;
  }

  private mapDiagnosisRow(row: DiagnosisRow): DiagnosisRequestRecord {
    return {
      id: row.id,
      status: row.status as DiagnosisStatus,
      inputJson: row.input_json,
      publicToken: row.public_token,
      createdAt: fromDbTime(row.created_at),
      updatedAt: fromDbTime(row.updated_at),
    };
  }

  // -- evidence ---------------------------------------------------------------

  async saveEvidence(items: EvidenceRecordInput[]): Promise<void> {
    if (items.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO evidence
         (id, diagnosis_id, source_type, source_domain, url, title, snippet,
          authority_level, support_level, fetched_at)
       VALUES
         (@id, @diagnosis_id, @source_type, @source_domain, @url, @title, @snippet,
          @authority_level, @support_level, @fetched_at)
       ON CONFLICT(id) DO UPDATE SET
         diagnosis_id = excluded.diagnosis_id,
         source_type = excluded.source_type,
         source_domain = excluded.source_domain,
         url = excluded.url,
         title = excluded.title,
         snippet = excluded.snippet,
         authority_level = excluded.authority_level,
         support_level = excluded.support_level,
         fetched_at = excluded.fetched_at`,
    );
    const insertAll = this.db.transaction((rows: EvidenceRecordInput[]) => {
      for (const it of rows) {
        stmt.run({
          id: it.id,
          diagnosis_id: it.diagnosisId,
          source_type: it.sourceType,
          source_domain: it.sourceDomain,
          url: it.url,
          title: it.title,
          snippet: it.snippet,
          authority_level: it.authorityLevel,
          support_level: it.supportLevel,
          fetched_at: toDbTime(it.fetchedAt),
        });
      }
    });
    insertAll(items);
  }

  async getEvidence(diagnosisId: string): Promise<EvidenceRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM evidence WHERE diagnosis_id = ? ORDER BY id`)
      .all(diagnosisId) as EvidenceRow[];
    return rows.map((row) => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      sourceType: row.source_type,
      sourceDomain: row.source_domain,
      url: row.url,
      title: row.title,
      snippet: row.snippet,
      authorityLevel: row.authority_level,
      supportLevel: row.support_level,
      fetchedAt: fromDbTime(row.fetched_at),
    }));
  }

  // -- reports ----------------------------------------------------------------

  async saveReport(input: SaveReportInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO reports
           (id, diagnosis_id, report_contract_version, score_contract_version,
            canonical_json, created_at)
         VALUES
           (@id, @diagnosis_id, @report_contract_version, @score_contract_version,
            @canonical_json, @created_at)
         ON CONFLICT(id) DO UPDATE SET
           diagnosis_id = excluded.diagnosis_id,
           report_contract_version = excluded.report_contract_version,
           score_contract_version = excluded.score_contract_version,
           canonical_json = excluded.canonical_json,
           created_at = excluded.created_at`,
      )
      .run({
        id: input.id,
        diagnosis_id: input.diagnosisId,
        report_contract_version: input.reportContractVersion,
        score_contract_version: input.scoreContractVersion,
        canonical_json: input.canonicalJson,
        created_at: toDbTime(this.now()),
      });
  }

  async getReport(diagnosisId: string): Promise<StoredReport | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM reports WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(diagnosisId) as ReportRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      diagnosisId: row.diagnosis_id,
      reportContractVersion: row.report_contract_version,
      scoreContractVersion: row.score_contract_version,
      canonicalJson: row.canonical_json,
      createdAt: fromDbTime(row.created_at),
    };
  }

  // -- provider_usage ---------------------------------------------------------

  async recordProviderUsage(input: ProviderUsageInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO provider_usage
           (id, diagnosis_id, provider, stage, call_count, retry_count,
            error_code, cost_estimate, created_at)
         VALUES
           (@id, @diagnosis_id, @provider, @stage, @call_count, @retry_count,
            @error_code, @cost_estimate, @created_at)`,
      )
      .run({
        id: input.id,
        diagnosis_id: input.diagnosisId,
        provider: input.provider,
        stage: input.stage,
        call_count: input.callCount ?? 0,
        retry_count: input.retryCount ?? 0,
        error_code: input.errorCode ?? null,
        cost_estimate: input.costEstimate ?? null,
        created_at: toDbTime(this.now()),
      });
  }

  async getProviderUsage(diagnosisId: string): Promise<ProviderUsageRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM provider_usage WHERE diagnosis_id = ? ORDER BY created_at, id`,
      )
      .all(diagnosisId) as ProviderUsageRow[];
    return rows.map((row) => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      provider: row.provider,
      stage: row.stage,
      callCount: row.call_count,
      retryCount: row.retry_count,
      errorCode: row.error_code,
      costEstimate: row.cost_estimate,
      createdAt: fromDbTime(row.created_at),
    }));
  }

  // -- analysis_checkpoints ---------------------------------------------------

  async saveCheckpoint(checkpoint: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    outputJson: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO analysis_checkpoints
           (id, diagnosis_id, stage, input_hash, output_json,
            report_contract_version, score_contract_version, provider_model,
            prompt_version, trust_guard_version, completed_at)
         VALUES
           (@id, @diagnosis_id, @stage, @input_hash, @output_json,
            @report_contract_version, @score_contract_version, @provider_model,
            @prompt_version, @trust_guard_version, @completed_at)`,
      )
      .run({
        id: this.idFactory(),
        diagnosis_id: checkpoint.diagnosisId,
        stage: checkpoint.stage,
        input_hash: checkpoint.inputHash,
        output_json: checkpoint.outputJson,
        report_contract_version: checkpoint.reportContractVersion,
        score_contract_version: checkpoint.scoreContractVersion,
        provider_model: checkpoint.providerModel,
        prompt_version: checkpoint.promptVersion,
        trust_guard_version: checkpoint.trustGuardVersion,
        completed_at: toDbTime(this.now()),
      });
  }

  async findReusableCheckpoint(query: {
    diagnosisId: string;
    stage: string;
    inputHash: string;
    reportContractVersion: string;
    scoreContractVersion: string;
    providerModel: string;
    promptVersion: string;
    trustGuardVersion: string;
  }): Promise<{ outputJson: string } | null> {
    const row = this.db
      .prepare(
        `SELECT output_json FROM analysis_checkpoints
         WHERE diagnosis_id = @diagnosis_id
           AND stage = @stage
           AND input_hash = @input_hash
           AND report_contract_version = @report_contract_version
           AND score_contract_version = @score_contract_version
           AND provider_model = @provider_model
           AND prompt_version = @prompt_version
           AND trust_guard_version = @trust_guard_version
         ORDER BY completed_at DESC
         LIMIT 1`,
      )
      .get({
        diagnosis_id: query.diagnosisId,
        stage: query.stage,
        input_hash: query.inputHash,
        report_contract_version: query.reportContractVersion,
        score_contract_version: query.scoreContractVersion,
        provider_model: query.providerModel,
        prompt_version: query.promptVersion,
        trust_guard_version: query.trustGuardVersion,
      }) as CheckpointRow | undefined;
    return row ? { outputJson: row.output_json } : null;
  }
}

/**
 * Convenience factory: open (and by default migrate) a database, returning a
 * ready adapter. Pass `filename: ":memory:"` for isolated test databases.
 */
export function createSqliteStorageAdapter(
  opts: {
    filename?: string;
    migrate?: boolean;
  } & SqliteStorageAdapterOptions = {},
): { adapter: SqliteStorageAdapter; db: SqliteDatabase } {
  const { filename = ":memory:", migrate = true, ...adapterOpts } = opts;
  const db = openDatabase(filename);
  if (migrate) createSchema(db);
  const adapter = new SqliteStorageAdapter(db, adapterOpts);
  return { adapter, db };
}
