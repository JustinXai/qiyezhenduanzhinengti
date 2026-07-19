import { describe, expect, it } from "vitest";
import type { DiagnosisReport } from "../../../src/contracts";
import type { ClaimEvidenceRelation, EvidenceCoverage } from "../../../src/contracts/claim-evidence";
import { deriveCoverage } from "../../../src/contracts/claim-evidence";
import type { ClaimPublicationSourceContext } from "../../../src/contracts/independent-support-source";
import { buildSampleReport } from "../../../src/fixtures/sample-report";
import type { CandidateSourceResolutionV1 } from "../../../src/runtime/candidate-source-resolver";
import {
  CURRENT_TRUTH_REFINALIZER_VERSION,
  refinalizeReportWithCurrentTruthPolicy,
} from "../../../src/services/diagnosis/refinalize-current-truth-policy";
import type { AppendReportRevisionInput, ReportRevisionRecord, ReportRevisionRepository } from "../../../src/storage/report-revisions";
import { canonicalReportJson, hashCanonicalReport } from "../../../src/storage/report-revisions";
import type { PruneDecisionRecord } from "../../../src/storage/adapter";

class CapturingRevisionRepository implements ReportRevisionRepository {
  public appendInput: AppendReportRevisionInput | null = null;

  constructor(private readonly current: DiagnosisReport) {}

  async getCurrent(): Promise<Awaited<ReturnType<ReportRevisionRepository["getCurrent"]>>> {
    return {
      reportId: "report_original",
      diagnosisId: this.current.diagnosisId,
      canonicalJson: canonicalReportJson(this.current),
      canonical: structuredClone(this.current),
      reportHash: hashCanonicalReport(this.current),
      revisionNumber: 0,
      originalReportHash: hashCanonicalReport(this.current),
    };
  }

  async list(): Promise<ReportRevisionRecord[]> {
    return [];
  }

  async append(input: AppendReportRevisionInput): Promise<ReportRevisionRecord> {
    this.appendInput = structuredClone(input);
    return {
      id: "revision_1",
      diagnosisId: input.diagnosisId,
      revisionNumber: 1,
      parentReportId: input.expectedParentReportId,
      revisionReason: input.revisionReason,
      algorithmVersion: input.algorithmVersion,
      canonicalJson: input.canonicalJson,
      originalReportHash: hashCanonicalReport(this.current),
      newReportHash: hashCanonicalReport(JSON.parse(input.canonicalJson) as DiagnosisReport),
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
      prunedClaims: structuredClone(input.prunedClaims),
    };
  }
}

function relation(input: {
  claimId: string;
  claimKind: ClaimEvidenceRelation["claimKind"];
  evidenceId: string;
  supportLevel?: ClaimEvidenceRelation["supportLevel"];
}): ClaimEvidenceRelation {
  return {
    claimId: input.claimId,
    claimKind: input.claimKind,
    evidenceId: input.evidenceId,
    supportLevel: input.supportLevel ?? "DIRECT_SUPPORT",
    confidence: 0.9,
    justification: "verified",
    basis: "CONTENT_MATCH",
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "test.v1",
  };
}

function historical(
  candidateRef: string,
  claimKind: string,
  reasonCode: PruneDecisionRecord["reasonCode"] = "INSUFFICIENT_DIRECT_SUPPORT",
): PruneDecisionRecord {
  return {
    id: `hist_${candidateRef}`,
    diagnosisId: "diag_sample_0001",
    reportId: "report_original",
    revisionId: null,
    stageRunId: "legacy_checkpoint_1",
    claimKind,
    candidateRef,
    sourceIssueId: null,
    reasonCode,
    guardRule: reasonCode,
    evidenceIds: ["ev_first_product"],
    independentSupportSourceCount: 0,
    directCount: 0,
    partialCount: 0,
    contextCount: 0,
    coverageStatus: "NOT_REQUIRED",
    createdAt: new Date("2026-07-19T11:00:00.000Z"),
    algorithmVersion: "historical.v1",
  };
}

describe("current truth policy refinalizer", () => {
  it("appends a zero-Provider revision and final ledger decisions for every resolved candidate", async () => {
    const current = buildSampleReport({
      coreIssues: [],
      geoOpportunities: [],
      demonstrationFix: null,
    });
    current.competitorGaps = [
      {
        ...current.competitorGaps[0]!,
        evidenceIds: ["ev_first_home", "ev_competitor_home"],
      },
    ];
    const original = structuredClone(current);
    const repository = new CapturingRevisionRepository(current);
    const coverage: EvidenceCoverage = deriveCoverage({
      evidence: current.evidence,
      firstPartyDomains: ["example-equip.com"],
      executedQueries: ["交付周期", "验收标准"],
    });
    const sourceContext: ClaimPublicationSourceContext = {
      companyId: current.diagnosisId,
      firstPartyDomains: ["example-equip.com"],
      competitorEntities: [
        {
          competitorEntityId: "competitor_jia",
          domains: ["competitor-jia.example.net"],
          evidenceIds: ["ev_competitor_home"],
        },
      ],
    };
    const candidateSource: CandidateSourceResolutionV1 = {
      snapshot: {
        version: "candidate-source-resolver.v1",
        diagnosisId: current.diagnosisId,
        provenance: "LEGACY_ANALYSIS_CHECKPOINT",
        stageRunId: null,
        legacyCheckpointId: "legacy_checkpoint_1",
        payloadHash: "payload_hash_1",
        payloadHashProvenance: "CURRENTLY_COMPUTED_NOT_HISTORICAL",
        sourceCompletedAt: new Date("2026-07-19T11:59:00.000Z"),
        candidateCount: 8,
        candidates: [
          { candidateRef: "str_1", claimKind: "strength", sourceIssueId: null, evidenceIds: ["ev_first_home"] },
          { candidateRef: "str_2", claimKind: "strength", sourceIssueId: null, evidenceIds: ["ev_first_product"] },
          { candidateRef: "iss_1", claimKind: "coreIssue", sourceIssueId: null, evidenceIds: ["ev_first_product"] },
          { candidateRef: "iss_2", claimKind: "coreIssue", sourceIssueId: null, evidenceIds: ["ev_first_about"] },
          { candidateRef: "gap_1", claimKind: "competitorGap", sourceIssueId: null, evidenceIds: ["ev_first_home", "ev_competitor_home"] },
          { candidateRef: "geo_1", claimKind: "geoOpportunity", sourceIssueId: "iss_1", evidenceIds: ["ev_first_product"] },
          { candidateRef: "geo_2", claimKind: "geoOpportunity", sourceIssueId: "iss_2", evidenceIds: ["ev_first_about"] },
          { candidateRef: "demo_1", claimKind: "demonstrationFix", sourceIssueId: "iss_1", evidenceIds: ["ev_first_product"] },
        ],
      },
      candidateReport: current,
      claimsStageOutput: null,
      prunedCandidates: [],
    };

    const result = await refinalizeReportWithCurrentTruthPolicy(
      {
        diagnosisId: current.diagnosisId,
        expectedParentReportId: "report_original",
        revisionReason: "Round-6A current truth policy refinalization",
        algorithmVersion: CURRENT_TRUTH_REFINALIZER_VERSION,
      },
      {
        revisions: repository,
        candidateSource,
        relations: [
          relation({ claimId: "str_1", claimKind: "strength", evidenceId: "ev_first_home" }),
          relation({
            claimId: "gap_1",
            claimKind: "competitorGap",
            evidenceId: "ev_first_home",
            supportLevel: "PARTIAL_SUPPORT",
          }),
        ],
        coverage,
        sourceContext,
        competitorGapContexts: {
          gap_1: {
            competitorNameSource: "USER_INPUT",
            competitorEntityId: "competitor_jia",
            comparisonDimension: "交付周期",
            currentCompanyComparisonDimension: "交付周期",
            competitorComparisonDimension: "交付周期",
            conclusionWithinEvidence: true,
            negativeOrMissing: true,
            currentCompanyCoverageEstablished: true,
            competitorCoverageEstablished: true,
            boundedScope: true,
          },
        },
        historicalPruneDecisions: [
          historical("str_2", "strength"),
          historical("iss_1", "coreIssue"),
          historical("iss_2", "coreIssue"),
          historical("geo_1", "geoOpportunity", "INVALID_SOURCE_ISSUE_REFERENCE"),
          historical("geo_2", "geoOpportunity", "INVALID_SOURCE_ISSUE_REFERENCE"),
          historical("demo_1", "demonstrationFix", "INVALID_SOURCE_ISSUE_REFERENCE"),
        ],
        assertTruthGuards: (report) => {
          expect(report.competitorGaps).toEqual([]);
        },
        assertPresentation: (report) => {
          expect(report.reportLanguage).toBe("zh-CN");
        },
        now: () => new Date("2026-07-19T12:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      candidateDecisionCount: 8,
      newPruneDecisionCount: 1,
      providerCalls: 0,
    });
    expect(current).toEqual(original);
    expect(repository.appendInput?.prunedClaims).toEqual([
      {
        kind: "competitorGap",
        ref: "gap_1",
        reasonCode: "MISSING_COMPETITOR_OFFICIAL_RELATION",
      },
    ]);
    expect(repository.appendInput?.pruneDecisions).toHaveLength(1);
    expect(repository.appendInput?.pruneDecisions?.[0]).toMatchObject({
      candidateRef: "gap_1",
      reasonCode: "MISSING_COMPETITOR_OFFICIAL_RELATION",
      independentSupportSourceCount: 1,
    });
    const decisions = repository.appendInput?.claimPublicationDecisionBatch?.decisions ?? [];
    expect(decisions.map((item) => item.candidateRef)).toEqual(
      candidateSource.snapshot.candidates.map((item) => item.candidateRef),
    );
    expect(decisions.filter((item) => item.publicationStatus === "PUBLISHED")).toHaveLength(1);
    expect(decisions.find((item) => item.candidateRef === "gap_1")).toMatchObject({
      publicationStatus: "PRUNED",
      reasonCode: "MISSING_COMPETITOR_OFFICIAL_RELATION",
      legacyCheckpointId: "legacy_checkpoint_1",
      candidateSourceProvenance: "LEGACY_ANALYSIS_CHECKPOINT",
      candidateSourcePayloadHash: "payload_hash_1",
    });
  });
});
