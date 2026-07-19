import type { DiagnosisReport } from "../../contracts";
import type { ClaimEvidenceRelation } from "../../contracts/claim-evidence";
import {
  classifyPolarity,
  extractVerifiableClaims,
} from "../../diagnosis/verification";
import {
  assertInsta360FrozenEvidenceIdentity,
  CoverageMode,
  type FrozenEvidenceSnapshotV1,
  hashEvidenceUrls,
  hashSortedEvidenceIds,
  parseFrozenEvidenceSnapshotV1,
  RecoveryMode,
  CompetitorResolutionStatus,
} from "../../diagnosis/orchestration/recovery/frozen-evidence-contract";

export const FROZEN_EVIDENCE_QUICK_COMPETITOR_LIMITATION =
  "已收到竞品输入,但本次公开证据不足,暂不做确定性比较。";
export const FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION =
  "本次恢复未重新确认竞品官方网站。";

export const FROZEN_EVIDENCE_NEGATIVE_SCOPE_PREFIXES = [
  "在本次保存的公开证据中，暂未发现",
  "基于本次保存的公开页面和搜索证据，相关说明仍不充分",
] as const;

const UNBOUNDED_NEGATIVE_PHRASES = [
  "官网没有",
  "企业完全没有",
  "搜索结果不存在",
  "市场上没有",
  "AI不会推荐",
] as const;

export type FrozenEvidenceGuardRuleCode =
  | "RECOVERY_MODE_MISMATCH"
  | "COVERAGE_MODE_MISMATCH"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_IDENTITY_MISMATCH"
  | "SNAPSHOT_CURRENT_STATE_MISMATCH"
  | "NEW_EVIDENCE_CREATED"
  | "NEW_SEARCH_RECORD_CREATED"
  | "NEW_CRAWLER_RECORD_CREATED"
  | "COMPETITOR_RESOLUTION_NOT_UNVERIFIED"
  | "COMPETITOR_GAP_NOT_EMPTY"
  | "COMPETITOR_LIMITATION_MISSING"
  | "NEGATIVE_CLAIM_SCOPE_UNBOUNDED"
  | "NEGATIVE_CLAIM_DIRECT_SUPPORT"
  | "NEGATIVE_CLAIM_INSUFFICIENT_INDEPENDENT_EVIDENCE"
  | "NEGATIVE_CLAIM_NOT_SNAPSHOT_BOUNDED"
  | "PUBLIC_RECOVERY_DATA_LEAK";

export interface FrozenEvidenceGuardViolation {
  rule: FrozenEvidenceGuardRuleCode;
  message: string;
  claimId?: string;
  evidenceIds?: string[];
}

export type FrozenEvidenceGuardResult =
  | { ok: true }
  | { ok: false; violations: FrozenEvidenceGuardViolation[] };

export interface FrozenEvidenceCurrentState {
  diagnosisId: string;
  diagnosisInputHash: string;
  evidenceRegistryHash: string;
  normalizedEvidenceHash: string;
  evidenceCount: number;
  sortedEvidenceIdsHash: string;
  evidenceUrlsHash: string;
  firstPartyEvidenceCount: number;
  observedEvidenceCount: number;
  competitorEvidenceCount: number;
  languageDistribution: FrozenEvidenceSnapshotV1["languageDistribution"];
  sourceTierDistribution: FrozenEvidenceSnapshotV1["sourceTierDistribution"];
}

export interface FrozenEvidenceGuardInput {
  recoveryMode: unknown;
  coverageMode: unknown;
  competitorResolutionStatus: unknown;
  snapshot: unknown;
  current: FrozenEvidenceCurrentState;
  activityDelta: {
    evidenceCreated: number;
    searchRecordsCreated: number;
    crawlerRecordsCreated: number;
  };
  report: DiagnosisReport;
  relations: readonly ClaimEvidenceRelation[];
  presentation: {
    quickCompetitorLimitation: string;
    deepCompetitorLimitation: string;
  };
  /** The exact value returned by a public API, not an internal runtime object. */
  publicApiPayload: unknown;
}

function add(
  violations: FrozenEvidenceGuardViolation[],
  rule: FrozenEvidenceGuardRuleCode,
  message: string,
  detail?: Pick<FrozenEvidenceGuardViolation, "claimId" | "evidenceIds">,
): void {
  violations.push({ rule, message, ...detail });
}

function sameDistribution(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function currentMatchesSnapshot(
  current: FrozenEvidenceCurrentState,
  snapshot: FrozenEvidenceSnapshotV1,
): boolean {
  return (
    current.diagnosisId === snapshot.diagnosisId &&
    current.diagnosisInputHash === snapshot.diagnosisInputHash &&
    current.evidenceRegistryHash === snapshot.evidenceRegistryHash &&
    current.normalizedEvidenceHash === snapshot.normalizedEvidenceHash &&
    current.evidenceCount === snapshot.evidenceCount &&
    current.sortedEvidenceIdsHash === snapshot.sortedEvidenceIdsHash &&
    current.evidenceUrlsHash === snapshot.evidenceUrlsHash &&
    current.firstPartyEvidenceCount === snapshot.firstPartyEvidenceCount &&
    current.observedEvidenceCount === snapshot.observedEvidenceCount &&
    current.competitorEvidenceCount === snapshot.competitorEvidenceCount &&
    sameDistribution(current.languageDistribution, snapshot.languageDistribution) &&
    sameDistribution(current.sourceTierDistribution, snapshot.sourceTierDistribution)
  );
}

function reportEvidenceMatchesSnapshot(
  report: DiagnosisReport,
  snapshot: FrozenEvidenceSnapshotV1,
): boolean {
  const sourceCounts = {
    firstParty: report.evidence.filter(
      (item) => item.sourceType === "FIRST_PARTY_EVIDENCE",
    ).length,
    observed: report.evidence.filter(
      (item) => item.sourceType === "OBSERVED_WEB_EVIDENCE",
    ).length,
    competitor: report.evidence.filter(
      (item) => item.sourceType === "COMPETITOR_WEB_EVIDENCE",
    ).length,
  };
  const languageDistribution = {
    zh: report.evidence.filter((item) => item.language === "zh").length,
    other: report.evidence.filter((item) => item.language === "other").length,
  };
  const sourceTierDistribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const item of report.evidence) {
    if (item.sourceTier) sourceTierDistribution[item.sourceTier] += 1;
  }

  return (
    report.diagnosisId === snapshot.diagnosisId &&
    report.evidence.length === snapshot.evidenceCount &&
    hashSortedEvidenceIds(report.evidence.map((item) => item.id)) ===
      snapshot.sortedEvidenceIdsHash &&
    hashEvidenceUrls(report.evidence.map((item) => item.url)) ===
      snapshot.evidenceUrlsHash &&
    sourceCounts.firstParty === snapshot.firstPartyEvidenceCount &&
    sourceCounts.observed === snapshot.observedEvidenceCount &&
    sourceCounts.competitor === snapshot.competitorEvidenceCount &&
    sameDistribution(languageDistribution, snapshot.languageDistribution) &&
    sameDistribution(sourceTierDistribution, snapshot.sourceTierDistribution)
  );
}

const INTERNAL_PUBLIC_KEYS = new Set(
  [
    "recoveryMode",
    "coverageMode",
    "frozenEvidenceSnapshot",
    "snapshotEvidenceRegistryHash",
    "queryPlanProvenance",
    "competitorResolutionProvenance",
    "competitorResolutionStatus",
    "recoveryContractVersion",
    "databaseFileHash",
    "runLockHash",
    "repairAttempt",
    "reusedStages",
    "rerunStages",
    "analysisStageRuns",
    "missingHistoricalProvenance",
    "providerBudget",
  ].map((key) => key.toLowerCase()),
);

function publicPayloadLeaksInternalData(
  value: unknown,
  snapshot: FrozenEvidenceSnapshotV1,
): boolean {
  const forbiddenValues = [
    "FROZEN_EVIDENCE_REANALYSIS",
    "STRICT_CHECKPOINT_RESUME",
    "FROZEN_EVIDENCE_SCOPE_ONLY",
    "UNVERIFIED_LEGACY_STATE",
    "REPORT_CLAIMS_FAILED",
    snapshot.diagnosisInputHash,
    snapshot.evidenceRegistryHash,
    snapshot.normalizedEvidenceHash,
    snapshot.sortedEvidenceIdsHash,
    snapshot.evidenceUrlsHash,
    snapshot.databaseFileHash,
    snapshot.runLockHash,
  ];
  const seen = new Set<object>();

  const visit = (candidate: unknown): boolean => {
    if (typeof candidate === "string") {
      return forbiddenValues.some((forbidden) => candidate.includes(forbidden));
    }
    if (!candidate || typeof candidate !== "object") return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(visit);
    return Object.entries(candidate).some(
      ([key, child]) => INTERNAL_PUBLIC_KEYS.has(key.toLowerCase()) || visit(child),
    );
  };

  return visit(value);
}

function checkNegativeClaims(
  input: FrozenEvidenceGuardInput,
  violations: FrozenEvidenceGuardViolation[],
): void {
  const relationsByClaim = new Map<string, ClaimEvidenceRelation[]>();
  for (const relation of input.relations) {
    const current = relationsByClaim.get(relation.claimId) ?? [];
    current.push(relation);
    relationsByClaim.set(relation.claimId, current);
  }

  for (const claim of extractVerifiableClaims(input.report)) {
    if (classifyPolarity({ kind: claim.kind, text: claim.text }) !== "NEGATIVE_MISSING") {
      continue;
    }
    const detail = { claimId: claim.id, evidenceIds: claim.candidateEvidenceIds };
    const bounded = FROZEN_EVIDENCE_NEGATIVE_SCOPE_PREFIXES.some((prefix) =>
      claim.text.includes(prefix),
    );
    const forbidden = UNBOUNDED_NEGATIVE_PHRASES.find((phrase) =>
      claim.text.includes(phrase),
    );
    if (!bounded || forbidden) {
      add(
        violations,
        "NEGATIVE_CLAIM_SCOPE_UNBOUNDED",
        `negative claim ${claim.id} is not limited to the saved public Evidence scope`,
        detail,
      );
    }

    const relations = relationsByClaim.get(claim.id) ?? [];
    if (relations.some((relation) => relation.supportLevel === "DIRECT_SUPPORT")) {
      add(
        violations,
        "NEGATIVE_CLAIM_DIRECT_SUPPORT",
        `negative claim ${claim.id} may be at most PARTIAL_SUPPORT`,
        detail,
      );
    }
    const partialEvidenceIds = new Set(
      relations
        .filter((relation) => relation.supportLevel === "PARTIAL_SUPPORT")
        .map((relation) => relation.evidenceId),
    );
    if (partialEvidenceIds.size < 2) {
      add(
        violations,
        "NEGATIVE_CLAIM_INSUFFICIENT_INDEPENDENT_EVIDENCE",
        `negative claim ${claim.id} must be pruned unless it has two independent PARTIAL_SUPPORT relations`,
        detail,
      );
    }
    if (
      relations.some(
        (relation) =>
          relation.supportLevel === "PARTIAL_SUPPORT" &&
          relation.basis !== "MEASUREMENT_BOUNDARY",
      )
    ) {
      add(
        violations,
        "NEGATIVE_CLAIM_NOT_SNAPSHOT_BOUNDED",
        `negative claim ${claim.id} must use the frozen-scope measurement boundary`,
        detail,
      );
    }
  }
}

/** Additive guard for FROZEN_EVIDENCE_REANALYSIS; it does not replace Publish Guard. */
export function frozenEvidenceGuard(
  input: FrozenEvidenceGuardInput,
): FrozenEvidenceGuardResult {
  const violations: FrozenEvidenceGuardViolation[] = [];

  if (!RecoveryMode.safeParse(input.recoveryMode).success ||
      input.recoveryMode !== "FROZEN_EVIDENCE_REANALYSIS") {
    add(violations, "RECOVERY_MODE_MISMATCH", "recovery mode must be frozen-Evidence reanalysis");
  }
  if (!CoverageMode.safeParse(input.coverageMode).success) {
    add(violations, "COVERAGE_MODE_MISMATCH", "coverage must be limited to the frozen Evidence scope");
  }
  if (!CompetitorResolutionStatus.safeParse(input.competitorResolutionStatus).success) {
    add(
      violations,
      "COMPETITOR_RESOLUTION_NOT_UNVERIFIED",
      "legacy competitor resolution must remain unverified",
    );
  }

  let snapshot: FrozenEvidenceSnapshotV1 | undefined;
  try {
    snapshot = parseFrozenEvidenceSnapshotV1(input.snapshot);
  } catch {
    add(violations, "SNAPSHOT_INVALID", "frozen Evidence snapshot contract is invalid");
  }

  if (snapshot) {
    try {
      assertInsta360FrozenEvidenceIdentity(snapshot);
    } catch {
      add(violations, "SNAPSHOT_IDENTITY_MISMATCH", "the 22-Evidence canary identity changed");
    }
    if (!currentMatchesSnapshot(input.current, snapshot)) {
      add(
        violations,
        "SNAPSHOT_CURRENT_STATE_MISMATCH",
        "current diagnosis or frozen Evidence identity differs from the snapshot",
      );
    }
    if (!reportEvidenceMatchesSnapshot(input.report, snapshot)) {
      add(
        violations,
        "SNAPSHOT_CURRENT_STATE_MISMATCH",
        "canonical report does not contain exactly the frozen 22-Evidence set",
      );
    }
  }

  if (input.activityDelta.evidenceCreated !== 0) {
    add(violations, "NEW_EVIDENCE_CREATED", "frozen reanalysis must not create Evidence");
  }
  if (input.activityDelta.searchRecordsCreated !== 0) {
    add(violations, "NEW_SEARCH_RECORD_CREATED", "frozen reanalysis must not create search records");
  }
  if (input.activityDelta.crawlerRecordsCreated !== 0) {
    add(violations, "NEW_CRAWLER_RECORD_CREATED", "frozen reanalysis must not create crawler records");
  }

  if (input.report.competitorGaps.length !== 0) {
    add(
      violations,
      "COMPETITOR_GAP_NOT_EMPTY",
      "unverified legacy competitor resolution requires competitorGaps=[]",
    );
  }
  if (
    input.presentation.quickCompetitorLimitation !==
      FROZEN_EVIDENCE_QUICK_COMPETITOR_LIMITATION ||
    input.presentation.deepCompetitorLimitation !==
      FROZEN_EVIDENCE_DEEP_COMPETITOR_LIMITATION
  ) {
    add(
      violations,
      "COMPETITOR_LIMITATION_MISSING",
      "Quick and Deep must state the deterministic competitor limitation",
    );
  }

  checkNegativeClaims(input, violations);

  if (snapshot && publicPayloadLeaksInternalData(input.publicApiPayload, snapshot)) {
    add(
      violations,
      "PUBLIC_RECOVERY_DATA_LEAK",
      "public API payload contains internal recovery state or frozen hashes",
    );
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
