import { describe, expect, it } from "vitest";
import type { DiagnosisReport, EvidenceItem } from "../../src/contracts";
import type { ClaimEvidenceRelation } from "../../src/contracts/claim-evidence";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  hashEvidenceUrls,
  hashSortedEvidenceIds,
  INSTA360_FROZEN_EVIDENCE_IDENTITY_V1,
  RECOVERY_CONTRACT_VERSION,
  type FrozenEvidenceSnapshotV1,
} from "../../src/diagnosis/orchestration/recovery/frozen-evidence-contract";
import {
  FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
  FROZEN_EVIDENCE_QUICK_COMPETITOR_LIMITATION,
  frozenEvidenceGuard,
  type FrozenEvidenceGuardInput,
  type FrozenEvidenceGuardRuleCode,
} from "../../src/report/validation/frozen-evidence-guard";

const hash = (character: string): string => character.repeat(64);
const DIAGNOSIS_ID = "diag_d9d81ba3428f4696b088870ca7416e49";

function evidenceSet(): EvidenceItem[] {
  return Array.from({ length: 22 }, (_, index) => {
    const firstParty = index < 6;
    const competitor = index >= 6 && index < 8;
    return {
      id: `ev_${String(index).padStart(2, "0")}`,
      title: `证据 ${index}`,
      sourceDomain: firstParty
        ? "insta360.com"
        : competitor
          ? "competitor.example"
          : "media.example",
      sourceType: firstParty
        ? "FIRST_PARTY_EVIDENCE"
        : competitor
          ? "COMPETITOR_WEB_EVIDENCE"
          : "OBSERVED_WEB_EVIDENCE",
      authorityLevel: firstParty ? "OWNED" : "PUBLIC",
      supportLevel: "CONTEXT_ONLY",
      fetchedAt: "2026-07-19T00:00:00.000Z",
      snippet: `保存的中文公开证据 ${index}`,
      url: `https://evidence.example/${index}`,
      language: "zh",
      sourceTier: firstParty ? "A" : competitor ? "B" : "C",
    } satisfies EvidenceItem;
  });
}

function snapshot(evidence: EvidenceItem[]): FrozenEvidenceSnapshotV1 {
  return {
    diagnosisId: DIAGNOSIS_ID,
    diagnosisInputHash: hash("1"),
    evidenceRegistryHash:
      INSTA360_FROZEN_EVIDENCE_IDENTITY_V1.evidenceRegistryHash,
    normalizedEvidenceHash:
      INSTA360_FROZEN_EVIDENCE_IDENTITY_V1.normalizedEvidenceHash,
    evidenceCount: 22,
    sortedEvidenceIdsHash: hashSortedEvidenceIds(evidence.map((item) => item.id)),
    evidenceUrlsHash: hashEvidenceUrls(evidence.map((item) => item.url)),
    firstPartyEvidenceCount: 6,
    observedEvidenceCount: 14,
    competitorEvidenceCount: 2,
    languageDistribution: { zh: 22, other: 0 },
    sourceTierDistribution: { A: 6, B: 2, C: 14, D: 0, E: 0 },
    databaseFileHash: hash("2"),
    runLockHash: hash("3"),
    capturedAt: "2026-07-19T08:00:00.000+08:00",
    recoveryContractVersion: RECOVERY_CONTRACT_VERSION,
    queryPlanProvenance: "UNAVAILABLE",
    competitorResolutionProvenance: "UNAVAILABLE",
  };
}

function report(evidence: EvidenceItem[]): DiagnosisReport {
  return buildSampleReport({
    diagnosisId: DIAGNOSIS_ID,
    evidence,
    strengths: [],
    coreIssues: [
      {
        id: "iss_1",
        claimType: "DIAGNOSTIC_INFERENCE",
        statement: "在本次保存的公开证据中，暂未发现完整的采购问答说明",
        businessImpact: "客户需要跨页面拼接关键信息",
        fixDirection: "整理已有材料并补充结构化问答",
        evidenceIds: ["ev_00", "ev_08"],
      },
    ],
    competitorGaps: [],
    geoOpportunities: [],
    demonstrationFix: null,
  });
}

function relations(): ClaimEvidenceRelation[] {
  return ["ev_00", "ev_08"].map((evidenceId, index) => ({
    claimId: "iss_1",
    claimKind: "coreIssue",
    evidenceId,
    supportLevel: index === 0 ? "DIRECT_SUPPORT" : "PARTIAL_SUPPORT",
    confidence: 0.7,
    justification: "仅在保存的证据范围内形成测量边界",
    basis: "MEASUREMENT_BOUNDARY",
    verifierMode: "MOCK_DETERMINISTIC",
    verifierVersion: "frozen-evidence.test.v1",
  }));
}

function validInput(): FrozenEvidenceGuardInput {
  const evidence = evidenceSet();
  const frozen = snapshot(evidence);
  return {
    recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
    coverageMode: "FROZEN_EVIDENCE_SCOPE_ONLY",
    competitorResolutionStatus: "UNVERIFIED_LEGACY_STATE",
    snapshot: frozen,
    current: {
      diagnosisId: frozen.diagnosisId,
      diagnosisInputHash: frozen.diagnosisInputHash,
      evidenceRegistryHash: frozen.evidenceRegistryHash,
      normalizedEvidenceHash: frozen.normalizedEvidenceHash,
      evidenceCount: frozen.evidenceCount,
      sortedEvidenceIdsHash: frozen.sortedEvidenceIdsHash,
      evidenceUrlsHash: frozen.evidenceUrlsHash,
      firstPartyEvidenceCount: frozen.firstPartyEvidenceCount,
      observedEvidenceCount: frozen.observedEvidenceCount,
      competitorEvidenceCount: frozen.competitorEvidenceCount,
      languageDistribution: frozen.languageDistribution,
      sourceTierDistribution: frozen.sourceTierDistribution,
    },
    activityDelta: {
      evidenceCreated: 0,
      searchRecordsCreated: 0,
      crawlerRecordsCreated: 0,
    },
    report: report(evidence),
    relations: relations(),
    presentation: {
      quickCompetitorLimitation: FROZEN_EVIDENCE_QUICK_COMPETITOR_LIMITATION,
      deepCompetitorLimitation: FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION,
    },
    publicApiPayload: {
      diagnosisId: DIAGNOSIS_ID,
      status: "READY",
      report: { reportLanguage: "zh-CN", competitorGaps: [] },
    },
  };
}

function codes(input: FrozenEvidenceGuardInput): FrozenEvidenceGuardRuleCode[] {
  const result = frozenEvidenceGuard(input);
  return result.ok ? [] : result.violations.map((violation) => violation.rule);
}

describe("frozenEvidenceGuard", () => {
  it("accepts the unchanged 22-Evidence canary with bounded negatives and no competitor gaps", () => {
    expect(frozenEvidenceGuard(validInput())).toEqual({ ok: true });
  });

  it("keeps the captured database hash as audit data without comparing a post-recovery DB file", () => {
    const input = validInput();
    input.snapshot = {
      ...(input.snapshot as FrozenEvidenceSnapshotV1),
      databaseFileHash: hash("9"),
    };

    // analysis_stage_runs, repair-attempt and report writes legitimately change
    // the physical SQLite file; immutable Evidence identity remains the guard.
    expect(frozenEvidenceGuard(input)).toEqual({ ok: true });
  });

  it("applies the shared Issue threshold and rejects PARTIAL-only frozen negatives", () => {
    const input = validInput();
    input.relations = input.relations.map((relation) => ({
      ...relation,
      supportLevel: "PARTIAL_SUPPORT",
    }));
    expect(codes(input)).toContain("NEGATIVE_CLAIM_INSUFFICIENT_INDEPENDENT_EVIDENCE");
  });

  it("rejects the strict-resume mode and any current Evidence identity change", () => {
    const input = validInput();
    input.recoveryMode = "STRICT_CHECKPOINT_RESUME";
    input.current.evidenceCount = 23;
    expect(codes(input)).toEqual(
      expect.arrayContaining(["RECOVERY_MODE_MISMATCH", "SNAPSHOT_CURRENT_STATE_MISMATCH"]),
    );
  });

  it("rejects new Evidence, search, or crawler records", () => {
    const input = validInput();
    input.activityDelta = {
      evidenceCreated: 1,
      searchRecordsCreated: 1,
      crawlerRecordsCreated: 1,
    };
    expect(codes(input)).toEqual(
      expect.arrayContaining([
        "NEW_EVIDENCE_CREATED",
        "NEW_SEARCH_RECORD_CREATED",
        "NEW_CRAWLER_RECORD_CREATED",
      ]),
    );
  });

  it("rejects deterministic competitor gaps when legacy resolution is unverified", () => {
    const input = validInput();
    input.competitorResolutionStatus = "VERIFIED";
    input.report.competitorGaps = [
      {
        id: "gap_1",
        competitorName: "GoPro",
        gapStatement: "形成确定性差距",
        evidenceIds: ["ev_06"],
      },
    ];
    input.presentation.quickCompetitorLimitation = "有明确竞品差距";
    expect(codes(input)).toEqual(
      expect.arrayContaining([
        "COMPETITOR_RESOLUTION_NOT_UNVERIFIED",
        "COMPETITOR_GAP_NOT_EMPTY",
        "COMPETITOR_LIMITATION_MISSING",
      ]),
    );
  });

  it("rejects an absolute negative even when DIRECT satisfies its base threshold", () => {
    const input = validInput();
    input.report.coreIssues[0]!.statement = "官网没有采购问答说明";
    input.relations = [
      {
        ...relations()[0]!,
        supportLevel: "DIRECT_SUPPORT",
        basis: "CONTENT_MATCH",
      },
    ];
    expect(codes(input)).toEqual(
      expect.arrayContaining(["NEGATIVE_CLAIM_SCOPE_UNBOUNDED"]),
    );
    expect(codes(input)).not.toContain("NEGATIVE_CLAIM_INSUFFICIENT_INDEPENDENT_EVIDENCE");
  });

  it("rejects internal recovery fields or snapshot hashes in the public API", () => {
    const input = validInput();
    input.publicApiPayload = {
      diagnosisId: DIAGNOSIS_ID,
      recoveryMode: "FROZEN_EVIDENCE_REANALYSIS",
      evidenceRegistryHash:
        INSTA360_FROZEN_EVIDENCE_IDENTITY_V1.evidenceRegistryHash,
    };
    expect(codes(input)).toContain("PUBLIC_RECOVERY_DATA_LEAK");
  });
});
