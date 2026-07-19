// better-sqlite3 implementation of StorageAdapter.
//
// Uses raw prepared statements (not the drizzle query builder) for tight
// control over serialization; the schema itself is still the single source of
// truth via migrate.ts. Timestamps are stored as unix SECONDS to match the
// drizzle `integer({ mode: "timestamp" })` convention in schema.ts.

import { createHash, randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./migrate";
import { createSchema, openDatabase } from "./migrate";
import type {
  ClaimEvidenceRelationRecord,
  ClaimEvidenceRelationRecordInput,
  ClaimPublicationDecisionBatchInput,
  ClaimPublicationDecisionRecord,
  ClaimPublicationStatus,
  ClaimPublicationCandidateSourceProvenance,
  AnalysisCheckpointRecord,
  AnalysisRepairAttemptRecord,
  AnalysisRepairStatus,
  AnalysisRecoveryReusedStage,
  AnalysisStage,
  AnalysisStageRunRecord,
  AnalysisStageRunStatus,
  BeginAnalysisRepairAttemptInput,
  DiagnosisRequestRecord,
  DiagnosisStatus,
  EvidenceRecord,
  EvidenceRecordInput,
  ProviderUsageInput,
  ProviderUsageRecord,
  PruneDecisionRecord,
  PruneDecisionRecordInput,
  PruneDecisionReasonCode,
  PruneDecisionCoverageStatus,
  SaveReportInput,
  StartAnalysisStageRunInput,
  StorageAdapter,
  StoredReport,
} from "./adapter";
import {
  insertClaimPublicationDecisionBatch,
  validateClaimPublicationDecisionBatch,
} from "./claim-publication-decisions";

function toDbTime(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function fromDbTime(seconds: number): Date {
  return new Date(seconds * 1000);
}

function validatePruneDecision(item: PruneDecisionRecordInput): void {
  if ((item.reportId === null) === (item.revisionId === null)) {
    throw new Error("PRUNE_DECISION_EXACTLY_ONE_PUBLICATION_ID_REQUIRED");
  }
  for (const [field, value] of [
    ["diagnosisId", item.diagnosisId],
    ["stageRunId", item.stageRunId],
    ["claimKind", item.claimKind],
    ["candidateRef", item.candidateRef],
    ["guardRule", item.guardRule],
    ["algorithmVersion", item.algorithmVersion],
  ] as const) {
    if (value.trim().length === 0) throw new Error(`PRUNE_DECISION_${field.toUpperCase()}_REQUIRED`);
  }
  for (const [field, value] of [
    ["independentSupportSourceCount", item.independentSupportSourceCount],
    ["directCount", item.directCount],
    ["partialCount", item.partialCount],
    ["contextCount", item.contextCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`PRUNE_DECISION_${field.toUpperCase()}_INVALID`);
    }
  }
  if (new Set(item.evidenceIds).size !== item.evidenceIds.length) {
    throw new Error("PRUNE_DECISION_EVIDENCE_IDS_DUPLICATED");
  }
  if (Number.isNaN(item.createdAt.getTime())) throw new Error("PRUNE_DECISION_CREATED_AT_INVALID");
}

function parseEvidenceIds(serialized: string): string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("PRUNE_DECISION_EVIDENCE_IDS_CORRUPT");
  }
  return parsed;
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
  id?: string;
  diagnosis_id?: string;
  stage?: string;
  input_hash?: string;
  output_json: string;
  report_contract_version?: string;
  score_contract_version?: string;
  provider_model?: string;
  prompt_version?: string;
  trust_guard_version?: string;
  completed_at?: number;
}

interface ClaimEvidenceRelationRow {
  id: string;
  diagnosis_id: string;
  claim_id: string;
  claim_kind: string;
  evidence_id: string;
  support_level: string;
  confidence: number;
  justification: string | null;
  basis: string;
  verifier_mode: string;
  verifier_version: string;
  created_at: number;
}

interface PruneDecisionRow {
  id: string;
  diagnosis_id: string;
  report_id: string | null;
  revision_id: string | null;
  stage_run_id: string;
  claim_kind: string;
  candidate_ref: string;
  source_issue_id: string | null;
  reason_code: string;
  guard_rule: string;
  evidence_ids_json: string;
  independent_support_source_count: number;
  direct_count: number;
  partial_count: number;
  context_count: number;
  coverage_status: string;
  created_at: number;
  algorithm_version: string;
}

interface ClaimPublicationDecisionRow {
  id: string;
  diagnosis_id: string;
  report_id: string | null;
  revision_id: string | null;
  stage_run_id: string | null;
  legacy_checkpoint_id: string | null;
  candidate_source_provenance: string;
  candidate_source_payload_hash: string;
  candidate_ref: string;
  claim_kind: string;
  publication_status: string;
  reason_code: string;
  guard_rule: string;
  evidence_ids_json: string;
  direct_count: number;
  partial_count: number;
  context_count: number;
  independent_support_source_count: number;
  coverage_status: string;
  algorithm_version: string;
  created_at: number;
}

interface AnalysisStageRunRow {
  id: string;
  diagnosis_id: string;
  stage: string;
  attempt: number;
  status: string;
  input_hash: string;
  evidence_registry_hash: string;
  competitor_resolution_hash: string | null;
  query_plan_hash: string | null;
  frozen_evidence_snapshot_hash: string | null;
  output_json: string | null;
  output_hash: string | null;
  schema_version: string;
  prompt_version: string;
  provider_model: string;
  provider_usage_id: string | null;
  started_at: number;
  completed_at: number | null;
  error_category: string | null;
  error_metadata_json: string | null;
}

interface AnalysisRepairAttemptRow {
  diagnosis_id: string;
  repair_attempt: number;
  original_failure_stage: string;
  authorized_at: number;
  started_at: number;
  completed_at: number | null;
  status: string;
  reused_stages: string;
  rerun_stages: string;
  provider_call_delta: number;
  result_state: string | null;
  failure_category: string | null;
  recovery_mode: string;
  missing_historical_provenance: string;
  frozen_evidence_snapshot_json: string | null;
  frozen_evidence_snapshot_hash: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Defense in depth: only non-sensitive, bounded diagnostic fields persist. */
function sanitizeStoredErrorMetadata(serialized: string): string {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return "{}";
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of ["errorName", "providerErrorCode", "issueCount", "issuePaths"]) {
    const candidate = source[key];
    if (typeof candidate === "string") sanitized[key] = candidate.slice(0, 160);
    if (typeof candidate === "number" && Number.isFinite(candidate)) sanitized[key] = candidate;
    if (
      key === "issuePaths" &&
      Array.isArray(candidate) &&
      candidate.every((item) => typeof item === "string")
    ) {
      sanitized[key] = candidate.slice(0, 20).map((item) => item.slice(0, 120));
    }
  }
  return JSON.stringify(sanitized);
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

  async countDiagnosisRequests(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM diagnosis_requests`).get() as {
      count: number;
    };
    return row.count;
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
        `SELECT * FROM reports
         WHERE diagnosis_id = ?
         ORDER BY rowid DESC
         LIMIT 1`,
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

  // -- claim_evidence_relations -----------------------------------------------

  async saveClaimEvidenceRelations(
    items: ClaimEvidenceRelationRecordInput[],
  ): Promise<void> {
    if (items.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO claim_evidence_relations
         (id, diagnosis_id, claim_id, claim_kind, evidence_id, support_level,
          confidence, justification, basis, verifier_mode, verifier_version, created_at)
       VALUES
         (@id, @diagnosis_id, @claim_id, @claim_kind, @evidence_id, @support_level,
          @confidence, @justification, @basis, @verifier_mode, @verifier_version, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         diagnosis_id = excluded.diagnosis_id,
         claim_id = excluded.claim_id,
         claim_kind = excluded.claim_kind,
         evidence_id = excluded.evidence_id,
         support_level = excluded.support_level,
         confidence = excluded.confidence,
         justification = excluded.justification,
         basis = excluded.basis,
         verifier_mode = excluded.verifier_mode,
         verifier_version = excluded.verifier_version,
         created_at = excluded.created_at`,
    );
    const ts = toDbTime(this.now());
    const insertAll = this.db.transaction((rows: ClaimEvidenceRelationRecordInput[]) => {
      for (const it of rows) {
        stmt.run({
          id: it.id,
          diagnosis_id: it.diagnosisId,
          claim_id: it.claimId,
          claim_kind: it.claimKind,
          evidence_id: it.evidenceId,
          support_level: it.supportLevel,
          confidence: it.confidence,
          justification: it.justification,
          basis: it.basis,
          verifier_mode: it.verifierMode,
          verifier_version: it.verifierVersion,
          created_at: ts,
        });
      }
    });
    insertAll(items);
  }

  async getClaimEvidenceRelations(
    diagnosisId: string,
  ): Promise<ClaimEvidenceRelationRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM claim_evidence_relations WHERE diagnosis_id = ? ORDER BY claim_id, evidence_id`,
      )
      .all(diagnosisId) as ClaimEvidenceRelationRow[];
    return rows.map((row) => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      claimId: row.claim_id,
      claimKind: row.claim_kind,
      evidenceId: row.evidence_id,
      supportLevel: row.support_level,
      confidence: row.confidence,
      justification: row.justification,
      basis: row.basis,
      verifierMode: row.verifier_mode,
      verifierVersion: row.verifier_version,
      createdAt: fromDbTime(row.created_at),
    }));
  }

  // -- prune_decisions -------------------------------------------------------

  async appendPruneDecisions(items: PruneDecisionRecordInput[]): Promise<void> {
    if (items.length === 0) return;
    for (const item of items) validatePruneDecision(item);
    const insert = this.db.prepare(
      `INSERT INTO prune_decisions
         (id, diagnosis_id, report_id, revision_id, stage_run_id, claim_kind,
          candidate_ref, source_issue_id, reason_code, guard_rule,
          evidence_ids_json, independent_support_source_count, direct_count,
          partial_count, context_count, coverage_status, created_at,
          algorithm_version)
       VALUES
         (@id, @diagnosis_id, @report_id, @revision_id, @stage_run_id, @claim_kind,
          @candidate_ref, @source_issue_id, @reason_code, @guard_rule,
          @evidence_ids_json, @independent_support_source_count, @direct_count,
          @partial_count, @context_count, @coverage_status, @created_at,
          @algorithm_version)`,
    );
    const append = this.db.transaction((records: PruneDecisionRecordInput[]) => {
      for (const item of records) {
        insert.run({
          id: item.id,
          diagnosis_id: item.diagnosisId,
          report_id: item.reportId,
          revision_id: item.revisionId,
          stage_run_id: item.stageRunId,
          claim_kind: item.claimKind,
          candidate_ref: item.candidateRef,
          source_issue_id: item.sourceIssueId,
          reason_code: item.reasonCode,
          guard_rule: item.guardRule,
          evidence_ids_json: JSON.stringify(item.evidenceIds),
          independent_support_source_count: item.independentSupportSourceCount,
          direct_count: item.directCount,
          partial_count: item.partialCount,
          context_count: item.contextCount,
          coverage_status: item.coverageStatus,
          created_at: toDbTime(item.createdAt),
          algorithm_version: item.algorithmVersion,
        });
      }
    });
    append(items);
  }

  async getPruneDecisions(diagnosisId: string): Promise<PruneDecisionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM prune_decisions
         WHERE diagnosis_id = ? ORDER BY created_at, rowid`,
      )
      .all(diagnosisId) as PruneDecisionRow[];
    return rows.map((row) => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      reportId: row.report_id,
      revisionId: row.revision_id,
      stageRunId: row.stage_run_id,
      claimKind: row.claim_kind,
      candidateRef: row.candidate_ref,
      sourceIssueId: row.source_issue_id,
      reasonCode: row.reason_code as PruneDecisionReasonCode,
      guardRule: row.guard_rule,
      evidenceIds: parseEvidenceIds(row.evidence_ids_json),
      independentSupportSourceCount: row.independent_support_source_count,
      directCount: row.direct_count,
      partialCount: row.partial_count,
      contextCount: row.context_count,
      coverageStatus: row.coverage_status as PruneDecisionCoverageStatus,
      createdAt: fromDbTime(row.created_at),
      algorithmVersion: row.algorithm_version,
    }));
  }

  // -- claim_publication_decisions ------------------------------------------

  async appendClaimPublicationDecisionBatch(
    batch: ClaimPublicationDecisionBatchInput,
  ): Promise<void> {
    validateClaimPublicationDecisionBatch(batch);
    const append = this.db.transaction((input: ClaimPublicationDecisionBatchInput) => {
      insertClaimPublicationDecisionBatch(this.db, input);
    });
    append(batch);
  }

  async getClaimPublicationDecisions(
    diagnosisId: string,
  ): Promise<ClaimPublicationDecisionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM claim_publication_decisions
         WHERE diagnosis_id = ? ORDER BY created_at, rowid`,
      )
      .all(diagnosisId) as ClaimPublicationDecisionRow[];
    return rows.map((row) => ({
      id: row.id,
      diagnosisId: row.diagnosis_id,
      reportId: row.report_id,
      revisionId: row.revision_id,
      stageRunId: row.stage_run_id,
      legacyCheckpointId: row.legacy_checkpoint_id,
      candidateSourceProvenance:
        row.candidate_source_provenance as ClaimPublicationCandidateSourceProvenance,
      candidateSourcePayloadHash: row.candidate_source_payload_hash,
      candidateRef: row.candidate_ref,
      claimKind: row.claim_kind,
      publicationStatus: row.publication_status as ClaimPublicationStatus,
      reasonCode: row.reason_code,
      guardRule: row.guard_rule,
      evidenceIds: parseEvidenceIds(row.evidence_ids_json),
      directCount: row.direct_count,
      partialCount: row.partial_count,
      contextCount: row.context_count,
      independentSupportSourceCount: row.independent_support_source_count,
      coverageStatus: row.coverage_status as PruneDecisionCoverageStatus,
      algorithmVersion: row.algorithm_version,
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

  async getLatestCheckpoint(
    diagnosisId: string,
    stage: string,
  ): Promise<AnalysisCheckpointRecord | null> {
    const row = this.db
      .prepare(
        `SELECT id, diagnosis_id, stage, input_hash, output_json,
                report_contract_version, score_contract_version, provider_model,
                prompt_version, trust_guard_version, completed_at
         FROM analysis_checkpoints
         WHERE diagnosis_id = ? AND stage = ?
         ORDER BY completed_at DESC LIMIT 1`,
      )
      .get(diagnosisId, stage) as CheckpointRow | undefined;
    if (
      !row ||
      row.id === undefined ||
      row.diagnosis_id === undefined ||
      row.stage === undefined ||
      row.input_hash === undefined ||
      row.report_contract_version === undefined ||
      row.score_contract_version === undefined ||
      row.provider_model === undefined ||
      row.prompt_version === undefined ||
      row.trust_guard_version === undefined ||
      row.completed_at === undefined
    ) {
      return null;
    }
    return {
      id: row.id,
      diagnosisId: row.diagnosis_id,
      stage: row.stage,
      inputHash: row.input_hash,
      outputJson: row.output_json,
      reportContractVersion: row.report_contract_version,
      scoreContractVersion: row.score_contract_version,
      providerModel: row.provider_model,
      promptVersion: row.prompt_version,
      trustGuardVersion: row.trust_guard_version,
      completedAt: fromDbTime(row.completed_at),
    };
  }

  // -- Round-5.2B analysis stage runs ----------------------------------------

  async startAnalysisStageRun(input: StartAnalysisStageRunInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO analysis_stage_runs
           (id, diagnosis_id, stage, attempt, status, input_hash,
            evidence_registry_hash, competitor_resolution_hash, query_plan_hash,
            frozen_evidence_snapshot_hash,
            output_json, output_hash, schema_version, prompt_version, provider_model,
            provider_usage_id, started_at, completed_at, error_category,
            error_metadata_json)
         VALUES
           (@id, @diagnosis_id, @stage, @attempt, 'RUNNING', @input_hash,
            @evidence_registry_hash, @competitor_resolution_hash, @query_plan_hash,
            @frozen_evidence_snapshot_hash,
            NULL, NULL, @schema_version, @prompt_version, @provider_model,
            NULL, @started_at, NULL, NULL, NULL)`,
      )
      .run({
        id: input.id,
        diagnosis_id: input.diagnosisId,
        stage: input.stage,
        attempt: input.attempt,
        input_hash: input.inputHash,
        evidence_registry_hash: input.evidenceRegistryHash,
        competitor_resolution_hash: input.competitorResolutionHash,
        query_plan_hash: input.queryPlanHash,
        frozen_evidence_snapshot_hash: input.frozenEvidenceSnapshotHash ?? null,
        schema_version: input.schemaVersion,
        prompt_version: input.promptVersion,
        provider_model: input.providerModel,
        started_at: toDbTime(this.now()),
      });
  }

  async completeAnalysisStageRun(input: {
    id: string;
    outputJson: string;
    outputHash: string;
    providerUsageId: string | null;
  }): Promise<void> {
    JSON.parse(input.outputJson);
    if (sha256(input.outputJson) !== input.outputHash) {
      throw new Error("analysis stage output hash mismatch");
    }
    const complete = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `UPDATE analysis_stage_runs
           SET status = 'SUCCEEDED', output_json = @output_json,
               output_hash = @output_hash, provider_usage_id = @provider_usage_id,
               completed_at = @completed_at, error_category = NULL,
               error_metadata_json = NULL
           WHERE id = @id AND status = 'RUNNING'`,
        )
        .run({
          id: input.id,
          output_json: input.outputJson,
          output_hash: input.outputHash,
          provider_usage_id: input.providerUsageId,
          completed_at: toDbTime(this.now()),
        });
      if (info.changes !== 1) throw new Error("analysis stage run is not RUNNING");
    });
    complete();
  }

  async failAnalysisStageRun(input: {
    id: string;
    errorCategory: string;
    errorMetadataJson: string;
    providerUsageId: string | null;
  }): Promise<void> {
    const info = this.db
      .prepare(
        `UPDATE analysis_stage_runs
         SET status = 'FAILED', output_json = NULL, output_hash = NULL,
             provider_usage_id = @provider_usage_id, completed_at = @completed_at,
             error_category = @error_category,
             error_metadata_json = @error_metadata_json
         WHERE id = @id AND status = 'RUNNING'`,
      )
      .run({
        id: input.id,
        provider_usage_id: input.providerUsageId,
        completed_at: toDbTime(this.now()),
        error_category: input.errorCategory.slice(0, 120),
        error_metadata_json: sanitizeStoredErrorMetadata(input.errorMetadataJson),
      });
    if (info.changes !== 1) throw new Error("analysis stage run is not RUNNING");
  }

  async findReusableAnalysisStageRun(query: {
    diagnosisId: string;
    stage: AnalysisStage;
    inputHash: string;
    evidenceRegistryHash: string;
    competitorResolutionHash: string;
    queryPlanHash: string;
    schemaVersion: string;
    promptVersion: string;
    providerModel: string;
  }): Promise<AnalysisStageRunRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM analysis_stage_runs
         WHERE diagnosis_id = @diagnosis_id AND stage = @stage
           AND status = 'SUCCEEDED' AND input_hash = @input_hash
           AND evidence_registry_hash = @evidence_registry_hash
           AND competitor_resolution_hash = @competitor_resolution_hash
           AND query_plan_hash = @query_plan_hash
           AND schema_version = @schema_version
           AND prompt_version = @prompt_version
           AND provider_model = @provider_model
           AND output_json IS NOT NULL AND output_hash IS NOT NULL
         ORDER BY completed_at DESC, attempt DESC LIMIT 1`,
      )
      .get({
        diagnosis_id: query.diagnosisId,
        stage: query.stage,
        input_hash: query.inputHash,
        evidence_registry_hash: query.evidenceRegistryHash,
        competitor_resolution_hash: query.competitorResolutionHash,
        query_plan_hash: query.queryPlanHash,
        schema_version: query.schemaVersion,
        prompt_version: query.promptVersion,
        provider_model: query.providerModel,
      }) as AnalysisStageRunRow | undefined;
    if (!row || !row.output_json || sha256(row.output_json) !== row.output_hash) return null;
    return this.mapAnalysisStageRun(row);
  }

  async getAnalysisStageRuns(diagnosisId: string): Promise<AnalysisStageRunRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM analysis_stage_runs
         WHERE diagnosis_id = ? ORDER BY started_at, stage, attempt`,
      )
      .all(diagnosisId) as AnalysisStageRunRow[];
    return rows.map((row) => this.mapAnalysisStageRun(row));
  }

  private mapAnalysisStageRun(row: AnalysisStageRunRow): AnalysisStageRunRecord {
    return {
      id: row.id,
      diagnosisId: row.diagnosis_id,
      stage: row.stage as AnalysisStage,
      attempt: row.attempt,
      status: row.status as AnalysisStageRunStatus,
      inputHash: row.input_hash,
      evidenceRegistryHash: row.evidence_registry_hash,
      competitorResolutionHash: row.competitor_resolution_hash,
      queryPlanHash: row.query_plan_hash,
      frozenEvidenceSnapshotHash: row.frozen_evidence_snapshot_hash,
      outputJson: row.output_json,
      outputHash: row.output_hash,
      schemaVersion: row.schema_version,
      promptVersion: row.prompt_version,
      providerModel: row.provider_model,
      providerUsageId: row.provider_usage_id,
      startedAt: fromDbTime(row.started_at),
      completedAt: row.completed_at === null ? null : fromDbTime(row.completed_at),
      errorCategory: row.error_category,
      errorMetadataJson: row.error_metadata_json,
    };
  }

  // -- Round-5.2B repair history ---------------------------------------------

  async beginAnalysisRepairAttempt(input: BeginAnalysisRepairAttemptInput): Promise<void> {
    if (input.repairAttempt !== 1) throw new Error("only repairAttempt=1 is authorized");
    const begin = this.db.transaction(() => {
      const diagnosis = this.db
        .prepare(`SELECT status FROM diagnosis_requests WHERE id = ?`)
        .get(input.diagnosisId) as { status: string } | undefined;
      if (!diagnosis) throw new Error("diagnosis not found");
      if (diagnosis.status !== "FAILED") throw new Error("diagnosis must remain FAILED");
      const existing = this.db
        .prepare(`SELECT COUNT(*) AS count FROM analysis_repair_attempts WHERE diagnosis_id = ?`)
        .get(input.diagnosisId) as { count: number };
      if (existing.count !== 0) throw new Error("repair attempt already exists");
      this.db
        .prepare(
          `INSERT INTO analysis_repair_attempts
             (id, diagnosis_id, repair_attempt, original_failure_stage,
              authorized_at, started_at, completed_at, status, reused_stages,
              rerun_stages, provider_call_delta, result_state, failure_category,
              recovery_mode, missing_historical_provenance,
              frozen_evidence_snapshot_json, frozen_evidence_snapshot_hash)
           VALUES
             (@id, @diagnosis_id, 1, @original_failure_stage,
              @authorized_at, @started_at, NULL, 'RUNNING', @reused_stages,
              @rerun_stages, 0, NULL, NULL, @recovery_mode,
              @missing_historical_provenance, @frozen_evidence_snapshot_json,
              @frozen_evidence_snapshot_hash)`,
        )
        .run({
          id: `${input.diagnosisId}:1`,
          diagnosis_id: input.diagnosisId,
          original_failure_stage: input.originalFailureStage,
          authorized_at: toDbTime(input.authorizedAt),
          started_at: toDbTime(this.now()),
          reused_stages: JSON.stringify(input.reusedStages),
          rerun_stages: JSON.stringify(input.rerunStages),
          recovery_mode: input.recoveryMode ?? "STRICT_CHECKPOINT_RESUME",
          missing_historical_provenance: JSON.stringify(
            input.missingHistoricalProvenance ?? [],
          ),
          frozen_evidence_snapshot_json: input.frozenEvidenceSnapshotJson ?? null,
          frozen_evidence_snapshot_hash: input.frozenEvidenceSnapshotHash ?? null,
        });
    });
    begin();
  }

  async completeAnalysisRepairAttempt(input: {
    diagnosisId: string;
    repairAttempt: number;
    status: Exclude<AnalysisRepairStatus, "RUNNING">;
    providerCallDelta: number;
    resultState: string;
    failureCategory: string | null;
  }): Promise<void> {
    const info = this.db
      .prepare(
        `UPDATE analysis_repair_attempts
         SET completed_at = @completed_at, status = @status,
             provider_call_delta = @provider_call_delta,
             result_state = @result_state, failure_category = @failure_category
         WHERE diagnosis_id = @diagnosis_id AND repair_attempt = @repair_attempt
           AND status = 'RUNNING'`,
      )
      .run({
        diagnosis_id: input.diagnosisId,
        repair_attempt: input.repairAttempt,
        completed_at: toDbTime(this.now()),
        status: input.status,
        provider_call_delta: input.providerCallDelta,
        result_state: input.resultState,
        failure_category: input.failureCategory,
      });
    if (info.changes !== 1) throw new Error("repair attempt is not RUNNING");
  }

  async getAnalysisRepairAttempts(
    diagnosisId: string,
  ): Promise<AnalysisRepairAttemptRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM analysis_repair_attempts
         WHERE diagnosis_id = ? ORDER BY repair_attempt`,
      )
      .all(diagnosisId) as AnalysisRepairAttemptRow[];
    return rows.map((row) => ({
      diagnosisId: row.diagnosis_id,
      repairAttempt: row.repair_attempt,
      originalFailureStage: row.original_failure_stage,
      authorizedAt: fromDbTime(row.authorized_at),
      startedAt: fromDbTime(row.started_at),
      completedAt: row.completed_at === null ? null : fromDbTime(row.completed_at),
      status: row.status as AnalysisRepairStatus,
      reusedStages: JSON.parse(row.reused_stages) as AnalysisRecoveryReusedStage[],
      rerunStages: JSON.parse(row.rerun_stages) as AnalysisStage[],
      providerCallDelta: row.provider_call_delta,
      resultState: row.result_state,
      failureCategory: row.failure_category,
      recoveryMode: row.recovery_mode as AnalysisRepairAttemptRecord["recoveryMode"],
      missingHistoricalProvenance: JSON.parse(
        row.missing_historical_provenance,
      ) as string[],
      frozenEvidenceSnapshotJson: row.frozen_evidence_snapshot_json,
      frozenEvidenceSnapshotHash: row.frozen_evidence_snapshot_hash,
    }));
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
