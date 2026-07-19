import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DiagnosisReport,
  type DiagnosisReport as DiagnosisReportType,
} from "../contracts";
import { ClaimsStageOutput } from "../diagnosis/analysis/stage-schemas";
import type { AnalysisPruneCandidate } from "../diagnosis/analysis/claims";
import type {
  AnalysisCheckpointRecord,
  AnalysisStageRunRecord,
  EvidenceRecord,
  StorageAdapter,
  StoredReport,
} from "../storage/adapter";

export const CANDIDATE_SOURCE_RESOLVER_VERSION = "candidate-source-resolver.v1";

export type CandidateSourceProvenance =
  | "ANALYSIS_STAGE_RUN"
  | "LEGACY_ANALYSIS_CHECKPOINT";

export interface CandidateSourceItemV1 {
  candidateRef: string;
  claimKind: string;
  sourceIssueId: string | null;
  evidenceIds: string[];
}

export interface CandidateSourceSnapshotV1 {
  version: typeof CANDIDATE_SOURCE_RESOLVER_VERSION;
  diagnosisId: string;
  provenance: CandidateSourceProvenance;
  stageRunId: string | null;
  legacyCheckpointId: string | null;
  payloadHash: string;
  payloadHashProvenance:
    | "HISTORICAL_PERSISTED"
    | "CURRENTLY_COMPUTED_NOT_HISTORICAL";
  sourceCompletedAt: Date;
  candidateCount: number;
  candidates: CandidateSourceItemV1[];
}

/** Validated content is in-memory only; persist `snapshot`, never this payload. */
export interface CandidateSourceResolutionV1 {
  snapshot: CandidateSourceSnapshotV1;
  candidateReport: DiagnosisReportType | null;
  claimsStageOutput: ClaimsStageOutput | null;
  prunedCandidates: AnalysisPruneCandidate[];
}

export interface CandidateSourceReplayFactV1 {
  component: "CANDIDATE_SOURCE_RESOLVER_V1";
  classification: "IMPLEMENTATION_BUG";
  failureCode:
    | "CANDIDATE_SOURCE_NOT_FOUND"
    | "CANDIDATE_SOURCE_INVALID"
    | "CANDIDATE_SOURCE_STORAGE_UNAVAILABLE";
  attemptedSources: CandidateSourceProvenance[];
}

export type CandidateSourceResolutionResultV1 =
  | { ok: true; value: CandidateSourceResolutionV1 }
  | {
      ok: false;
      error: {
        code:
          | "CANDIDATE_SOURCE_NOT_FOUND"
          | "CANDIDATE_SOURCE_INVALID"
          | "CANDIDATE_SOURCE_STORAGE_UNAVAILABLE";
        message: string;
        replayFact: CandidateSourceReplayFactV1;
      };
    };

const pruneCandidateSchema = z
  .object({
    claimKind: z.string().min(1),
    candidateRef: z.string().min(1),
    sourceIssueId: z.string().min(1).nullable(),
    reasonCode: z.string().min(1),
    guardRule: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    coverageStatus: z
      .enum([
        "NOT_REQUIRED",
        "ESTABLISHED_AND_BOUNDED",
        "NOT_ESTABLISHED",
        "SCOPE_LIMITATION_MISSING",
      ])
      .optional(),
  })
  .strict();

const legacyPayloadSchema = z
  .object({
    report: z.unknown(),
    prunedCandidates: z.array(pruneCandidateSchema),
  })
  .strict();

const FORBIDDEN_PROVENANCE_KEYS = new Set([
  "prompt",
  "systemprompt",
  "userprompt",
  "rawproviderresponse",
  "providerresponse",
  "rawresponse",
  "apikey",
  "authorization",
  "secret",
]);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("candidate payload is not JSON serializable");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasForbiddenProvenanceKey(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenProvenanceKey);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      FORBIDDEN_PROVENANCE_KEYS.has(key.replace(/[_-]/g, "").toLowerCase()) ||
      hasForbiddenProvenanceKey(nested),
  );
}

function item(
  candidateRef: string,
  claimKind: string,
  evidenceIds: readonly string[],
  sourceIssueId: string | null = null,
): CandidateSourceItemV1 {
  return { candidateRef, claimKind, sourceIssueId, evidenceIds: [...evidenceIds] };
}

function candidatesFromReport(
  report: DiagnosisReportType,
  prunedCandidates: readonly AnalysisPruneCandidate[],
): CandidateSourceItemV1[] {
  return [
    ...report.strengths.map((candidate) =>
      item(candidate.id, "strength", candidate.evidenceIds),
    ),
    ...report.coreIssues.map((candidate) =>
      item(candidate.id, "coreIssue", candidate.evidenceIds),
    ),
    ...report.geoOpportunities.map((candidate) =>
      item(
        candidate.id,
        "geoOpportunity",
        candidate.evidenceIds,
        candidate.sourceIssueId ?? null,
      ),
    ),
    ...report.competitorGaps.map((candidate) =>
      item(candidate.id, "competitorGap", candidate.evidenceIds),
    ),
    ...(report.demonstrationFix
      ? [
          item(
            report.demonstrationFix.id,
            "demonstrationFix",
            report.demonstrationFix.evidenceIds,
            report.coreIssues.find(
              (issue) => issue.statement === report.demonstrationFix?.currentIssue,
            )?.id ?? null,
          ),
        ]
      : []),
    ...prunedCandidates.map((candidate) =>
      item(
        candidate.candidateRef,
        candidate.claimKind,
        candidate.evidenceIds,
        candidate.sourceIssueId,
      ),
    ),
  ];
}

function candidatesFromClaimsStage(output: ClaimsStageOutput): CandidateSourceItemV1[] {
  return [
    ...output.strengths.map((candidate, index) =>
      item(`str_${index + 1}`, "strength", candidate.evidenceIds),
    ),
    ...output.coreIssues.map((candidate, index) =>
      item(`iss_${index + 1}`, "coreIssue", candidate.evidenceIds),
    ),
    ...output.geoOpportunities.map((candidate, index) =>
      item(
        `geo_${index + 1}`,
        "geoOpportunity",
        candidate.evidenceIds,
        candidate.sourceIssueId ?? null,
      ),
    ),
    ...output.competitorGaps.map((candidate, index) =>
      item(`gap_${index + 1}`, "competitorGap", candidate.evidenceIds),
    ),
    ...(output.demonstrationFix
      ? [
          item(
            "demo_1",
            "demonstrationFix",
            output.demonstrationFix.evidenceIds,
            output.demonstrationFix.sourceIssueId,
          ),
        ]
      : []),
  ];
}

function validateCandidateSet(
  candidates: readonly CandidateSourceItemV1[],
  evidenceIds: ReadonlySet<string>,
  requireReferences: boolean,
): string | null {
  const keys = new Set<string>();
  const issueIds = new Set(
    candidates.filter((candidate) => candidate.claimKind === "coreIssue").map((c) => c.candidateRef),
  );
  for (const candidate of candidates) {
    const key = `${candidate.claimKind}\u0000${candidate.candidateRef}`;
    if (keys.has(key)) return `duplicate candidate ${candidate.claimKind}:${candidate.candidateRef}`;
    keys.add(key);
    if (!requireReferences) continue;
    const missingEvidence = candidate.evidenceIds.find((id) => !evidenceIds.has(id));
    if (missingEvidence) {
      return `candidate ${candidate.candidateRef} references missing Evidence ${missingEvidence}`;
    }
    if (candidate.sourceIssueId !== null && !issueIds.has(candidate.sourceIssueId)) {
      return `candidate ${candidate.candidateRef} references missing source Issue ${candidate.sourceIssueId}`;
    }
  }
  return null;
}

function resolveStageRun(input: {
  diagnosisId: string;
  canonicalCreatedAt: Date;
  evidenceIds: ReadonlySet<string>;
  stageRuns: readonly AnalysisStageRunRecord[];
}): CandidateSourceResolutionV1 | null {
  const eligible = input.stageRuns
    .filter(
      (run) =>
        run.diagnosisId === input.diagnosisId &&
        run.stage === "REPORT_CLAIMS" &&
        run.status === "SUCCEEDED" &&
        run.outputJson !== null &&
        run.outputHash !== null &&
        run.completedAt !== null &&
        run.completedAt.getTime() <= input.canonicalCreatedAt.getTime(),
    )
    .sort(
      (a, b) =>
        b.completedAt!.getTime() - a.completedAt!.getTime() || b.attempt - a.attempt,
    );
  for (const run of eligible) {
    if (sha256(run.outputJson!) !== run.outputHash) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(run.outputJson!);
    } catch {
      continue;
    }
    if (hasForbiddenProvenanceKey(raw)) continue;
    const parsed = ClaimsStageOutput.safeParse(raw);
    if (!parsed.success || stableStringify(parsed.data) !== stableStringify(raw)) continue;
    const candidates = candidatesFromClaimsStage(parsed.data);
    if (validateCandidateSet(candidates, input.evidenceIds, false) !== null) continue;
    return {
      snapshot: {
        version: CANDIDATE_SOURCE_RESOLVER_VERSION,
        diagnosisId: input.diagnosisId,
        provenance: "ANALYSIS_STAGE_RUN",
        stageRunId: run.id,
        legacyCheckpointId: null,
        payloadHash: run.outputHash,
        payloadHashProvenance: "HISTORICAL_PERSISTED",
        sourceCompletedAt: run.completedAt!,
        candidateCount: candidates.length,
        candidates,
      },
      candidateReport: null,
      claimsStageOutput: parsed.data,
      prunedCandidates: [],
    };
  }
  return null;
}

function resolveLegacyCheckpoint(input: {
  diagnosisId: string;
  canonicalCreatedAt: Date;
  evidenceIds: ReadonlySet<string>;
  checkpoint: AnalysisCheckpointRecord | null;
}): CandidateSourceResolutionV1 | null {
  const checkpoint = input.checkpoint;
  if (
    !checkpoint ||
    checkpoint.diagnosisId !== input.diagnosisId ||
    checkpoint.stage !== "ANALYZING" ||
    checkpoint.completedAt.getTime() >= input.canonicalCreatedAt.getTime()
  ) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(checkpoint.outputJson);
  } catch {
    return null;
  }
  if (hasForbiddenProvenanceKey(raw)) return null;
  const payload = legacyPayloadSchema.safeParse(raw);
  if (!payload.success) return null;
  const report = DiagnosisReport.safeParse(payload.data.report);
  if (!report.success || report.data.diagnosisId !== input.diagnosisId) return null;
  if (stableStringify(report.data) !== stableStringify(payload.data.report)) return null;
  const prunedCandidates = payload.data.prunedCandidates as AnalysisPruneCandidate[];
  const candidates = candidatesFromReport(report.data, prunedCandidates);
  if (validateCandidateSet(candidates, input.evidenceIds, true) !== null) return null;
  return {
    snapshot: {
      version: CANDIDATE_SOURCE_RESOLVER_VERSION,
      diagnosisId: input.diagnosisId,
      provenance: "LEGACY_ANALYSIS_CHECKPOINT",
      stageRunId: null,
      legacyCheckpointId: checkpoint.id,
      payloadHash: sha256(checkpoint.outputJson),
      payloadHashProvenance: "CURRENTLY_COMPUTED_NOT_HISTORICAL",
      sourceCompletedAt: checkpoint.completedAt,
      candidateCount: candidates.length,
      candidates,
    },
    candidateReport: report.data,
    claimsStageOutput: null,
    prunedCandidates,
  };
}

export function resolveCandidateSourceV1(input: {
  diagnosisId: string;
  canonicalCreatedAt: Date;
  evidence: readonly Pick<EvidenceRecord, "id">[];
  stageRuns: readonly AnalysisStageRunRecord[];
  legacyCheckpoint: AnalysisCheckpointRecord | null;
}): CandidateSourceResolutionResultV1 {
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  const stage = resolveStageRun({ ...input, evidenceIds });
  if (stage) return { ok: true, value: stage };
  const legacy = resolveLegacyCheckpoint({
    diagnosisId: input.diagnosisId,
    canonicalCreatedAt: input.canonicalCreatedAt,
    evidenceIds,
    checkpoint: input.legacyCheckpoint,
  });
  if (legacy) return { ok: true, value: legacy };
  return {
    ok: false,
    error: {
      code: "CANDIDATE_SOURCE_NOT_FOUND",
      message: "no verified REPORT_CLAIMS stage run or strict legacy ANALYZING checkpoint",
      replayFact: {
        component: "CANDIDATE_SOURCE_RESOLVER_V1",
        classification: "IMPLEMENTATION_BUG",
        failureCode: "CANDIDATE_SOURCE_NOT_FOUND",
        attemptedSources: ["ANALYSIS_STAGE_RUN", "LEGACY_ANALYSIS_CHECKPOINT"],
      },
    },
  };
}

export async function resolveCandidateSourceFromStorageV1(
  storage: StorageAdapter,
  diagnosisId: string,
): Promise<CandidateSourceResolutionResultV1> {
  if (!storage.getAnalysisStageRuns || !storage.getLatestCheckpoint) {
    return {
      ok: false,
      error: {
        code: "CANDIDATE_SOURCE_STORAGE_UNAVAILABLE",
        message: "candidate source resolution requires stage-run and legacy-checkpoint reads",
        replayFact: {
          component: "CANDIDATE_SOURCE_RESOLVER_V1",
          classification: "IMPLEMENTATION_BUG",
          failureCode: "CANDIDATE_SOURCE_STORAGE_UNAVAILABLE",
          attemptedSources: ["ANALYSIS_STAGE_RUN", "LEGACY_ANALYSIS_CHECKPOINT"],
        },
      },
    };
  }
  const [canonical, evidence, stageRuns, legacyCheckpoint] = await Promise.all([
    storage.getReport(diagnosisId),
    storage.getEvidence(diagnosisId),
    storage.getAnalysisStageRuns(diagnosisId),
    storage.getLatestCheckpoint(diagnosisId, "ANALYZING"),
  ]);
  if (!canonical) {
    return {
      ok: false,
      error: {
        code: "CANDIDATE_SOURCE_NOT_FOUND",
        message: "canonical report not found",
        replayFact: {
          component: "CANDIDATE_SOURCE_RESOLVER_V1",
          classification: "IMPLEMENTATION_BUG",
          failureCode: "CANDIDATE_SOURCE_NOT_FOUND",
          attemptedSources: ["ANALYSIS_STAGE_RUN", "LEGACY_ANALYSIS_CHECKPOINT"],
        },
      },
    };
  }
  let canonicalCreatedAt = canonical.createdAt;
  try {
    const parsed = DiagnosisReport.safeParse(JSON.parse(canonical.canonicalJson));
    if (!parsed.success || parsed.data.diagnosisId !== diagnosisId) {
      throw new Error("canonical identity/schema mismatch");
    }
    const generatedAt = new Date(parsed.data.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) throw new Error("canonical generatedAt invalid");
    // SQLite audit timestamps are integer seconds. The canonical's persisted
    // generatedAt retains milliseconds and is the strict ordering authority.
    canonicalCreatedAt = generatedAt;
  } catch {
    return {
      ok: false,
      error: {
        code: "CANDIDATE_SOURCE_INVALID",
        message: "canonical report cannot establish strict candidate-source ordering",
        replayFact: {
          component: "CANDIDATE_SOURCE_RESOLVER_V1",
          classification: "IMPLEMENTATION_BUG",
          failureCode: "CANDIDATE_SOURCE_INVALID",
          attemptedSources: ["ANALYSIS_STAGE_RUN", "LEGACY_ANALYSIS_CHECKPOINT"],
        },
      },
    };
  }
  return resolveCandidateSourceV1({
    diagnosisId,
    canonicalCreatedAt,
    evidence,
    stageRuns,
    legacyCheckpoint,
  });
}

/** Narrow helper for AC: validates an explicitly supplied legacy source. */
export function parseLegacyCandidateCheckpointV1(input: {
  diagnosisId: string;
  canonical: Pick<StoredReport, "createdAt">;
  evidence: readonly Pick<EvidenceRecord, "id">[];
  checkpoint: AnalysisCheckpointRecord;
}): CandidateSourceResolutionResultV1 {
  return resolveCandidateSourceV1({
    diagnosisId: input.diagnosisId,
    canonicalCreatedAt: input.canonical.createdAt,
    evidence: input.evidence,
    stageRuns: [],
    legacyCheckpoint: input.checkpoint,
  });
}
