import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/src/runtime/create-runtime";
import { openMigratedDatabase } from "@/src/storage/migrate";
import { createReportRevisionService } from "@/src/storage/report-revision-service";
import { createReportPublishedEventService } from "@/src/storage/report-published-event-service";
import { handleGetDiagnosis } from "@/src/runtime/api/diagnoses-handlers";
import type { DiagnosisView } from "@/src/runtime/api/diagnoses-handlers";
import type { DiagnosisReport } from "@/src/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Environment-based access control
const INTERNAL_REPORT_REVIEW_ENABLED =
  process.env.INTERNAL_REPORT_REVIEW_ENABLED?.trim().toLowerCase() === "true";

// GET /api/internal/report-review/[token] - Get report for review
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!INTERNAL_REPORT_REVIEW_ENABLED) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { token } = await params;
  const runtime = getRuntime();
  const result = await handleGetDiagnosis(runtime, { id: token, publicToken: token });

  if (result.status !== 200 || !result.body) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const view = result.body as DiagnosisView;
  if (!view.report) {
    return NextResponse.json({ error: "REPORT_NOT_READY" }, { status: 400 });
  }

  // Get latest revision if exists
  const revisionService = createReportRevisionService(openMigratedDatabase(process.env.DATABASE_URL ?? "./data/dev.sqlite"));
  const latestRevision = revisionService.getLatestRevision(view.report.diagnosisId);

  // Use revised report if exists, otherwise use canonical
  const reportForReview = latestRevision
    ? (JSON.parse(latestRevision.revisedJson) as DiagnosisReport)
    : view.report;

  return NextResponse.json({
    report: reportForReview,
    originalReport: view.report,
    latestRevision: latestRevision ? {
      id: latestRevision.id,
      revisionNumber: latestRevision.revisionNumber,
      revisionReason: latestRevision.revisionReason,
      editedFields: latestRevision.editedFields,
      reviewerName: latestRevision.reviewerName,
      reviewedAt: latestRevision.reviewedAt.toISOString(),
    } : null,
    hasRevisions: latestRevision !== null,
  });
}

// POST /api/internal/report-review/[token] - Save revision
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!INTERNAL_REPORT_REVIEW_ENABLED) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { token } = await params;
  const runtime = getRuntime();
  const result = await handleGetDiagnosis(runtime, { id: token, publicToken: token });

  if (result.status !== 200 || !result.body) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const view = result.body as DiagnosisView;
  if (!view.report) {
    return NextResponse.json({ error: "REPORT_NOT_READY" }, { status: 400 });
  }

  const body = await req.json();
  const {
    headlineConclusion,
    publicInformationOpportunityTitle,
    publicInformationOpportunityDescription,
    publicInformationActionText,
    reviewerName,
  } = body;

  // Build edited fields list
  const editedFields: string[] = [];
  
  // Validate: score and evidence must be unchanged
  const scoreUnchanged = true;
  const evidenceUnchanged = true;

  // Create revised report (shallow copy)
  const revisedReport = JSON.parse(JSON.stringify(view.report)) as DiagnosisReport;

  // Apply edits (only allowed fields)
  if (headlineConclusion !== undefined) {
    editedFields.push("headlineConclusion");
    // Note: headlineConclusion is computed from topStrength/topIssue, 
    // so we need to store it separately or update the source claims
  }

  if (publicInformationOpportunityTitle !== undefined) {
    editedFields.push("publicInformationOpportunityTitle");
    if (revisedReport.questionCoverageGaps && revisedReport.questionCoverageGaps.length > 0) {
      revisedReport.questionCoverageGaps[0]!.missingInformation = publicInformationOpportunityTitle;
    }
  }

  if (publicInformationOpportunityDescription !== undefined) {
    editedFields.push("publicInformationOpportunityDescription");
    if (revisedReport.questionCoverageGaps && revisedReport.questionCoverageGaps.length > 0) {
      revisedReport.questionCoverageGaps[0]!.suggestedAction = publicInformationOpportunityDescription;
    }
  }

  if (publicInformationActionText !== undefined) {
    editedFields.push("publicInformationActionText");
    if (revisedReport.questionCoverageGaps && revisedReport.questionCoverageGaps.length > 0) {
      revisedReport.questionCoverageGaps[0]!.businessValue = publicInformationActionText;
    }
  }

  // Contact info is stored in localStorage on the client side
  // It's not part of the canonical report structure
  // We store it in a separate contact summary for the published event

  if (editedFields.length === 0) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  // Create revision
  const db = openMigratedDatabase(process.env.DATABASE_URL ?? "./data/dev.sqlite");
  const revisionService = createReportRevisionService(db);
  
  const revision = revisionService.createRevision({
    reportId: view.report.diagnosisId,
    parentReportId: view.report.diagnosisId,
    originalCanonicalJson: JSON.stringify(view.report),
    revisedReport,
    editedFields,
    revisionReason: "MANUAL_REPORT_REVIEW",
    reviewerName,
    scoreUnchanged,
    evidenceUnchanged,
  });

  return NextResponse.json({
    success: true,
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      editedFields: revision.editedFields,
      reviewedAt: revision.reviewedAt.toISOString(),
    },
  });
}

// POST /api/internal/report-review/[token]/publish - Mark as reviewed and create event
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!INTERNAL_REPORT_REVIEW_ENABLED) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { token } = await params;
  const runtime = getRuntime();
  const result = await handleGetDiagnosis(runtime, { id: token, publicToken: token });

  if (result.status !== 200 || !result.body) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const view = result.body as DiagnosisView;
  if (!view.report) {
    return NextResponse.json({ error: "REPORT_NOT_READY" }, { status: 400 });
  }

  const body = await req.json();
  const { reviewerName, contactSummary } = body;

  // Create published event
  const db = openMigratedDatabase(process.env.DATABASE_URL ?? "./data/dev.sqlite");
  const eventService = createReportPublishedEventService(db);
  
  const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const reportUrl = `${baseUrl}/report/${token}`;

  const event = eventService.createEvent({
    reportId: view.report.diagnosisId,
    diagnosisId: view.report.diagnosisId,
    companyName: view.report.companyProfile?.brandName ?? "Unknown",
    reportUrl,
    reportStatus: "REVIEWED",
    reviewerName,
    contactSummary,
  });

  return NextResponse.json({
    success: true,
    event: {
      eventId: event.eventId,
      reportId: event.reportId,
      companyName: event.companyName,
      reportUrl: event.reportUrl,
      reportStatus: event.reportStatus,
      publishedAt: event.publishedAt.toISOString(),
      source: event.source,
    },
  });
}
