// Pure, framework-free HTTP handlers for the diagnoses API.
//
// All logic lives here as plain async functions over injected dependencies so
// it can be unit-tested with a mock StorageAdapter/producer and never needs the
// Next.js runtime. app/api/diagnoses/**/route.ts are thin adapters that parse
// the request, call these, and serialize { status, body }.

import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType } from "../../contracts";
import type {
  DiagnosisStatus,
  StorageAdapter,
} from "../../storage/adapter";
import {
  runDiagnosisPipeline,
  type EvidencePipeline,
  type ReportProducer,
} from "../../diagnosis/orchestration/state-machine";
import { parseDiagnosisInput } from "../diagnosis-input";
import { newDiagnosisId, newPublicToken } from "../ids";

export interface DiagnosesApiDeps {
  storage: StorageAdapter;
  evidence: EvidencePipeline;
  producer: ReportProducer;
  clock?: () => Date;
  /** Id generator for synthetic row keys inside the pipeline. */
  idFactory?: () => string;
  /** Overridable for deterministic ids in tests. */
  newDiagnosisId?: () => string;
  newPublicToken?: () => string;
  /** Overridable pipeline runner (tests inject a stub to isolate the handler). */
  runPipeline?: typeof runDiagnosisPipeline;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Shape returned for status/report reads (internal and public). */
export interface DiagnosisView {
  diagnosisId: string;
  status: DiagnosisStatus;
  executionMode: DiagnosisReportType["executionMode"] | null;
  publicReportEligible: boolean;
  publicReportStatus: DiagnosisReportType["publicReportStatus"] | null;
  report: DiagnosisReportType | null;
}

/** POST /api/diagnoses — create a diagnosis and drive it to a terminal state. */
export async function handleCreateDiagnosis(
  deps: DiagnosesApiDeps,
  rawBody: unknown,
): Promise<HandlerResult> {
  const parsed = parseDiagnosisInput(rawBody);
  if (!parsed.ok) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", issues: parsed.issues },
    };
  }

  const id = (deps.newDiagnosisId ?? newDiagnosisId)();
  const publicToken = (deps.newPublicToken ?? newPublicToken)();

  await deps.storage.createDiagnosisRequest({
    id,
    inputJson: JSON.stringify(parsed.input),
    publicToken,
  });

  const run = deps.runPipeline ?? runDiagnosisPipeline;
  const result = await run(
    {
      storage: deps.storage,
      evidence: deps.evidence,
      producer: deps.producer,
      clock: deps.clock,
      idFactory: deps.idFactory,
    },
    { diagnosisId: id, publicToken, input: parsed.input },
  );

  if (!result.ok) {
    return {
      status: 201,
      body: {
        diagnosisId: id,
        publicToken,
        status: result.status,
        failedStage: result.failedStage,
        error: result.error,
      },
    };
  }

  return {
    status: 201,
    body: { diagnosisId: id, publicToken, status: result.status },
  };
}

export interface GetDiagnosisParams {
  id: string;
  /** When present, resolves by public token (read-only share entry). */
  publicToken?: string | null;
}

/**
 * GET /api/diagnoses/[id] — status + canonical report.
 * When `publicToken` is supplied it is the authoritative lookup key (the
 * unguessable read-only handle); the path id is ignored in that mode.
 */
export async function handleGetDiagnosis(
  deps: DiagnosesApiDeps,
  params: GetDiagnosisParams,
): Promise<HandlerResult> {
  const record = params.publicToken
    ? await deps.storage.getDiagnosisRequestByPublicToken(params.publicToken)
    : await deps.storage.getDiagnosisRequest(params.id);

  if (!record) {
    return { status: 404, body: { error: "NOT_FOUND" } };
  }

  const report = await loadCanonicalReport(deps.storage, record.id);
  const view: DiagnosisView = {
    diagnosisId: record.id,
    status: record.status,
    executionMode: report?.executionMode ?? null,
    publicReportEligible: report?.publicReportEligible ?? false,
    publicReportStatus: report?.publicReportStatus ?? null,
    report,
  };
  return { status: 200, body: view };
}

/**
 * Load the stored canonical report (validated at write time). Re-validates on
 * read as defense-in-depth; a corrupt row surfaces as null rather than throwing.
 */
async function loadCanonicalReport(
  storage: StorageAdapter,
  diagnosisId: string,
): Promise<DiagnosisReportType | null> {
  const stored = await storage.getReport(diagnosisId);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.canonicalJson);
    const validation = DiagnosisReport.safeParse(parsed);
    return validation.success ? validation.data : null;
  } catch {
    return null;
  }
}
