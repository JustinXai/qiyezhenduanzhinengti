import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimEvidenceRelation } from "../../../src/contracts/claim-evidence";
import type { DiagnosisReport } from "../../../src/contracts";
import { buildSampleReport } from "../../../src/fixtures/sample-report";
import {
  refinalizeRound53Report,
  type PersistedRound53FinalizationSource,
  type Round53OfflineFinalizerDependencies,
} from "../../../src/services/diagnosis/round53-offline-finalizer";
import { stableHash, stableJson } from "../../../src/diagnosis/orchestration/recovery/stable-hash";
import type { AnalysisStage } from "../../../src/storage/adapter";
import type { SqliteDatabase } from "../../../src/storage/migrate";
import {
  applyReportRevisionSchema,
  canonicalReportJson,
  SqliteReportRevisionRepository,
} from "../../../src/storage/report-revisions";
import { createSqliteStorageAdapter } from "../../../src/storage/sqlite-adapter";

describe("Round-5.3 zero-Provider offline refinalizer", () => {
  let db: SqliteDatabase;
  let revisions: SqliteReportRevisionRepository;
  const report = buildSampleReport({
    coreIssues: buildSampleReport().coreIssues.slice(0, 2).map((issue) => ({
      ...issue,
      statement: `在本次保存的公开证据中，暂未发现${issue.statement}`,
    })),
    geoOpportunities: [
      {
        ...buildSampleReport().geoOpportunities[0]!,
        sourceIssueId: "iss_1",
        recommendedAction: "发布含交付周期、选型条件和售后边界的采购问答页",
        priorityReason: "直接回答已发布问题并引用对应产品页证据",
        contentGap: "在本次保存的公开证据中，暂未发现系统性的选型指南或对比框架",
      },
    ],
    demonstrationFix: null,
    competitorGaps: [],
  });

  const relations: ClaimEvidenceRelation[] = [
    {
      claimId: "iss_1",
      claimKind: "coreIssue",
      evidenceId: "ev_first_product",
      supportLevel: "DIRECT_SUPPORT",
      confidence: 0.9,
      justification: "直接支持",
      basis: "CONTENT_MATCH",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "test.v1",
    },
    {
      claimId: "iss_2",
      claimKind: "coreIssue",
      evidenceId: "ev_first_about",
      supportLevel: "PARTIAL_SUPPORT",
      confidence: 0.7,
      justification: "需要确认",
      basis: "MEASUREMENT_BOUNDARY",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "test.v1",
    },
    {
      claimId: "geo_1",
      claimKind: "geoOpportunity",
      evidenceId: "ev_first_product",
      supportLevel: "DIRECT_SUPPORT",
      confidence: 0.9,
      justification: "直接支持",
      basis: "CONTENT_MATCH",
      verifierMode: "DEEPSEEK_STRUCTURED",
      verifierVersion: "test.v1",
    },
  ];

  function stageOutput(stage: AnalysisStage, value: unknown) {
    return {
      stage,
      status: "SUCCEEDED" as const,
      outputJson: stableJson(value),
      outputHash: stableHash(value),
    };
  }

  function source(): PersistedRound53FinalizationSource {
    const claims = {
      strengths: report.strengths.map(({ statement, businessImpact, claimType, evidenceIds }) => ({
        statement,
        businessImpact,
        claimType,
        evidenceIds,
      })),
      coreIssues: report.coreIssues.map(
        ({ statement, businessImpact, claimType, evidenceIds, fixDirection }) => ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          fixDirection,
        }),
      ),
      geoOpportunities: report.geoOpportunities.map(
        ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          customerQuestion,
          contentGap,
          sourceIssueId,
          recommendedAction,
          priorityReason,
        }) => ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          customerQuestion,
          contentGap,
          sourceIssueId,
          recommendedAction,
          priorityReason,
        }),
      ),
      competitorGaps: [],
      demonstrationFix: null,
    };
    return {
      diagnosisId: report.diagnosisId,
      stageOutputs: {
        REPORT_PROFILE: stageOutput("REPORT_PROFILE", { profile: true }),
        REPORT_SCORING: stageOutput("REPORT_SCORING", { scoring: true }),
        REPORT_AI_VISIBILITY: stageOutput("REPORT_AI_VISIBILITY", { tests: [] }),
        REPORT_CLAIMS: stageOutput("REPORT_CLAIMS", claims),
      },
      claimEvidenceRelations: structuredClone(relations),
    };
  }

  beforeEach(async () => {
    const created = createSqliteStorageAdapter({ filename: ":memory:" });
    db = created.db;
    applyReportRevisionSchema(db);
    await created.adapter.createDiagnosisRequest({
      id: report.diagnosisId,
      inputJson: "{}",
      publicToken: report.publicToken,
    });
    await created.adapter.saveReport({
      id: "report_original",
      diagnosisId: report.diagnosisId,
      reportContractVersion: report.reportContractVersion,
      scoreContractVersion: report.scoreContractVersion,
      canonicalJson: canonicalReportJson(report),
    });
    revisions = new SqliteReportRevisionRepository(db, {
      idFactory: () => "revision_1",
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    });
  });

  afterEach(() => db.close());

  function deps(
    overrides: Partial<Round53OfflineFinalizerDependencies> = {},
  ): Round53OfflineFinalizerDependencies {
    const persisted = source();
    return {
      sourceStorage: { loadPersistedSource: vi.fn(async () => persisted) },
      revisions,
      assembleFromPersistedStages: vi.fn(() => structuredClone(report)),
      assertFrozenGuards: vi.fn(({ report: candidate }: { report: DiagnosisReport }) => {
        expect(candidate.coreIssues.map((issue) => issue.id)).toEqual(["iss_1"]);
        expect(candidate.geoOpportunities.map((opportunity) => opportunity.sourceIssueId)).toEqual([
          "iss_1",
        ]);
      }),
      assertPresentation: vi.fn((candidate: DiagnosisReport) => {
        expect(candidate.coreIssues.every((issue) => issue.id === "iss_1")).toBe(true);
      }),
      ...overrides,
    };
  }

  it("keeps only DIRECT core issues, preserves linked opportunities and appends a revision", async () => {
    const dependencies = deps();
    const result = await refinalizeRound53Report(
      {
        diagnosisId: report.diagnosisId,
        expectedParentReportId: "report_original",
        revisionReason: "Round-5.3 direct Quick issue policy",
        algorithmVersion: "round53-finalizer.v1",
      },
      dependencies,
    );
    expect(result).toMatchObject({
      directQuickIssueIds: ["iss_1"],
      removedNonDirectIssueIds: ["iss_2"],
      removedOrphanOpportunityIds: [],
      demonstrationFixRemoved: false,
      providerCalls: 0,
    });
    expect(result.deepNeedsConfirmation).toHaveLength(1);
    expect(result.deepNeedsConfirmation[0]).toContain("第三方可验证的信任证据不足");
    expect(result.revision).toMatchObject({
      revisionNumber: 1,
      parentReportId: "report_original",
    });
    expect(
      db
        .prepare(
          `SELECT revision_id, stage_run_id, claim_kind, candidate_ref, reason_code,
                  direct_count, partial_count, context_count, coverage_status,
                  algorithm_version
           FROM prune_decisions WHERE diagnosis_id = ?`,
        )
        .all(report.diagnosisId),
    ).toEqual([
      expect.objectContaining({
        revision_id: "revision_1",
        claim_kind: "coreIssue",
        candidate_ref: "iss_2",
        reason_code: "INSUFFICIENT_DIRECT_SUPPORT",
        direct_count: 0,
        partial_count: 1,
        context_count: 0,
        coverage_status: "ESTABLISHED_AND_BOUNDED",
        algorithm_version: "round53-finalizer.v1",
      }),
    ]);
    const revised = JSON.parse(result.revision.canonicalJson) as typeof report;
    expect(revised.coreIssues.map((issue) => issue.id)).toEqual(["iss_1"]);
    expect(
      revised.companyProfile.unresolvedQuestions.some(
        (item) => item.includes("待进一步确认") && item.includes("第三方可验证的信任证据不足"),
      ),
    ).toBe(true);
    expect(
      (db.prepare("SELECT COUNT(*) count FROM reports").get() as { count: number }).count,
    ).toBe(2);
    expect(
      (db.prepare("SELECT COUNT(*) count FROM reports WHERE id = 'report_original'").get() as {
        count: number;
      }).count,
    ).toBe(1);
  });

  it("allows an empty Quick issue set and removes opportunities derived from weak issues", async () => {
    const weakOnly = buildSampleReport({
      ...report,
      coreIssues: [report.coreIssues[1]!],
      geoOpportunities: [
        { ...report.geoOpportunities[0]!, sourceIssueId: "iss_2" },
      ],
    });
    const weakSource = source();
    weakSource.stageOutputs.REPORT_CLAIMS = stageOutput("REPORT_CLAIMS", {
      strengths: weakOnly.strengths.map(
        ({ statement, businessImpact, claimType, evidenceIds }) => ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
        }),
      ),
      coreIssues: weakOnly.coreIssues.map(
        ({ statement, businessImpact, claimType, evidenceIds, fixDirection }) => ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          fixDirection,
        }),
      ),
      geoOpportunities: weakOnly.geoOpportunities.map(
        ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          customerQuestion,
          contentGap,
          sourceIssueId,
          recommendedAction,
          priorityReason,
        }) => ({
          statement,
          businessImpact,
          claimType,
          evidenceIds,
          customerQuestion,
          contentGap,
          sourceIssueId,
          recommendedAction,
          priorityReason,
        }),
      ),
      competitorGaps: [],
      demonstrationFix: null,
    });
    const result = await refinalizeRound53Report(
      {
        diagnosisId: report.diagnosisId,
        expectedParentReportId: "report_original",
        revisionReason: "remove partial-only observations",
        algorithmVersion: "round53-finalizer.v1",
      },
      deps({
        sourceStorage: { loadPersistedSource: async () => weakSource },
        assembleFromPersistedStages: () => weakOnly,
        assertFrozenGuards: () => undefined,
        assertPresentation: (candidate) => {
          expect(candidate.coreIssues).toEqual([]);
          expect(candidate.companyProfile.unresolvedQuestions.at(-1)).toContain("待进一步确认");
          expect(candidate.companyProfile.unresolvedQuestions.at(-1)).toContain("本次保存的公开证据范围");
          expect(candidate.companyProfile.unresolvedQuestions.at(-1)).toContain("不作为确定性结论");
        },
      }),
    );
    expect(result.directQuickIssueIds).toEqual([]);
    expect(result.removedNonDirectIssueIds).toEqual(["iss_2"]);
    expect(result.removedOrphanOpportunityIds).toEqual(["geo_1"]);
    expect(result.deepNeedsConfirmation).toHaveLength(1);
    expect(result.prunedClaims).toEqual(
      expect.arrayContaining([
        {
          kind: "geoOpportunity",
          ref: "geo_1",
          reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        },
      ]),
    );
    expect(result.prunedClaims.some((item) => item.reasonCode === "INVALID_EVIDENCE_REFERENCE")).toBe(
      false,
    );
  });

  it("rejects mutated persisted stage inputs and writes no revision", async () => {
    const persisted = source();
    await expect(
      refinalizeRound53Report(
        {
          diagnosisId: report.diagnosisId,
          expectedParentReportId: "report_original",
          revisionReason: "mutation",
          algorithmVersion: "round53-finalizer.v1",
        },
        deps({
          sourceStorage: { loadPersistedSource: async () => persisted },
          assembleFromPersistedStages: ({ stageOutputs }) => {
            (stageOutputs.REPORT_PROFILE as { profile: boolean }).profile = false;
            return report;
          },
        }),
      ),
    ).rejects.toThrow("REFINALIZATION_PERSISTED_INPUT_MUTATED");
    expect(await revisions.list(report.diagnosisId)).toEqual([]);
  });

  it("rejects a claim not present in REPORT_CLAIMS and writes no revision", async () => {
    await expect(
      refinalizeRound53Report(
        {
          diagnosisId: report.diagnosisId,
          expectedParentReportId: "report_original",
          revisionReason: "invented claim",
          algorithmVersion: "round53-finalizer.v1",
        },
        deps({
          assembleFromPersistedStages: () => ({
            ...report,
            coreIssues: [
              ...report.coreIssues,
              { ...report.coreIssues[0]!, id: "iss_invented", statement: "通用问题" },
            ],
          }),
        }),
      ),
    ).rejects.toThrow("CLAIM_NOT_IN_PERSISTED_STAGE:iss_invented");
    expect(await revisions.list(report.diagnosisId)).toEqual([]);
  });

  it("hard-stops a persisted output hash mismatch before assembly or storage write", async () => {
    const persisted = source();
    persisted.stageOutputs.REPORT_SCORING.outputHash = "0".repeat(64);
    const assemble = vi.fn();
    await expect(
      refinalizeRound53Report(
        {
          diagnosisId: report.diagnosisId,
          expectedParentReportId: "report_original",
          revisionReason: "hash mismatch",
          algorithmVersion: "round53-finalizer.v1",
        },
        deps({
          sourceStorage: { loadPersistedSource: async () => persisted },
          assembleFromPersistedStages: assemble,
        }),
      ),
    ).rejects.toThrow("PERSISTED_STAGE_HASH_MISMATCH:REPORT_SCORING");
    expect(assemble).not.toHaveBeenCalled();
    expect(await revisions.list(report.diagnosisId)).toEqual([]);
  });

  it("requires all four immutable stage outputs", async () => {
    const persisted = source();
    delete (persisted.stageOutputs as Partial<Record<AnalysisStage, unknown>>).REPORT_PROFILE;
    await expect(
      refinalizeRound53Report(
        {
          diagnosisId: report.diagnosisId,
          expectedParentReportId: "report_original",
          revisionReason: "missing stage",
          algorithmVersion: "round53-finalizer.v1",
        },
        deps({ sourceStorage: { loadPersistedSource: async () => persisted } }),
      ),
    ).rejects.toThrow("PERSISTED_STAGE_NOT_SUCCESSFUL:REPORT_PROFILE");
  });
});
