// Report Published Event Service - Outbox for Feishu integration.
//
// This service handles:
// - Creating ReportPublishedEventV1 events when a report is marked as reviewed
// - Storing events in an outbox table (not sent immediately)
// - Tracking event status (PENDING, SENT, FAILED)
// - Future: integrate with Feishu webhook/bot adapter

import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./migrate";

/**
 * ReportPublishedEventV1 - Event emitted when a report is marked as reviewed/published.
 * 
 * This is the minimal interface needed for Feishu integration.
 * Future Feishu adapter will consume these events.
 */
export interface ReportPublishedEventV1 {
  eventId: string;
  reportId: string;
  diagnosisId: string;
  companyName: string;
  reportUrl: string;
  reportStatus: "REVIEWED" | "PUBLISHED" | "ARCHIVED";
  reviewerName: string | null;
  contactSummary: string | null;
  publishedAt: Date;
  source: "ENTERPRISE_DIAGNOSIS";
}

export interface CreateEventInput {
  reportId: string;
  diagnosisId: string;
  companyName: string;
  reportUrl: string;
  reportStatus: ReportPublishedEventV1["reportStatus"];
  reviewerName?: string;
  contactSummary?: string;
}

function toDbTime(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function fromDbTime(seconds: number): Date {
  return new Date(seconds * 1000);
}

export interface ReportPublishedEventRecord {
  id: string;
  eventId: string;
  reportId: string;
  diagnosisId: string;
  companyName: string;
  reportUrl: string;
  reportStatus: string;
  reviewerName: string | null;
  contactSummary: string | null;
  publishedAt: Date;
  source: string;
  eventStatus: "PENDING" | "SENT" | "FAILED";
  retryCount: number;
  createdAt: Date;
}

export interface ReportPublishedEventDeps {
  db: SqliteDatabase;
  now?: () => Date;
}

export class ReportPublishedEventService {
  private readonly db: SqliteDatabase;
  private readonly now: () => Date;

  constructor(deps: ReportPublishedEventDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Create a ReportPublishedEventV1 and store it in the outbox.
   * The event is NOT sent immediately; a separate process should consume the outbox.
   */
  createEvent(input: CreateEventInput): ReportPublishedEventV1 {
    const id = `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const eventId = `re_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const publishedAt = this.now();
    const createdAt = publishedAt;

    this.db
      .prepare(
        `INSERT INTO report_published_events
           (id, event_id, report_id, diagnosis_id, company_name, report_url,
            report_status, reviewer_name, contact_summary, published_at,
            source, event_status, retry_count, created_at)
         VALUES
           (@id, @event_id, @report_id, @diagnosis_id, @company_name, @report_url,
            @report_status, @reviewer_name, @contact_summary, @published_at,
            @source, @event_status, @retry_count, @created_at)`,
      )
      .run({
        id,
        event_id: eventId,
        report_id: input.reportId,
        diagnosis_id: input.diagnosisId,
        company_name: input.companyName,
        report_url: input.reportUrl,
        report_status: input.reportStatus,
        reviewer_name: input.reviewerName ?? null,
        contact_summary: input.contactSummary ?? null,
        published_at: toDbTime(publishedAt),
        source: "ENTERPRISE_DIAGNOSIS",
        event_status: "PENDING",
        retry_count: 0,
        created_at: toDbTime(createdAt),
      });

    return {
      eventId,
      reportId: input.reportId,
      diagnosisId: input.diagnosisId,
      companyName: input.companyName,
      reportUrl: input.reportUrl,
      reportStatus: input.reportStatus,
      reviewerName: input.reviewerName ?? null,
      contactSummary: input.contactSummary ?? null,
      publishedAt,
      source: "ENTERPRISE_DIAGNOSIS",
    };
  }

  /**
   * Get pending events from the outbox (for future Feishu adapter).
   */
  getPendingEvents(limit = 100): ReportPublishedEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM report_published_events
         WHERE event_status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(limit) as ReportPublishedEventRow[];

    return rows.map((row) => this.mapEventRow(row));
  }

  /**
   * Mark an event as sent (called by Feishu adapter after successful delivery).
   */
  markEventAsSent(eventId: string): void {
    this.db
      .prepare(
        `UPDATE report_published_events
         SET event_status = 'SENT'
         WHERE event_id = @event_id`,
      )
      .run({ event_id: eventId });
  }

  /**
   * Mark an event as failed (for retry logic).
   */
  markEventAsFailed(eventId: string): void {
    this.db
      .prepare(
        `UPDATE report_published_events
         SET event_status = 'FAILED', retry_count = retry_count + 1
         WHERE event_id = @event_id`,
      )
      .run({ event_id: eventId });
  }

  private mapEventRow(row: ReportPublishedEventRow): ReportPublishedEventRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      reportId: row.report_id,
      diagnosisId: row.diagnosis_id,
      companyName: row.company_name,
      reportUrl: row.report_url,
      reportStatus: row.report_status as ReportPublishedEventV1["reportStatus"],
      reviewerName: row.reviewer_name,
      contactSummary: row.contact_summary,
      publishedAt: fromDbTime(row.published_at),
      source: row.source,
      eventStatus: row.event_status as "PENDING" | "SENT" | "FAILED",
      retryCount: row.retry_count,
      createdAt: fromDbTime(row.created_at),
    };
  }
}

interface ReportPublishedEventRow {
  id: string;
  event_id: string;
  report_id: string;
  diagnosis_id: string;
  company_name: string;
  report_url: string;
  report_status: string;
  reviewer_name: string | null;
  contact_summary: string | null;
  published_at: number;
  source: string;
  event_status: string;
  retry_count: number;
  created_at: number;
}

/**
 * Factory to create a ReportPublishedEventService from the database connection.
 */
export function createReportPublishedEventService(
  db: SqliteDatabase,
): ReportPublishedEventService {
  return new ReportPublishedEventService({ db });
}
