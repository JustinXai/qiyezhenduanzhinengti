import { resolve } from "node:path";
import Database from "better-sqlite3";
import { DiagnosisReport, type DiagnosisReport as DiagnosisReportType } from "../src/contracts";
import {
  assertInsta360FrozenEvidenceIdentity,
  CompetitorResolutionStatus,
  CoverageMode,
  createFrozenEvidenceScopeCoverage,
  hashEvidenceUrls,
  hashSortedEvidenceIds,
  parseFrozenEvidenceSnapshotV1,
  RecoveryMode,
} from "../src/diagnosis/orchestration/recovery/frozen-evidence-contract";
import { stableHash } from "../src/diagnosis/orchestration/recovery/stable-hash";
import { buildReportFromStageOutputs } from "../src/report/generation/assemble-report";
import { presentReport } from "../src/report/presentation/report-presentation-service";
import { chinesePublicReportGuard } from "../src/report/validation/chinese-public-report-guard";
import { countQuickVisibleChars } from "../src/report/validation/cta-guard";
import {
  FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
  frozenEvidenceGuard,
} from "../src/report/validation/frozen-evidence-guard";
import { publishGuard } from "../src/report/validation/publish-guard";
import { competitorNames, DiagnosisInputSchema } from "../src/runtime/diagnosis-input";
import { refinalizeRound53Report } from "../src/services/diagnosis/round53-offline-finalizer";
import type { SqliteDatabase } from "../src/storage/migrate";
import {
  applyReportRevisionSchema,
  hashCanonicalReport,
  SqliteReportRevisionRepository,
} from "../src/storage/report-revisions";
import { SqliteRound53FinalizationSourceStorage } from "../src/storage/report-revisions-source";

const EXPECTED_DIAGNOSIS_ID = "diag_d9d81ba3428f4696b088870ca7416e49";
const AUTH_ENV = "ROUND53_OFFLINE_REFINALIZATION_AUTHORIZED";

interface CliArgs {
  dbPath: string;
  diagnosisId: string;
  parentReportId: string;
  apply: boolean;
}

interface ReportRow {
  id: string;
  canonical_json: string;
  created_at: number;
}

interface RepairRow {
  frozen_evidence_snapshot_json: string;
  recovery_mode: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const value = (prefix: string): string | undefined =>
    argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  const dbPath = value("--db=");
  const diagnosisId = value("--diagnosis=");
  const parentReportId = value("--parent-report=");
  if (!dbPath || !diagnosisId || !parentReportId) {
    throw new Error("USAGE: --db=<sqlite> --diagnosis=<id> --parent-report=<id> --apply");
  }
  return { dbPath: resolve(dbPath), diagnosisId, parentReportId, apply: argv.includes("--apply") };
}

function one<T>(db: SqliteDatabase, sql: string, ...params: unknown[]): T {
  const row = db.prepare(sql).get(...params) as T | undefined;
  if (!row) throw new Error("ROUND53_REQUIRED_ROW_MISSING");
  return row;
}

function scalar(db: SqliteDatabase, sql: string, ...params: unknown[]): number {
  return one<{ value: number }>(db, sql, ...params).value;
}

function parseJson(value: string, code: string): unknown {
  try {
    return JSON.parse(value.replace(/^\uFEFF/u, "").trim());
  } catch {
    throw new Error(code);
  }
}

function evidenceManifest(report: DiagnosisReportType): string {
  return stableHash(report.evidence);
}

function stageManifest(db: SqliteDatabase, diagnosisId: string): string {
  return stableHash(
    db
      .prepare(
        `SELECT stage, attempt, status, input_hash, output_hash, output_json,
                evidence_registry_hash, competitor_resolution_hash, query_plan_hash,
                frozen_evidence_snapshot_hash, schema_version, prompt_version, provider_model
         FROM analysis_stage_runs WHERE diagnosis_id = ? ORDER BY started_at, id`,
      )
      .all(diagnosisId),
  );
}

function relationManifest(db: SqliteDatabase, diagnosisId: string): string {
  return stableHash(
    db
      .prepare(
        `SELECT claim_id, claim_kind, evidence_id, support_level, confidence,
                justification, basis, verifier_mode, verifier_version
         FROM claim_evidence_relations WHERE diagnosis_id = ?
         ORDER BY claim_kind, claim_id, evidence_id`,
      )
      .all(diagnosisId),
  );
}

function distribution<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apply || process.env[AUTH_ENV] !== "true") throw new Error("ROUND53_OFFLINE_REFINALIZATION_NOT_AUTHORIZED");
  if (args.diagnosisId !== EXPECTED_DIAGNOSIS_ID) throw new Error("ROUND53_DIAGNOSIS_ID_MISMATCH");

  const db = new Database(args.dbPath) as unknown as SqliteDatabase;
  try {
    db.pragma("foreign_keys = ON");
    const diagnosisBefore = scalar(db, "SELECT COUNT(*) value FROM diagnosis_requests");
    const providerBefore = stableHash(db.prepare("SELECT * FROM provider_usage ORDER BY id").all());
    const evidenceRowsBefore = stableHash(db.prepare("SELECT * FROM evidence ORDER BY id").all());
    const reportsBefore = scalar(db, "SELECT COUNT(*) value FROM reports WHERE diagnosis_id = ?", args.diagnosisId);
    const stagesBefore = stageManifest(db, args.diagnosisId);
    const relationsBefore = relationManifest(db, args.diagnosisId);
    const originalRow = one<ReportRow>(
      db,
      "SELECT id, canonical_json, created_at FROM reports WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1",
      args.diagnosisId,
    );
    if (originalRow.id !== args.parentReportId) throw new Error("ROUND53_PARENT_REPORT_MISMATCH");
    const originalSerialized = originalRow.canonical_json;
    const original = DiagnosisReport.parse(parseJson(originalSerialized, "ROUND53_ORIGINAL_REPORT_INVALID_JSON"));
    const originalReportHash = hashCanonicalReport(original);
    const evidenceHashBefore = evidenceManifest(original);

    const inputRow = one<{ input_json: string }>(
      db,
      "SELECT input_json FROM diagnosis_requests WHERE id = ? AND status = 'READY'",
      args.diagnosisId,
    );
    const diagnosisInput = DiagnosisInputSchema.parse(parseJson(inputRow.input_json, "ROUND53_INPUT_INVALID_JSON"));
    const repair = one<RepairRow>(
      db,
      `SELECT frozen_evidence_snapshot_json, recovery_mode
       FROM analysis_repair_attempts WHERE diagnosis_id = ? AND status = 'SUCCEEDED'
       ORDER BY repair_attempt DESC LIMIT 1`,
      args.diagnosisId,
    );
    const snapshot = parseFrozenEvidenceSnapshotV1(
      parseJson(repair.frozen_evidence_snapshot_json, "ROUND53_SNAPSHOT_INVALID_JSON"),
    );
    assertInsta360FrozenEvidenceIdentity(snapshot);
    if (repair.recovery_mode !== RecoveryMode.enum.FROZEN_EVIDENCE_REANALYSIS) {
      throw new Error("ROUND53_RECOVERY_MODE_MISMATCH");
    }
    if (stableHash(diagnosisInput) !== snapshot.diagnosisInputHash) throw new Error("ROUND53_INPUT_HASH_MISMATCH");
    if (evidenceHashBefore !== snapshot.normalizedEvidenceHash) throw new Error("ROUND53_EVIDENCE_HASH_MISMATCH");

    applyReportRevisionSchema(db);
    const revisions = new SqliteReportRevisionRepository(db);
    let lastGuardedViews: ReturnType<typeof presentReport> | null = null;
    const result = await refinalizeRound53Report(
      {
        diagnosisId: args.diagnosisId,
        expectedParentReportId: args.parentReportId,
        revisionReason: "Round-5.3 Truth Gate: remove non-DIRECT Quick issues; preserve as Deep needs-confirmation observations",
        algorithmVersion: "round53-truth-gate.v1",
      },
      {
        sourceStorage: new SqliteRound53FinalizationSourceStorage(db),
        revisions,
        assembleFromPersistedStages: ({ currentReport, stageOutputs }) => {
          const referenceTest = currentReport.aiVisibilityTests[0];
          const built = buildReportFromStageOutputs({
            identity: {
              diagnosisId: currentReport.diagnosisId,
              publicToken: currentReport.publicToken,
              generatedAt: currentReport.generatedAt,
            },
            profileInput: {
              website: diagnosisInput.website,
              providedBrandName: diagnosisInput.brandName,
              providedCompetitors: competitorNames(diagnosisInput.competitors),
            },
            aiVisibilityInput: {
              brandName: diagnosisInput.brandName ?? new URL(diagnosisInput.website).hostname,
              modelUsed: referenceTest?.modelUsed ?? "deepseek-v4-flash",
              testedAt: referenceTest?.testedAt ?? currentReport.generatedAt,
            },
            evidence: currentReport.evidence,
            stageOutputs: {
              companyProfile: stageOutputs.REPORT_PROFILE,
              dimensionSignals: stageOutputs.REPORT_SCORING,
              aiVisibility: stageOutputs.REPORT_AI_VISIBILITY,
              claims: stageOutputs.REPORT_CLAIMS,
            },
          });
          if (!built.ok) throw new Error(`ROUND53_CANONICAL_REBUILD_FAILED:${built.stage}`);
          return DiagnosisReport.parse({
            ...built.report,
            competitorGaps: [],
            companyProfile: {
              ...built.report.companyProfile,
              unresolvedQuestions: [
                ...new Set([
                  ...built.report.companyProfile.unresolvedQuestions,
                  FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
                ]),
              ],
            },
          });
        },
        assertFrozenGuards: ({ report, claimEvidenceRelations }) => {
          const coverage = createFrozenEvidenceScopeCoverage({ snapshot, evidence: report.evidence });
          const views = presentReport(report);
          const published = publishGuard({
            report,
            relations: claimEvidenceRelations,
            coverage,
            viewModels: views,
          });
          if (!published.ok) throw new Error(`ROUND53_PUBLISH_GUARD_FAILED:${JSON.stringify(published.violations)}`);
          const zh = chinesePublicReportGuard(views);
          if (!zh.ok) throw new Error(`ROUND53_CHINESE_GUARD_FAILED:${JSON.stringify(zh.violations)}`);
          const languages = report.evidence.map((item) => item.language === "zh" ? "zh" : "other");
          const tiers = report.evidence.map((item) => item.sourceTier ?? "C");
          const sources = report.evidence.map((item) => item.sourceType);
          const frozen = frozenEvidenceGuard({
            recoveryMode: RecoveryMode.enum.FROZEN_EVIDENCE_REANALYSIS,
            coverageMode: CoverageMode.value,
            competitorResolutionStatus: CompetitorResolutionStatus.value,
            snapshot,
            current: {
              diagnosisId: report.diagnosisId,
              diagnosisInputHash: snapshot.diagnosisInputHash,
              evidenceRegistryHash: snapshot.evidenceRegistryHash,
              normalizedEvidenceHash: stableHash(report.evidence),
              evidenceCount: report.evidence.length,
              sortedEvidenceIdsHash: hashSortedEvidenceIds(report.evidence.map((item) => item.id)),
              evidenceUrlsHash: hashEvidenceUrls(report.evidence.map((item) => item.url)),
              firstPartyEvidenceCount: sources.filter((item) => item === "FIRST_PARTY_EVIDENCE").length,
              observedEvidenceCount: sources.filter((item) => item === "OBSERVED_WEB_EVIDENCE").length,
              competitorEvidenceCount: sources.filter((item) => item === "COMPETITOR_WEB_EVIDENCE").length,
              languageDistribution: distribution(languages, ["zh", "other"]),
              sourceTierDistribution: distribution(tiers, ["A", "B", "C", "D", "E"]),
            },
            activityDelta: { evidenceCreated: 0, searchRecordsCreated: 0, crawlerRecordsCreated: 0 },
            report,
            relations: claimEvidenceRelations,
            presentation: {
              quickCompetitorLimitation: views.quick.competitorGapSummary.available
                ? ""
                : views.quick.competitorGapSummary.reason,
              deepCompetitorLimitation: report.companyProfile.unresolvedQuestions.includes(
                FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
              )
                ? FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION
                : "",
            },
            publicApiPayload: { diagnosisId: report.diagnosisId, status: "READY", report },
          });
          if (!frozen.ok) throw new Error(`ROUND53_FROZEN_GUARD_FAILED:${JSON.stringify(frozen.violations)}`);
          lastGuardedViews = views;
        },
        assertPresentation: (report) => {
          const views = presentReport(report);
          // Round-8 FINAL: coreIssues and geoOpportunities removed from Quick.
          if (views.quick.topIssue !== null) {
            throw new Error("ROUND53_QUICK_NON_DIRECT_ISSUE_REMAINS");
          }
          if (views.deep.coreIssues.length !== 0) throw new Error("ROUND53_DEEP_DETERMINISTIC_ISSUE_REMAINS");
          if (countQuickVisibleChars(views.quick) > 1800) throw new Error("ROUND53_QUICK_BUDGET_EXCEEDED");
          lastGuardedViews = views;
        },
      },
    );

    const latestRow = one<ReportRow>(
      db,
      "SELECT id, canonical_json, created_at FROM reports WHERE diagnosis_id = ? ORDER BY created_at DESC LIMIT 1",
      args.diagnosisId,
    );
    const latest = DiagnosisReport.parse(parseJson(latestRow.canonical_json, "ROUND53_REVISION_INVALID_JSON"));
    const views = lastGuardedViews ?? presentReport(latest);
    const originalAfter = one<{ canonical_json: string }>(db, "SELECT canonical_json FROM reports WHERE id = ?", args.parentReportId);
    const invariants = {
      diagnosisCountUnchanged: scalar(db, "SELECT COUNT(*) value FROM diagnosis_requests") === diagnosisBefore,
      providerUsageUnchanged: stableHash(db.prepare("SELECT * FROM provider_usage ORDER BY id").all()) === providerBefore,
      evidenceRowsUnchanged: stableHash(db.prepare("SELECT * FROM evidence ORDER BY id").all()) === evidenceRowsBefore,
      stageRunsUnchanged: stageManifest(db, args.diagnosisId) === stagesBefore,
      relationsUnchanged: relationManifest(db, args.diagnosisId) === relationsBefore,
      originalCanonicalBytePreserved: originalAfter.canonical_json === originalSerialized,
      reportCountIncrementedOnce:
        scalar(db, "SELECT COUNT(*) value FROM reports WHERE diagnosis_id = ?", args.diagnosisId) === reportsBefore + 1,
      evidenceHashUnchanged: evidenceManifest(latest) === evidenceHashBefore,
      scoreUnchanged: latest.scores.overallScore === original.scores.overallScore,
    };
    if (Object.values(invariants).some((value) => !value)) {
      throw new Error(`ROUND53_POST_WRITE_INVARIANT_FAILED:${JSON.stringify(invariants)}`);
    }
    if (latestRow.id !== result.revision.id) throw new Error("ROUND53_LATEST_REPORT_NOT_REVISION");

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ROUND53_OFFLINE_REFINALIZATION_SUCCEEDED",
          diagnosisId: args.diagnosisId,
          parentReportId: args.parentReportId,
          revisionId: result.revision.id,
          revisionNumber: result.revision.revisionNumber,
          originalReportHash,
          newReportHash: result.revision.newReportHash,
          removedNonDirectIssueIds: result.removedNonDirectIssueIds,
          removedOrphanOpportunityIds: result.removedOrphanOpportunityIds,
          deepNeedsConfirmationCount: result.deepNeedsConfirmation.length,
          pruneReasons: result.prunedClaims,
          quick: {
            // Round-8 FINAL: coreIssues and geoOpportunities removed from Quick.
            priorityDirections: views.quick.priorityDirections.length,
            visibleCharacters: countQuickVisibleChars(views.quick),
          },
          deep: {
            deterministicCoreIssues: views.deep.coreIssues.length,
            needsConfirmation: latest.companyProfile.unresolvedQuestions.filter((item) =>
              item.startsWith("待进一步确认（仅限本次保存的公开证据范围，不作为确定性结论）："),
            ).length,
          },
          evidence: { count: views.evidence.items.length, normalizedHash: evidenceManifest(latest) },
          overallScore: latest.scores.overallScore,
          providerCalls: result.providerCalls,
          invariants,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    db.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
