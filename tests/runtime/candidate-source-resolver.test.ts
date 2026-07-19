import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import type {
  AnalysisCheckpointRecord,
  AnalysisStageRunRecord,
} from "../../src/storage/adapter";
import {
  parseLegacyCandidateCheckpointV1,
  resolveCandidateSourceFromStorageV1,
  resolveCandidateSourceV1,
} from "../../src/runtime/candidate-source-resolver";
import { openMigratedDatabase } from "../../src/storage/migrate";
import { SqliteStorageAdapter } from "../../src/storage/sqlite-adapter";

const DIAGNOSIS_ID = "diag_qiaqia_fixture";
const CHECKPOINT_AT = new Date("2026-07-19T14:37:51.000Z");
const CANONICAL_AT = new Date("2026-07-19T14:37:51.324Z");

function eightCandidateReport() {
  const report = buildSampleReport({ diagnosisId: DIAGNOSIS_ID });
  report.generatedAt = CANONICAL_AT.toISOString();
  report.strengths.push({
    ...structuredClone(report.strengths[0]!),
    id: "str_2",
    statement: "第二条已验证优势",
  });
  report.coreIssues = report.coreIssues.slice(0, 2);
  report.geoOpportunities[0]!.sourceIssueId = "iss_1";
  report.geoOpportunities[1]!.sourceIssueId = "iss_2";
  return report;
}

function checkpoint(
  output: unknown = { report: eightCandidateReport(), prunedCandidates: [] },
): AnalysisCheckpointRecord {
  return {
    id: "legacy_checkpoint_row_2",
    diagnosisId: DIAGNOSIS_ID,
    stage: "ANALYZING",
    inputHash: "legacy-input-hash",
    outputJson: JSON.stringify(output),
    reportContractVersion: "diagnosis-report.v1",
    scoreContractVersion: "score-contract.v1",
    providerModel: "deepseek-v4-flash",
    promptVersion: "analysis.v2-prune-audit",
    trustGuardVersion: "trust-guard.v1",
    completedAt: CHECKPOINT_AT,
  };
}

function evidence() {
  return eightCandidateReport().evidence.map(({ id }) => ({ id }));
}

function stageRun(output: unknown): AnalysisStageRunRecord {
  const outputJson = JSON.stringify(output);
  return {
    id: "stage_run_claims_1",
    diagnosisId: DIAGNOSIS_ID,
    stage: "REPORT_CLAIMS",
    attempt: 1,
    status: "SUCCEEDED",
    inputHash: "a".repeat(64),
    evidenceRegistryHash: "b".repeat(64),
    competitorResolutionHash: "c".repeat(64),
    queryPlanHash: "d".repeat(64),
    frozenEvidenceSnapshotHash: null,
    outputJson,
    outputHash: createHash("sha256").update(outputJson).digest("hex"),
    schemaVersion: "analysis-stage-output.v1",
    promptVersion: "REPORT_CLAIMS_ZH_PROMPT_V2_2",
    providerModel: "deepseek-v4-flash",
    providerUsageId: "usage_1",
    startedAt: new Date("2026-07-19T14:37:40.000Z"),
    completedAt: CHECKPOINT_AT,
    errorCategory: null,
    errorMetadataJson: null,
  };
}

const strictStageOutput = {
  strengths: [
    {
      statement: "官网展示产品能力",
      businessImpact: "便于客户理解",
      claimType: "DIAGNOSTIC_INFERENCE",
      evidenceIds: ["ev_first_home"],
    },
  ],
  coreIssues: [],
  geoOpportunities: [],
  competitorGaps: [],
  demonstrationFix: null,
};

describe("CandidateSourceResolverV1", () => {
  it("prefers a verified REPORT_CLAIMS stage run over a valid legacy checkpoint", () => {
    const result = resolveCandidateSourceV1({
      diagnosisId: DIAGNOSIS_ID,
      canonicalCreatedAt: CANONICAL_AT,
      evidence: evidence(),
      stageRuns: [stageRun(strictStageOutput)],
      legacyCheckpoint: checkpoint(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toMatchObject({
      provenance: "ANALYSIS_STAGE_RUN",
      stageRunId: "stage_run_claims_1",
      legacyCheckpointId: null,
      payloadHashProvenance: "HISTORICAL_PERSISTED",
      candidateCount: 1,
    });
    expect(result.value.candidateReport).toBeNull();
  });

  it("strictly validates a legacy ANALYZING checkpoint and returns all 8 candidates", () => {
    const source = checkpoint();
    const result = parseLegacyCandidateCheckpointV1({
      diagnosisId: DIAGNOSIS_ID,
      canonical: { createdAt: CANONICAL_AT },
      evidence: evidence(),
      checkpoint: source,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toMatchObject({
      provenance: "LEGACY_ANALYSIS_CHECKPOINT",
      stageRunId: null,
      legacyCheckpointId: "legacy_checkpoint_row_2",
      payloadHashProvenance: "CURRENTLY_COMPUTED_NOT_HISTORICAL",
      payloadHash: createHash("sha256").update(source.outputJson).digest("hex"),
      candidateCount: 8,
    });
    expect(result.value.snapshot.candidates.map((item) => item.candidateRef)).toEqual([
      "str_1",
      "str_2",
      "iss_1",
      "iss_2",
      "geo_1",
      "geo_2",
      "gap_1",
      "demo_1",
    ]);
    expect(result.value.candidateReport?.diagnosisId).toBe(DIAGNOSIS_ID);
  });

  it("uses canonical generatedAt milliseconds when SQLite timestamps share one second", async () => {
    const sqliteSecond = new Date("2026-07-19T14:37:51.000Z");
    const db = openMigratedDatabase(":memory:");
    const storage = new SqliteStorageAdapter(db, { now: () => sqliteSecond });
    const report = eightCandidateReport();
    await storage.saveEvidence(
      report.evidence.map((item) => ({
        id: item.id,
        diagnosisId: DIAGNOSIS_ID,
        sourceType: item.sourceType,
        sourceDomain: item.sourceDomain,
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        authorityLevel: item.authorityLevel,
        supportLevel: item.supportLevel,
        fetchedAt: new Date(item.fetchedAt),
      })),
    );
    await storage.saveCheckpoint({
      ...checkpoint(),
      outputJson: JSON.stringify({ report, prunedCandidates: [] }),
    });
    await storage.saveReport({
      id: "report_same_second",
      diagnosisId: DIAGNOSIS_ID,
      reportContractVersion: report.reportContractVersion,
      scoreContractVersion: report.scoreContractVersion,
      canonicalJson: JSON.stringify(report),
    });

    const result = await resolveCandidateSourceFromStorageV1(storage, DIAGNOSIS_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshot).toMatchObject({
        provenance: "LEGACY_ANALYSIS_CHECKPOINT",
        candidateCount: 8,
      });
    }
    db.close();
  });

  it("hard-fails when neither source is verifiable", () => {
    const result = resolveCandidateSourceV1({
      diagnosisId: DIAGNOSIS_ID,
      canonicalCreatedAt: CANONICAL_AT,
      evidence: evidence(),
      stageRuns: [],
      legacyCheckpoint: null,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CANDIDATE_SOURCE_NOT_FOUND",
        replayFact: {
          classification: "IMPLEMENTATION_BUG",
          attemptedSources: ["ANALYSIS_STAGE_RUN", "LEGACY_ANALYSIS_CHECKPOINT"],
        },
      },
    });
  });

  it.each([
    ["missing Evidence", () => {
      const payload = { report: eightCandidateReport(), prunedCandidates: [] };
      payload.report.strengths[0]!.evidenceIds = ["ev_missing"];
      return checkpoint(payload);
    }],
    ["missing source Issue", () => {
      const payload = { report: eightCandidateReport(), prunedCandidates: [] };
      payload.report.geoOpportunities[0]!.sourceIssueId = "iss_missing";
      return checkpoint(payload);
    }],
    ["forbidden Prompt", () => {
      const payload = { report: eightCandidateReport(), prunedCandidates: [], systemPrompt: "raw" };
      return checkpoint(payload);
    }],
    ["not earlier than Canonical", () => ({ ...checkpoint(), completedAt: CANONICAL_AT })],
  ])("rejects legacy provenance with %s", (_label, makeCheckpoint) => {
    const result = parseLegacyCandidateCheckpointV1({
      diagnosisId: DIAGNOSIS_ID,
      canonical: { createdAt: CANONICAL_AT },
      evidence: evidence(),
      checkpoint: makeCheckpoint(),
    });
    expect(result.ok).toBe(false);
  });
});
