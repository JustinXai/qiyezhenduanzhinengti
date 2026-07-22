import { describe, expect, it } from "vitest";
import type { ClaimEvidenceRelation } from "../../src/contracts/claim-evidence";
import { deriveCoverage } from "../../src/contracts/claim-evidence";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  evaluateClaimPublication,
  negativeScopeTextFromReport,
} from "../../src/report/validation/claim-publication-policy";
import { evaluateCompetitorGapPublication } from "../../src/report/validation/competitor-gap-publication-policy";
import {
  CANDIDATE_SOURCE_RESOLVER_VERSION,
  resolveCandidateSourceV1,
} from "../../src/runtime/candidate-source-resolver";
import { validateClaimPublicationDecisionBatch } from "../../src/storage/claim-publication-decisions";
import {
  REPLAY_PACK_V1_CLASSIFICATIONS,
  ROUND6A_UNIFIED_REPLAY_PACK_V1,
} from "../fixtures/replay-pack-v1";

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

describe("Round-6A unified replay pack", () => {
  it("keeps every historical failure classified before it can block the phase", () => {
    expect(ROUND6A_UNIFIED_REPLAY_PACK_V1).not.toEqual([]);
    for (const item of ROUND6A_UNIFIED_REPLAY_PACK_V1) {
      expect(REPLAY_PACK_V1_CLASSIFICATIONS).toContain(item.classification);
      expect(item.blocking).toBe(
        item.classification === "P0_TRUTH_OR_SECURITY" ||
          item.classification === "IMPLEMENTATION_BUG",
      );
    }
  });

  it("replays the legacy candidate-source schema failure through the single resolver", () => {
    const report = buildSampleReport();
    const result = resolveCandidateSourceV1({
      diagnosisId: report.diagnosisId,
      canonicalCreatedAt: new Date("2026-07-19T12:00:00.000Z"),
      evidence: report.evidence.map((item) => ({ id: item.id })),
      stageRuns: [],
      legacyCheckpoint: {
        id: "legacy_bad",
        diagnosisId: report.diagnosisId,
        stage: "ANALYZING",
        inputHash: "input",
        outputJson: JSON.stringify({
          report,
          prunedCandidates: [],
          rawProviderResponse: "forbidden",
        }),
        reportContractVersion: report.reportContractVersion,
        scoreContractVersion: report.scoreContractVersion,
        providerModel: "deepseek-v4-flash",
        promptVersion: "test",
        trustGuardVersion: CANDIDATE_SOURCE_RESOLVER_VERSION,
        completedAt: new Date("2026-07-19T11:59:00.000Z"),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CANDIDATE_SOURCE_NOT_FOUND",
        replayFact: {
          classification: "IMPLEMENTATION_BUG",
          component: "CANDIDATE_SOURCE_RESOLVER_V1",
        },
      },
    });
  });

  it("replays missing negative-scope coverage as the shared claim policy decision", () => {
    const report = buildSampleReport();
    const issue = {
      ...report.coreIssues[0]!,
      statement: "官网缺少清晰 FAQ 内容",
    };
    report.coreIssues = [issue];
    const coverage = deriveCoverage({
      evidence: report.evidence,
      firstPartyDomains: ["example-equip.com"],
      executedQueries: ["FAQ"],
    });
    const decision = evaluateClaimPublication({
      claim: {
        id: issue.id,
        kind: "coreIssue",
        text: issue.statement,
        negativeScopeText: negativeScopeTextFromReport(report, "coreIssue", issue.id),
        evidenceIds: issue.evidenceIds,
      },
      relations: [
        relation({
          claimId: issue.id,
          claimKind: "coreIssue",
          evidenceId: issue.evidenceIds[0]!,
        }),
      ],
      evidence: report.evidence,
      coverage,
      sourceContext: {
        companyId: report.diagnosisId,
        firstPartyDomains: ["example-equip.com"],
        competitorEntities: [],
      },
    });

    expect(decision).toMatchObject({
      outcome: "PRUNE",
      rule: "SCOPE_LIMITATION_MISSING",
    });
  });

  it("replays competitor gaps without official competitor relation through the shared policy", () => {
    const report = buildSampleReport({
      coreIssues: [],
      geoOpportunities: [],
      demonstrationFix: null,
    });
    report.competitorGaps = [
      {
        ...report.competitorGaps[0]!,
        evidenceIds: ["ev_first_home", "ev_competitor_home"],
      },
    ];
    const decision = evaluateCompetitorGapPublication({
      gap: report.competitorGaps[0]!,
      evidence: report.evidence,
      relations: [
        relation({
          claimId: "gap_1",
          claimKind: "competitorGap",
          evidenceId: "ev_first_home",
          supportLevel: "PARTIAL_SUPPORT",
        }),
      ],
      sourceContext: {
        companyId: report.diagnosisId,
        firstPartyDomains: ["example-equip.com"],
        competitorEntities: [
          {
            competitorEntityId: "competitor_jia",
            domains: ["competitor-jia.example.net"],
            evidenceIds: ["ev_competitor_home"],
          },
        ],
      },
      metadata: {
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
    });

    expect(decision).toMatchObject({
      outcome: "PRUNE",
      reason: "MISSING_COMPETITOR_OFFICIAL_RELATION",
    });
  });

  it("replays final candidate ledger completeness through one validator", () => {
    expect(() =>
      validateClaimPublicationDecisionBatch({
        expectedCandidates: [
          { claimKind: "strength", candidateRef: "str_1" },
          { claimKind: "competitorGap", candidateRef: "gap_1" },
        ],
        decisions: [
          {
            id: "decision_1",
            diagnosisId: "diag_sample_0001",
            reportId: null,
            revisionId: "revision_1",
            stageRunId: null,
            legacyCheckpointId: "legacy_checkpoint_1",
            candidateSourceProvenance: "LEGACY_ANALYSIS_CHECKPOINT",
            candidateSourcePayloadHash: "payload_hash_1",
            candidateRef: "str_1",
            claimKind: "strength",
            publicationStatus: "PUBLISHED",
            reasonCode: "PUBLISHED",
            guardRule: "claim-publication-policy.v1",
            evidenceIds: ["ev_first_home"],
            directCount: 1,
            partialCount: 0,
            contextCount: 0,
            independentSupportSourceCount: 1,
            coverageStatus: "ESTABLISHED_AND_BOUNDED",
            algorithmVersion: "refinalize-current-truth-policy.v1",
            createdAt: new Date("2026-07-19T12:00:00.000Z"),
          },
        ],
      }),
    ).toThrow("CLAIM_PUBLICATION_DECISION_COUNT_MISMATCH");
  });
});
