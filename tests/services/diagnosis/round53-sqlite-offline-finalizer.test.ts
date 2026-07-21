import { afterEach, describe, expect, it } from "vitest";
import type { ClaimEvidenceRelation } from "../../../src/contracts/claim-evidence";
import { deriveCoverage } from "../../../src/contracts/claim-evidence";
import { buildSampleReport } from "../../../src/fixtures/sample-report";
import { stableHash, stableJson } from "../../../src/diagnosis/orchestration/recovery/stable-hash";
import { publishGuard } from "../../../src/report/validation/publish-guard";
import { presentReport } from "../../../src/report/presentation/report-presentation-service";
import { refinalizeRound53Report } from "../../../src/services/diagnosis/round53-offline-finalizer";
import type { AnalysisStage } from "../../../src/storage/adapter";
import type { SqliteDatabase } from "../../../src/storage/migrate";
import {
  applyReportRevisionSchema,
  canonicalReportJson,
  SqliteReportRevisionRepository,
} from "../../../src/storage/report-revisions";
import { SqliteRound53FinalizationSourceStorage } from "../../../src/storage/report-revisions-source";
import {
  createSqliteStorageAdapter,
  type SqliteStorageAdapter,
} from "../../../src/storage/sqlite-adapter";

describe("Round-5.3 temporary SQLite offline finalization", () => {
  let db: SqliteDatabase;

  afterEach(() => db.close());

  it("reads actual persisted ledgers, runs current guard/presentation and appends the API-visible report", async () => {
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    const storage: SqliteStorageAdapter = created.adapter;
    applyReportRevisionSchema(db);

    const base = buildSampleReport();
    const issue = {
      ...base.coreIssues[0]!,
      statement: "产品页现有参数信息难以直接回答采购决策问题",
    };
    const report = buildSampleReport({
      strengths: [],
      coreIssues: [issue, base.coreIssues[1]!],
      geoOpportunities: [],
      competitorGaps: [],
      demonstrationFix: null,
    });
    await storage.createDiagnosisRequest({
      id: report.diagnosisId,
      inputJson: "{}",
      publicToken: report.publicToken,
    });
    await storage.saveReport({
      id: "report_original",
      diagnosisId: report.diagnosisId,
      reportContractVersion: report.reportContractVersion,
      scoreContractVersion: report.scoreContractVersion,
      canonicalJson: canonicalReportJson(report),
    });

    const stageValues: Record<AnalysisStage, unknown> = {
      REPORT_PROFILE: { profile: true },
      REPORT_SCORING: { scoring: true },
      REPORT_AI_VISIBILITY: { tests: [] },
      REPORT_CLAIMS: {
        strengths: [],
        coreIssues: report.coreIssues.map(
          ({ statement, businessImpact, claimType, evidenceIds, fixDirection }) => ({
            statement,
            businessImpact,
            claimType,
            evidenceIds,
            fixDirection,
          }),
        ),
        geoOpportunities: [],
        competitorGaps: [],
        demonstrationFix: null,
      },
    };
    for (const [index, stage] of (
      Object.keys(stageValues) as AnalysisStage[]
    ).entries()) {
      const value = stageValues[stage];
      await storage.startAnalysisStageRun({
        id: `run_${index}`,
        diagnosisId: report.diagnosisId,
        stage,
        attempt: 1,
        inputHash: stableHash({ stage }),
        evidenceRegistryHash: "e".repeat(64),
        competitorResolutionHash: null,
        queryPlanHash: null,
        frozenEvidenceSnapshotHash: "f".repeat(64),
        schemaVersion: "test.v1",
        promptVersion: "test.v1",
        providerModel: "persisted-only",
      });
      await storage.completeAnalysisStageRun({
        id: `run_${index}`,
        outputJson: stableJson(value),
        outputHash: stableHash(value),
        providerUsageId: null,
      });
    }
    const relation: ClaimEvidenceRelation = {
      claimId: issue.id,
      claimKind: "coreIssue",
      evidenceId: issue.evidenceIds[0]!,
      supportLevel: "DIRECT_SUPPORT",
      confidence: 0.9,
      justification: "产品页正文直接支持该观察",
      basis: "CONTENT_MATCH",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "persisted.test.v1",
    };
    const weakRelation: ClaimEvidenceRelation = {
      claimId: "iss_2",
      claimKind: "coreIssue",
      evidenceId: "ev_first_about",
      supportLevel: "PARTIAL_SUPPORT",
      confidence: 0.7,
      justification: "只支持待确认观察",
      basis: "MEASUREMENT_BOUNDARY",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "persisted.test.v1",
    };
    await storage.saveClaimEvidenceRelations([
      {
        id: "relation_1",
        diagnosisId: report.diagnosisId,
        ...relation,
      },
      {
        id: "relation_2",
        diagnosisId: report.diagnosisId,
        ...weakRelation,
      },
    ]);

    const revisions = new SqliteReportRevisionRepository(db, {
      idFactory: () => "revision_1",
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    });
    const result = await refinalizeRound53Report(
      {
        diagnosisId: report.diagnosisId,
        expectedParentReportId: "report_original",
        revisionReason: "temporary SQLite end-to-end",
        algorithmVersion: "round53-finalizer.v1",
      },
      {
        sourceStorage: new SqliteRound53FinalizationSourceStorage(db),
        revisions,
        assembleFromPersistedStages: () => structuredClone(report),
        assertFrozenGuards: ({ report: candidate, claimEvidenceRelations }) => {
          const coverage = deriveCoverage({
            evidence: candidate.evidence,
            firstPartyDomains: ["example-equip.com"],
            executedQueries: ["saved query"],
          });
          const guard = publishGuard({
            report: candidate,
            relations: claimEvidenceRelations,
            coverage,
            viewModels: presentReport(candidate),
          });
          if (!guard.ok) throw new Error("TEMP_SQLITE_GUARD_FAILED");
        },
        assertPresentation: (candidate) => {
          const presented = presentReport(candidate);
          expect(presented.quick.coreIssues.map((item) => item.id)).toEqual(["iss_1"]);
          expect(presented.deep.coreIssues.map((item) => item.id)).toEqual(["iss_1"]);
        },
      },
    );
    expect(result.providerCalls).toBe(0);
    expect(result.directQuickIssueIds).toEqual(["iss_1"]);
    expect((await storage.getProviderUsage(report.diagnosisId))).toEqual([]);
    expect((await storage.getReport(report.diagnosisId))?.id).toBe("revision_1");
    expect(
      (db.prepare("SELECT COUNT(*) count FROM reports WHERE id = 'report_original'").get() as {
        count: number;
      }).count,
    ).toBe(1);
  });
});
