import { createHash, randomUUID } from "node:crypto";
import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType } from "../contracts";
import type { DroppedClaimRecord } from "../contracts/claim-reason-codes";
import type { PruneDecisionRecordInput } from "./adapter";
import type { SqliteDatabase } from "./migrate";

export interface ReportRevisionRecord {
  id: string;
  diagnosisId: string;
  revisionNumber: number;
  parentReportId: string;
  revisionReason: string;
  algorithmVersion: string;
  canonicalJson: string;
  originalReportHash: string;
  newReportHash: string;
  createdAt: Date;
  prunedClaims: DroppedClaimRecord[];
}

export interface CurrentReportRevisionSource {
  reportId: string;
  diagnosisId: string;
  canonicalJson: string;
  canonical: DiagnosisReportType;
  reportHash: string;
  revisionNumber: number;
  originalReportHash: string;
}

export interface AppendReportRevisionInput {
  diagnosisId: string;
  expectedParentReportId: string;
  revisionReason: string;
  algorithmVersion: string;
  canonicalJson: string;
  prunedClaims: DroppedClaimRecord[];
  pruneDecisions?: Array<
    Omit<PruneDecisionRecordInput, "id" | "reportId" | "revisionId">
  >;
}

export interface ReportRevisionRepository {
  getCurrent(diagnosisId: string): Promise<CurrentReportRevisionSource | null>;
  list(diagnosisId: string): Promise<ReportRevisionRecord[]>;
  append(input: AppendReportRevisionInput): Promise<ReportRevisionRecord>;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("REPORT_REVISION_NOT_JSON_SERIALIZABLE");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function canonicalReportJson(report: DiagnosisReportType): string {
  return canonicalize(report);
}

export function hashCanonicalReport(report: DiagnosisReportType): string {
  return createHash("sha256").update(canonicalReportJson(report)).digest("hex");
}

function parseCanonicalReport(serialized: string): DiagnosisReportType {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new Error("REPORT_REVISION_CANONICAL_INVALID_JSON");
  }
  const parsed = DiagnosisReport.safeParse(raw);
  if (!parsed.success) throw new Error("REPORT_REVISION_CANONICAL_SCHEMA_MISMATCH");
  return parsed.data;
}

/**
 * Additive DDL only. It is intentionally not wired into the shared migration
 * runner by Agent V; Supervisor decides when the reviewed migration is applied.
 */
export function applyReportRevisionSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_revisions (
      id TEXT PRIMARY KEY,
      diagnosis_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      parent_report_id TEXT NOT NULL,
      revision_reason TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      original_report_hash TEXT NOT NULL,
      new_report_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_report_revisions_diagnosis_revision
      ON report_revisions (diagnosis_id, revision_number);
    CREATE INDEX IF NOT EXISTS idx_report_revisions_diagnosis_id
      ON report_revisions (diagnosis_id);
    CREATE TABLE IF NOT EXISTS report_revision_prune_reasons (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL,
      diagnosis_id TEXT NOT NULL,
      claim_kind TEXT NOT NULL,
      claim_ref TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_report_revision_prune_reasons_revision_id
      ON report_revision_prune_reasons (revision_id);
  `);
}

interface RevisionRow {
  id: string;
  diagnosis_id: string;
  revision_number: number;
  parent_report_id: string;
  revision_reason: string;
  algorithm_version: string;
  canonical_json: string;
  original_report_hash: string;
  new_report_hash: string;
  created_at: number;
}

interface OriginalReportRow {
  id: string;
  diagnosis_id: string;
  canonical_json: string;
}

interface PruneReasonRow {
  claim_kind: string;
  claim_ref: string;
  reason_code: DroppedClaimRecord["reasonCode"];
}

function mapRevision(
  row: RevisionRow,
  prunedClaims: DroppedClaimRecord[] = [],
): ReportRevisionRecord {
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id,
    revisionNumber: row.revision_number,
    parentReportId: row.parent_report_id,
    revisionReason: row.revision_reason,
    algorithmVersion: row.algorithm_version,
    canonicalJson: row.canonical_json,
    originalReportHash: row.original_report_hash,
    newReportHash: row.new_report_hash,
    createdAt: new Date(row.created_at * 1000),
    prunedClaims,
  };
}

export interface SqliteReportRevisionRepositoryOptions {
  now?: () => Date;
  idFactory?: () => string;
}

/** Append-only repository: this class exposes no update or delete operation. */
export class SqliteReportRevisionRepository implements ReportRevisionRepository {
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(
    private readonly db: SqliteDatabase,
    options: SqliteReportRevisionRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => randomUUID());
  }

  async getCurrent(diagnosisId: string): Promise<CurrentReportRevisionSource | null> {
    const revision = this.db
      .prepare(
        `SELECT * FROM report_revisions
         WHERE diagnosis_id = ? ORDER BY revision_number DESC LIMIT 1`,
      )
      .get(diagnosisId) as RevisionRow | undefined;
    if (revision) {
      const canonical = parseCanonicalReport(revision.canonical_json);
      return {
        reportId: revision.id,
        diagnosisId,
        canonicalJson: revision.canonical_json,
        canonical,
        reportHash: revision.new_report_hash,
        revisionNumber: revision.revision_number,
        originalReportHash: revision.original_report_hash,
      };
    }

    const original = this.db
      .prepare(
        `SELECT id, diagnosis_id, canonical_json FROM reports
         WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(diagnosisId) as OriginalReportRow | undefined;
    if (!original) return null;
    const canonical = parseCanonicalReport(original.canonical_json);
    const reportHash = hashCanonicalReport(canonical);
    return {
      reportId: original.id,
      diagnosisId,
      canonicalJson: original.canonical_json,
      canonical,
      reportHash,
      revisionNumber: 0,
      originalReportHash: reportHash,
    };
  }

  async list(diagnosisId: string): Promise<ReportRevisionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM report_revisions
         WHERE diagnosis_id = ? ORDER BY revision_number`,
      )
      .all(diagnosisId) as RevisionRow[];
    return rows.map((row) => {
      const pruned = this.db
        .prepare(
          `SELECT claim_kind, claim_ref, reason_code
           FROM report_revision_prune_reasons WHERE revision_id = ? ORDER BY id`,
        )
        .all(row.id) as PruneReasonRow[];
      return mapRevision(
        row,
        pruned.map((item) => ({
          kind: item.claim_kind,
          ref: item.claim_ref,
          reasonCode: item.reason_code,
        })),
      );
    });
  }

  async append(input: AppendReportRevisionInput): Promise<ReportRevisionRecord> {
    if (input.revisionReason.trim().length === 0) throw new Error("REVISION_REASON_REQUIRED");
    if (input.algorithmVersion.trim().length === 0) throw new Error("ALGORITHM_VERSION_REQUIRED");
    const canonical = parseCanonicalReport(input.canonicalJson);
    if (canonical.diagnosisId !== input.diagnosisId) {
      throw new Error("REPORT_REVISION_DIAGNOSIS_MISMATCH");
    }

    const append = this.db.transaction(() => {
      const currentRevision = this.db
        .prepare(
          `SELECT * FROM report_revisions
           WHERE diagnosis_id = ? ORDER BY revision_number DESC LIMIT 1`,
        )
        .get(input.diagnosisId) as RevisionRow | undefined;
      const original = this.db
        .prepare(
          `SELECT id, diagnosis_id, canonical_json FROM reports
           WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(input.diagnosisId) as OriginalReportRow | undefined;
      if (!original) throw new Error("ORIGINAL_REPORT_NOT_FOUND");

      const originalCanonical = parseCanonicalReport(original.canonical_json);
      const originalHash = currentRevision?.original_report_hash ?? hashCanonicalReport(originalCanonical);
      const parentId = currentRevision?.id ?? original.id;
      const parentHash = currentRevision?.new_report_hash ?? originalHash;
      if (input.expectedParentReportId !== parentId) {
        throw new Error("REPORT_REVISION_PARENT_MISMATCH");
      }
      const newHash = hashCanonicalReport(canonical);
      if (newHash === parentHash) throw new Error("REPORT_REVISION_NO_CHANGE");

      const record: ReportRevisionRecord = {
        id: this.idFactory(),
        diagnosisId: input.diagnosisId,
        revisionNumber: (currentRevision?.revision_number ?? 0) + 1,
        parentReportId: parentId,
        revisionReason: input.revisionReason.trim(),
        algorithmVersion: input.algorithmVersion.trim(),
        canonicalJson: canonicalReportJson(canonical),
        originalReportHash: originalHash,
        newReportHash: newHash,
        createdAt: this.now(),
        prunedClaims: structuredClone(input.prunedClaims),
      };
      this.db
        .prepare(
          `INSERT INTO report_revisions
             (id, diagnosis_id, revision_number, parent_report_id,
              revision_reason, algorithm_version, canonical_json,
              original_report_hash, new_report_hash, created_at)
           VALUES
             (@id, @diagnosis_id, @revision_number, @parent_report_id,
              @revision_reason, @algorithm_version, @canonical_json,
              @original_report_hash, @new_report_hash, @created_at)`,
        )
        .run({
          id: record.id,
          diagnosis_id: record.diagnosisId,
          revision_number: record.revisionNumber,
          parent_report_id: record.parentReportId,
          revision_reason: record.revisionReason,
          algorithm_version: record.algorithmVersion,
          canonical_json: record.canonicalJson,
          original_report_hash: record.originalReportHash,
          new_report_hash: record.newReportHash,
          created_at: Math.floor(record.createdAt.getTime() / 1000),
        });
      // Customer/API read path remains the existing reports table. Append a new
      // immutable Canonical row in the SAME transaction; never update/delete the
      // parent row. report_revisions is the audit chain for that row.
      this.db
        .prepare(
          `INSERT INTO reports
             (id, diagnosis_id, report_contract_version, score_contract_version,
              canonical_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.diagnosisId,
          canonical.reportContractVersion,
          canonical.scoreContractVersion,
          record.canonicalJson,
          Math.floor(record.createdAt.getTime() / 1000),
        );
      const insertReason = this.db.prepare(
        `INSERT INTO report_revision_prune_reasons
           (id, revision_id, diagnosis_id, claim_kind, claim_ref, reason_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      record.prunedClaims.forEach((item, index) => {
        insertReason.run(
          `${record.id}:prune:${index + 1}`,
          record.id,
          record.diagnosisId,
          item.kind,
          item.ref,
          item.reasonCode,
          Math.floor(record.createdAt.getTime() / 1000),
        );
      });
      const insertDecision = this.db.prepare(
        `INSERT INTO prune_decisions
           (id, diagnosis_id, report_id, revision_id, stage_run_id, claim_kind,
            candidate_ref, source_issue_id, reason_code, guard_rule,
            evidence_ids_json, independent_support_source_count, direct_count,
            partial_count, context_count, coverage_status, created_at,
            algorithm_version)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      (input.pruneDecisions ?? []).forEach((decision, index) => {
        insertDecision.run(
          `${record.id}:prune-decision:${index + 1}`,
          record.diagnosisId,
          record.id,
          decision.stageRunId,
          decision.claimKind,
          decision.candidateRef,
          decision.sourceIssueId,
          decision.reasonCode,
          decision.guardRule,
          JSON.stringify(decision.evidenceIds),
          decision.independentSupportSourceCount,
          decision.directCount,
          decision.partialCount,
          decision.contextCount,
          decision.coverageStatus,
          Math.floor(decision.createdAt.getTime() / 1000),
          decision.algorithmVersion,
        );
      });
      return record;
    });
    return append();
  }
}
