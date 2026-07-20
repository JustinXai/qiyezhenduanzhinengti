// Report Revision Service - Append-only revisions for manual report review.
//
// This service handles:
// - Creating append-only report revisions when humans edit the report
// - Reading the latest revision or original canonical report
// - Never overwriting the original canonical report
// - Preserving audit trail of all changes

import { createHash, randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./migrate";
import type { DiagnosisReport } from "../contracts";

export interface ReportRevision {
  id: string;
  reportId: string;
  parentReportId: string;
  revisionNumber: number;
  revisedJson: string;
  originalReportHash: string;
  revisionHash: string;
  revisionReason: string;
  editedFields: string[];
  reviewerName: string | null;
  reviewedAt: Date;
  scoreUnchanged: boolean;
  evidenceUnchanged: boolean;
}

export interface CreateRevisionInput {
  reportId: string;
  parentReportId: string;
  originalCanonicalJson: string;
  revisedReport: DiagnosisReport;
  editedFields: string[];
  revisionReason: string;
  reviewerName?: string;
  scoreUnchanged: boolean;
  evidenceUnchanged: boolean;
}

function toDbTime(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function fromDbTime(seconds: number): Date {
  return new Date(seconds * 1000);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface ReportRevisionDeps {
  db: SqliteDatabase;
  now?: () => Date;
}

export class ReportRevisionService {
  private readonly db: SqliteDatabase;
  private readonly now: () => Date;

  constructor(deps: ReportRevisionDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Create an append-only revision of a report.
   * The original canonical report is never modified.
   */
  createRevision(input: CreateRevisionInput): ReportRevision {
    const originalHash = sha256(input.originalCanonicalJson);
    const revisedJson = JSON.stringify(input.revisedReport);
    const revisionHash = sha256(revisedJson);
    
    // Get next revision number
    const existing = this.db
      .prepare("SELECT MAX(revision_number) as max_num FROM report_revisions WHERE report_id = ?")
      .get(input.reportId) as { max_num: number | null } | undefined;
    const revisionNumber = (existing?.max_num ?? 0) + 1;

    const id = `rev_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const reviewedAt = this.now();

    this.db
      .prepare(
        `INSERT INTO report_revisions
           (id, report_id, parent_report_id, revision_number, revised_json,
            original_report_hash, revision_hash, revision_reason, edited_fields,
            reviewer_name, reviewed_at, score_unchanged, evidence_unchanged)
         VALUES
           (@id, @report_id, @parent_report_id, @revision_number, @revised_json,
            @original_report_hash, @revision_hash, @revision_reason, @edited_fields,
            @reviewer_name, @reviewed_at, @score_unchanged, @evidence_unchanged)`,
      )
      .run({
        id,
        report_id: input.reportId,
        parent_report_id: input.parentReportId,
        revision_number: revisionNumber,
        revised_json: revisedJson,
        original_report_hash: originalHash,
        revision_hash: revisionHash,
        revision_reason: input.revisionReason,
        edited_fields: input.editedFields.join(","),
        reviewer_name: input.reviewerName ?? null,
        reviewed_at: toDbTime(reviewedAt),
        score_unchanged: input.scoreUnchanged ? 1 : 0,
        evidence_unchanged: input.evidenceUnchanged ? 1 : 0,
      });

    return {
      id,
      reportId: input.reportId,
      parentReportId: input.parentReportId,
      revisionNumber,
      revisedJson,
      originalReportHash: originalHash,
      revisionHash,
      revisionReason: input.revisionReason,
      editedFields: input.editedFields,
      reviewerName: input.reviewerName ?? null,
      reviewedAt,
      scoreUnchanged: input.scoreUnchanged,
      evidenceUnchanged: input.evidenceUnchanged,
    };
  }

  /**
   * Get the latest revision for a report, or null if no revisions exist.
   */
  getLatestRevision(reportId: string): ReportRevision | null {
    const row = this.db
      .prepare(
        `SELECT * FROM report_revisions
         WHERE report_id = ?
         ORDER BY revision_number DESC
         LIMIT 1`,
      )
      .get(reportId) as ReportRevisionRow | undefined;

    return row ? this.mapRevisionRow(row) : null;
  }

  /**
   * Get all revisions for a report.
   */
  getRevisions(reportId: string): ReportRevision[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM report_revisions
         WHERE report_id = ?
         ORDER BY revision_number ASC`,
      )
      .all(reportId) as ReportRevisionRow[];

    return rows.map((row) => this.mapRevisionRow(row));
  }

  private mapRevisionRow(row: ReportRevisionRow): ReportRevision {
    return {
      id: row.id,
      reportId: row.report_id,
      parentReportId: row.parent_report_id,
      revisionNumber: row.revision_number,
      revisedJson: row.revised_json,
      originalReportHash: row.original_report_hash,
      revisionHash: row.revision_hash,
      revisionReason: row.revision_reason,
      editedFields: row.edited_fields.split(",").filter(Boolean),
      reviewerName: row.reviewer_name,
      reviewedAt: fromDbTime(row.reviewed_at),
      scoreUnchanged: Boolean(row.score_unchanged),
      evidenceUnchanged: Boolean(row.evidence_unchanged),
    };
  }
}

interface ReportRevisionRow {
  id: string;
  report_id: string;
  parent_report_id: string;
  revision_number: number;
  revised_json: string;
  original_report_hash: string;
  revision_hash: string;
  revision_reason: string;
  edited_fields: string;
  reviewer_name: string | null;
  reviewed_at: number;
  score_unchanged: number;
  evidence_unchanged: number;
}

/**
 * Factory to create a ReportRevisionService from the database connection.
 */
export function createReportRevisionService(db: SqliteDatabase): ReportRevisionService {
  return new ReportRevisionService({ db });
}
