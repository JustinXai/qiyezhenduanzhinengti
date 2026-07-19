import { z } from "zod";
import type { EvidenceItem } from "../../../contracts";
import type { EvidenceCoverage } from "../../../contracts/claim-evidence";
import { stableHash } from "./stable-hash";

/** The recovery path is audit-significant. The two modes must never be conflated. */
export const RecoveryMode = z.enum([
  "STRICT_CHECKPOINT_RESUME",
  "FROZEN_EVIDENCE_REANALYSIS",
]);
export type RecoveryMode = z.infer<typeof RecoveryMode>;

/** Negative conclusions are bounded only by the saved Evidence set. */
export const CoverageMode = z.literal("FROZEN_EVIDENCE_SCOPE_ONLY");
export type CoverageMode = z.infer<typeof CoverageMode>;

/** Historical identities that were not persisted remain unavailable. */
export const FrozenEvidenceProvenance = z.literal("UNAVAILABLE");
export type FrozenEvidenceProvenance = z.infer<typeof FrozenEvidenceProvenance>;

/** Competitor resolution is deliberately not reconstructed during this recovery. */
export const CompetitorResolutionStatus = z.literal("UNVERIFIED_LEGACY_STATE");
export type CompetitorResolutionStatus = z.infer<typeof CompetitorResolutionStatus>;

export const RECOVERY_CONTRACT_VERSION = "frozen-evidence-reanalysis.v1" as const;

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u, "expected lowercase SHA-256");
const DistributionCount = z.number().int().nonnegative();

export const FrozenEvidenceSnapshotV1 = z
  .object({
    diagnosisId: z.string().min(1),
    diagnosisInputHash: Sha256,
    evidenceRegistryHash: Sha256,
    normalizedEvidenceHash: Sha256,
    evidenceCount: z.number().int().positive(),
    sortedEvidenceIdsHash: Sha256,
    evidenceUrlsHash: Sha256,
    firstPartyEvidenceCount: DistributionCount,
    observedEvidenceCount: DistributionCount,
    competitorEvidenceCount: DistributionCount,
    languageDistribution: z
      .object({
        zh: DistributionCount,
        other: DistributionCount,
      })
      .strict(),
    sourceTierDistribution: z
      .object({
        A: DistributionCount,
        B: DistributionCount,
        C: DistributionCount,
        D: DistributionCount,
        E: DistributionCount,
      })
      .strict(),
    databaseFileHash: Sha256,
    runLockHash: Sha256,
    capturedAt: z.string().datetime({ offset: true }),
    recoveryContractVersion: z.literal(RECOVERY_CONTRACT_VERSION),
    queryPlanProvenance: FrozenEvidenceProvenance,
    competitorResolutionProvenance: FrozenEvidenceProvenance,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const sourceCount =
      snapshot.firstPartyEvidenceCount +
      snapshot.observedEvidenceCount +
      snapshot.competitorEvidenceCount;
    const languageCount =
      snapshot.languageDistribution.zh + snapshot.languageDistribution.other;
    const tierCount = Object.values(snapshot.sourceTierDistribution).reduce(
      (total, count) => total + count,
      0,
    );

    for (const [path, count] of [
      ["source counts", sourceCount],
      ["languageDistribution", languageCount],
      ["sourceTierDistribution", tierCount],
    ] as const) {
      if (count !== snapshot.evidenceCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must sum to evidenceCount`,
        });
      }
    }
  });
export type FrozenEvidenceSnapshotV1 = z.infer<typeof FrozenEvidenceSnapshotV1>;

export const INSTA360_FROZEN_EVIDENCE_IDENTITY_V1 = Object.freeze({
  diagnosisIdPrefix: "diag_d9d",
  evidenceRegistryHash:
    "9b4ca22dc268d338c8614ba86c17b756594a2a47718b0d883093f9f957e5e7ce",
  normalizedEvidenceHash:
    "b55c9c779c88815ac36e243fb3a19b0f73296e503646f507cd0ea46010eee4fd",
  evidenceCount: 22,
  firstPartyEvidenceCount: 6,
  observedEvidenceCount: 14,
  competitorEvidenceCount: 2,
  languageDistribution: { zh: 22, other: 0 },
  sourceTierDistribution: { A: 6, B: 2, C: 14, D: 0, E: 0 },
} as const);

export type FrozenEvidenceContractErrorCode =
  | "FROZEN_EVIDENCE_SNAPSHOT_INVALID"
  | "FROZEN_EVIDENCE_IDENTITY_MISMATCH"
  | "FROZEN_EVIDENCE_SET_MISMATCH";

export class FrozenEvidenceContractError extends Error {
  constructor(readonly code: FrozenEvidenceContractErrorCode) {
    super(code);
    this.name = "FrozenEvidenceContractError";
  }
}

/** Strict parser. In particular, invented queryPlanHash/competitorResolutionHash fields fail. */
export function parseFrozenEvidenceSnapshotV1(input: unknown): FrozenEvidenceSnapshotV1 {
  const parsed = FrozenEvidenceSnapshotV1.safeParse(input);
  if (!parsed.success) {
    throw new FrozenEvidenceContractError("FROZEN_EVIDENCE_SNAPSHOT_INVALID");
  }
  return parsed.data;
}

export function assertInsta360FrozenEvidenceIdentity(
  input: FrozenEvidenceSnapshotV1,
): void {
  const snapshot = parseFrozenEvidenceSnapshotV1(input);
  const expected = INSTA360_FROZEN_EVIDENCE_IDENTITY_V1;
  const matches =
    snapshot.diagnosisId.startsWith(expected.diagnosisIdPrefix) &&
    snapshot.evidenceRegistryHash === expected.evidenceRegistryHash &&
    snapshot.normalizedEvidenceHash === expected.normalizedEvidenceHash &&
    snapshot.evidenceCount === expected.evidenceCount &&
    snapshot.firstPartyEvidenceCount === expected.firstPartyEvidenceCount &&
    snapshot.observedEvidenceCount === expected.observedEvidenceCount &&
    snapshot.competitorEvidenceCount === expected.competitorEvidenceCount &&
    snapshot.languageDistribution.zh === expected.languageDistribution.zh &&
    snapshot.languageDistribution.other === expected.languageDistribution.other &&
    Object.entries(expected.sourceTierDistribution).every(
      ([tier, count]) =>
        snapshot.sourceTierDistribution[
          tier as keyof FrozenEvidenceSnapshotV1["sourceTierDistribution"]
        ] === count,
    );

  if (!matches) {
    throw new FrozenEvidenceContractError("FROZEN_EVIDENCE_IDENTITY_MISMATCH");
  }
}

export function hashSortedEvidenceIds(ids: readonly string[]): string {
  return stableHash([...ids].sort((left, right) => left.localeCompare(right)));
}

export function hashEvidenceUrls(urls: readonly string[]): string {
  return stableHash([...urls].sort((left, right) => left.localeCompare(right)));
}

export interface FrozenEvidenceScopeCoverageV1 extends EvidenceCoverage {
  coverageMode: CoverageMode;
  snapshotEvidenceRegistryHash: string;
  queryPlanProvenance: FrozenEvidenceProvenance;
}

/**
 * Build the legacy verifier's coverage shape without fabricating a query plan.
 * `boundaryEstablished` means only that the immutable saved set is the explicit
 * measurement boundary; the public claim still has to name that limited scope.
 */
export function createFrozenEvidenceScopeCoverage(input: {
  snapshot: FrozenEvidenceSnapshotV1;
  evidence: readonly EvidenceItem[];
}): FrozenEvidenceScopeCoverageV1 {
  const snapshot = parseFrozenEvidenceSnapshotV1(input.snapshot);
  if (
    input.evidence.length !== snapshot.evidenceCount ||
    hashSortedEvidenceIds(input.evidence.map((item) => item.id)) !==
      snapshot.sortedEvidenceIdsHash ||
    hashEvidenceUrls(input.evidence.map((item) => item.url)) !== snapshot.evidenceUrlsHash
  ) {
    throw new FrozenEvidenceContractError("FROZEN_EVIDENCE_SET_MISMATCH");
  }

  const firstPartyEvidence = input.evidence.filter(
    (item) => item.sourceType === "FIRST_PARTY_EVIDENCE",
  );
  const domains = [
    ...new Set(input.evidence.map((item) => item.sourceDomain.trim().toLowerCase())),
  ].filter(Boolean);

  return {
    coverageMode: "FROZEN_EVIDENCE_SCOPE_ONLY",
    snapshotEvidenceRegistryHash: snapshot.evidenceRegistryHash,
    queryPlanProvenance: "UNAVAILABLE",
    queryPlanId: "",
    plannedQueries: [],
    executedQueries: [],
    successfulQueries: [],
    failedQueries: [],
    searchedDomains: domains,
    crawledPages: firstPartyEvidence.map((item) => item.url),
    crawledFirstPartyUrls: firstPartyEvidence.map((item) => item.url),
    firstPartyDomains: [
      ...new Set(firstPartyEvidence.map((item) => item.sourceDomain.trim().toLowerCase())),
    ].filter(Boolean),
    observedEvidenceIds: input.evidence.map((item) => item.id),
    searchWindow: { from: null, to: snapshot.capturedAt },
    coverageLimitations: [
      "仅覆盖本次保存的公开页面和搜索证据，不代表完整搜索覆盖。",
      "历史查询计划不可验证，本次未重新搜索或抓取。",
    ],
    boundaryEstablished:
      input.evidence.length > 0 && firstPartyEvidence.length > 0,
  };
}
