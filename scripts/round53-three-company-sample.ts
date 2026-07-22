import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { ClaimPruneReasonCode } from "../src/contracts/claim-reason-codes";
import type { EvidenceCoverage } from "../src/contracts/claim-evidence";
import type { MeasurementComposition } from "../src/contracts";
import {
  evaluateClaimPublication,
  type ClaimPublicationSourceContext,
} from "../src/report/validation";

export type EvidenceTier = "A" | "B" | "C" | "D" | "E";
export type SampleEvidenceSourceType =
  | "FIRST_PARTY_EVIDENCE"
  | "COMPETITOR_WEB_EVIDENCE"
  | "OBSERVED_WEB_EVIDENCE";
export type SampleClaimKind = "STRENGTH" | "ISSUE";
export type VerificationVerdict = "SUPPORTED" | "UNSUPPORTED";
export type ClaimPublicationStatus = "PUBLISHED" | "DEEP_NEEDS_CONFIRMATION" | "PRUNED";
export type OpportunityPublicationStatus = "PUBLISHED" | "PRUNED";
export type SupportLevel = "DIRECT_SUPPORT" | "PARTIAL_SUPPORT" | "CONTEXT_ONLY" | "UNSUPPORTED";

export interface SampleEvidence {
  id: string;
  language: string;
  normalizedDomain: string;
  tier: EvidenceTier;
  sourceType: SampleEvidenceSourceType;
}

export interface SampleSupportRelation {
  evidenceId: string;
  supportLevel: SupportLevel;
  basis: "CONTENT_MATCH" | "MEASUREMENT_BOUNDARY";
}

export interface SampleClaimCandidate {
  id: string;
  kind: SampleClaimKind;
  text: string;
  publicationStatus: ClaimPublicationStatus;
  verificationVerdict: VerificationVerdict;
  support: SampleSupportRelation[];
  negativeOrMissing: boolean;
  coverageLimited: boolean;
  /** Required for DEEP_NEEDS_CONFIRMATION observations. */
  needsConfirmationNotice?: boolean;
  savedEvidenceScopeNotice?: boolean;
  notDeterministicConclusion?: boolean;
  pruneReason?: ClaimPruneReasonCode;
}

export interface SampleOpportunityCandidate {
  id: string;
  text: string;
  publicationStatus: OpportunityPublicationStatus;
  verificationVerdict: VerificationVerdict;
  sourceIssueId: string;
  evidenceIds: string[];
  support: SampleSupportRelation[];
  customerQuestion: string;
  contentGap: string;
  recommendedAction: string;
  priorityReason: string;
  /** Marks a generic template candidate, even when the guard correctly prunes it. */
  genericTemplate: boolean;
  pruneReason?: ClaimPruneReasonCode;
}

export interface SampleDemonstrationFix {
  publicationStatus: OpportunityPublicationStatus;
  sourceIssueId: string;
  evidenceIds: string[];
  pruneReason?: ClaimPruneReasonCode;
}

export interface ProviderCallCounts {
  bocha: number;
  crawler: number;
  deepseek: number;
  /** Additional calls caused only by Quick/Deep/Evidence view switching. */
  viewSwitchAdditional: number;
}

export interface CompanySampleFixture {
  companyId: string;
  evidence: SampleEvidence[];
  coverage: EvidenceCoverage;
  sourceContext: ClaimPublicationSourceContext;
  claims: SampleClaimCandidate[];
  opportunities: SampleOpportunityCandidate[];
  demonstrationFix: SampleDemonstrationFix | null;
  quickVisibleCharacters: number;
  durationMs: number;
  providerCalls: ProviderCallCounts;
  scoreCoverage: number;
  measurementComposition: MeasurementComposition;
}

export interface CompanySampleMetrics {
  companyId: string;
  evidenceCount: number;
  chineseEvidenceRatio: number;
  tierDistribution: Record<EvidenceTier, number>;
  strengthCandidateCount: number;
  strengthPublishedCount: number;
  issueCandidateCount: number;
  issuePublishedCount: number;
  needsConfirmationIssueCount: number;
  opportunityCandidateCount: number;
  opportunityPublishedCount: number;
  demonstrationFixCandidate: boolean;
  demonstrationFixPublished: boolean;
  credibleDemonstrationFix: boolean;
  pruneReasons: Partial<Record<ClaimPruneReasonCode, number>>;
  evidenceUtilizationRate: number;
  claimPublicationRate: number | null;
  opportunityYieldRate: number | null;
  quickVisibleCharacters: number;
  durationMs: number;
  providerCalls: ProviderCallCounts & { analysisTotal: number };
  scoreCoverage: number;
  measurementComposition: MeasurementComposition;
  truthGuardPassed: boolean;
  publishedUnsupportedClaimCount: number;
  publishedOpportunityLineageValidCount: number;
  publishedOpportunityLineageInvalidCount: number;
  genericOpportunityCandidateCount: number;
  hasCredibleOpportunity: boolean;
  sparseButTruthful: boolean;
}

export const ROUND53_SAMPLE_GATE_IDS = [
  "ALL_TRUTH_GUARDS_PASS",
  "NO_UNSUPPORTED_PUBLISHED_CLAIMS",
  "ALL_QUICK_WITHIN_1800",
  "ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS",
  "ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID",
  "AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY",
  "AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX",
  "NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES",
  "OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY",
  "SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE",
] as const;

export type Round53SampleGateId = (typeof ROUND53_SAMPLE_GATE_IDS)[number];

export interface SampleGateResult {
  id: Round53SampleGateId;
  passed: boolean;
  observed: string;
}

export interface ThreeCompanySampleEvaluation {
  harnessVersion: "round53-three-company-sample.v1";
  companyMetrics: CompanySampleMetrics[];
  gates: SampleGateResult[];
  ready: boolean;
}

const EPSILON = 1e-9;

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function optionalRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : ratio(numerator, denominator);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertFraction(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
}

function evidenceForPolicy(item: SampleEvidence) {
  return {
    id: item.id,
    title: item.id,
    sourceDomain: item.normalizedDomain,
    sourceType: item.sourceType,
    authorityLevel: `TIER_${item.tier}`,
    supportLevel: "CONTEXT_ONLY" as const,
    fetchedAt: "2026-07-20T00:00:00.000Z",
    snippet: `${item.id} sample evidence`,
    url: `https://${item.normalizedDomain}/sample/${encodeURIComponent(item.id)}`,
    language: item.language.toLowerCase().startsWith("zh") ? "zh" as const : "other" as const,
    sourceTier: item.tier,
    normalizedDomain: item.normalizedDomain,
  };
}

function policyDecision(
  fixture: CompanySampleFixture,
  claim: {
    id: string;
    kind: "coreIssue" | "strength" | "geoOpportunity";
    text: string;
    negativeScopeText: string;
  },
  evidenceIds: readonly string[],
  support: readonly SampleSupportRelation[],
) {
  return evaluateClaimPublication({
    claim: { ...claim, evidenceIds },
    relations: support.map((relation) => ({
      claimId: claim.id,
      claimKind: claim.kind,
      evidenceId: relation.evidenceId,
      supportLevel: relation.supportLevel,
      confidence: 1,
      justification: "Round-6 deterministic sample fixture",
      basis: relation.basis,
      verifierMode: "MOCK_DETERMINISTIC" as const,
      verifierVersion: "round6-sample.v1",
    })),
    evidence: fixture.evidence.map(evidenceForPolicy),
    coverage: fixture.coverage,
    sourceContext: fixture.sourceContext,
  });
}

function publicClaimMeetsTruthGuard(
  fixture: CompanySampleFixture,
  claim: SampleClaimCandidate,
  evidenceById: ReadonlyMap<string, SampleEvidence>,
): boolean {
  if (claim.publicationStatus === "PRUNED") return true;
  if (claim.verificationVerdict === "UNSUPPORTED") return false;
  if (claim.support.some((relation) => !evidenceById.has(relation.evidenceId))) return false;
  if (claim.negativeOrMissing && !claim.coverageLimited) return false;

  const decision = policyDecision(
    fixture,
    {
      id: claim.id,
      kind: claim.kind === "ISSUE" ? "coreIssue" : "strength",
      text: claim.text,
      negativeScopeText: claim.text,
    },
    claim.support.map((relation) => relation.evidenceId),
    claim.support,
  );

  if (claim.publicationStatus === "DEEP_NEEDS_CONFIRMATION") {
    return (
      claim.kind === "ISSUE" &&
      decision.outcome === "PRUNE" &&
      decision.rule === "INSUFFICIENT_DIRECT_SUPPORT" &&
      claim.needsConfirmationNotice === true &&
      claim.savedEvidenceScopeNotice === true &&
      claim.notDeterministicConclusion === true
    );
  }

  return decision.outcome === "PUBLISH";
}

function opportunityLineageValid(
  fixture: CompanySampleFixture,
  opportunity: SampleOpportunityCandidate,
  publishedIssueIds: ReadonlySet<string>,
  evidenceById: ReadonlyMap<string, SampleEvidence>,
): boolean {
  if (opportunity.publicationStatus !== "PUBLISHED") return false;
  if (opportunity.verificationVerdict !== "SUPPORTED" || opportunity.genericTemplate) return false;
  if (!publishedIssueIds.has(opportunity.sourceIssueId) || opportunity.evidenceIds.length === 0) return false;
  if (new Set(opportunity.evidenceIds).size !== opportunity.evidenceIds.length) return false;
  if (opportunity.evidenceIds.some((id) => !evidenceById.has(id))) return false;
  if (
    opportunity.support.some(
      (relation) =>
        !evidenceById.has(relation.evidenceId) || !opportunity.evidenceIds.includes(relation.evidenceId),
    )
  ) {
    return false;
  }
  if (
    !opportunity.customerQuestion.trim() ||
    !opportunity.recommendedAction.trim() ||
    !opportunity.priorityReason.trim()
  ) {
    return false;
  }
  const decision = policyDecision(
    fixture,
    {
      id: opportunity.id,
      kind: "geoOpportunity",
      text: `${opportunity.text} ${opportunity.customerQuestion} ${opportunity.contentGap}`,
      negativeScopeText: opportunity.contentGap,
    },
    opportunity.evidenceIds,
    opportunity.support,
  );
  return decision.outcome === "PUBLISH";
}

function incrementReason(
  target: Partial<Record<ClaimPruneReasonCode, number>>,
  reason: ClaimPruneReasonCode | undefined,
): void {
  if (reason) target[reason] = (target[reason] ?? 0) + 1;
}

function validateFixture(fixture: CompanySampleFixture): void {
  if (!fixture.companyId.trim()) throw new Error("companyId must not be blank");
  assertNonNegativeInteger(fixture.quickVisibleCharacters, `${fixture.companyId}.quickVisibleCharacters`);
  assertNonNegativeInteger(fixture.durationMs, `${fixture.companyId}.durationMs`);
  for (const [key, value] of Object.entries(fixture.providerCalls)) {
    assertNonNegativeInteger(value, `${fixture.companyId}.providerCalls.${key}`);
  }
  assertFraction(fixture.scoreCoverage, `${fixture.companyId}.scoreCoverage`);
  for (const [key, value] of Object.entries(fixture.measurementComposition)) {
    assertFraction(value, `${fixture.companyId}.measurementComposition.${key}`);
  }
  const composition = fixture.measurementComposition;
  const compositionTotal =
    composition.measuredWeight +
    composition.estimatedWeight +
    composition.insufficientWeight +
    composition.providerFailedWeight;
  if (Math.abs(compositionTotal - 1) > EPSILON) {
    throw new Error(`${fixture.companyId}.measurementComposition must sum to 1`);
  }
  if (Math.abs(fixture.scoreCoverage - (composition.measuredWeight + composition.estimatedWeight)) > EPSILON) {
    throw new Error(`${fixture.companyId}.scoreCoverage must equal measuredWeight + estimatedWeight`);
  }
  const evidenceIds = fixture.evidence.map((item) => item.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error(`${fixture.companyId} has duplicate evidence ids`);
  if (fixture.sourceContext.companyId !== fixture.companyId) {
    throw new Error(`${fixture.companyId}.sourceContext.companyId must match companyId`);
  }
  const claimIds = fixture.claims.map((item) => item.id);
  if (new Set(claimIds).size !== claimIds.length) throw new Error(`${fixture.companyId} has duplicate claim ids`);
  for (const claim of fixture.claims) {
    if (claim.publicationStatus === "PRUNED" && !claim.pruneReason) {
      throw new Error(`${fixture.companyId}.${claim.id} is pruned without a reasonCode`);
    }
  }
  for (const opportunity of fixture.opportunities) {
    if (opportunity.publicationStatus === "PRUNED" && !opportunity.pruneReason) {
      throw new Error(`${fixture.companyId}.${opportunity.id} is pruned without a reasonCode`);
    }
  }
  if (fixture.demonstrationFix?.publicationStatus === "PRUNED" && !fixture.demonstrationFix.pruneReason) {
    throw new Error(`${fixture.companyId}.demonstrationFix is pruned without a reasonCode`);
  }
}

export function computeCompanySampleMetrics(fixture: CompanySampleFixture): CompanySampleMetrics {
  validateFixture(fixture);
  const evidenceById = new Map(fixture.evidence.map((item) => [item.id, item]));
  const strengths = fixture.claims.filter((claim) => claim.kind === "STRENGTH");
  const issues = fixture.claims.filter((claim) => claim.kind === "ISSUE");
  const publishedClaims = fixture.claims.filter((claim) => claim.publicationStatus === "PUBLISHED");
  const publicClaims = fixture.claims.filter((claim) => claim.publicationStatus !== "PRUNED");
  const publishedIssueIds = new Set(
    issues.filter((issue) => issue.publicationStatus === "PUBLISHED").map((issue) => issue.id),
  );
  const publishedOpportunities = fixture.opportunities.filter(
    (opportunity) => opportunity.publicationStatus === "PUBLISHED",
  );
  const validPublishedOpportunities = publishedOpportunities.filter((opportunity) =>
    opportunityLineageValid(fixture, opportunity, publishedIssueIds, evidenceById),
  );
  const credibleDemonstrationFix = Boolean(
    fixture.demonstrationFix?.publicationStatus === "PUBLISHED" &&
      publishedIssueIds.has(fixture.demonstrationFix.sourceIssueId) &&
      fixture.demonstrationFix.evidenceIds.length > 0 &&
      fixture.demonstrationFix.evidenceIds.every((id) => evidenceById.has(id)),
  );

  const usedEvidenceIds = new Set<string>();
  for (const claim of publicClaims) for (const relation of claim.support) usedEvidenceIds.add(relation.evidenceId);
  for (const opportunity of publishedOpportunities) for (const id of opportunity.evidenceIds) usedEvidenceIds.add(id);
  if (fixture.demonstrationFix?.publicationStatus === "PUBLISHED") {
    for (const id of fixture.demonstrationFix.evidenceIds) usedEvidenceIds.add(id);
  }
  for (const id of [...usedEvidenceIds]) if (!evidenceById.has(id)) usedEvidenceIds.delete(id);

  const pruneReasons: Partial<Record<ClaimPruneReasonCode, number>> = {};
  for (const claim of fixture.claims) incrementReason(pruneReasons, claim.pruneReason);
  for (const opportunity of fixture.opportunities) incrementReason(pruneReasons, opportunity.pruneReason);
  incrementReason(pruneReasons, fixture.demonstrationFix?.pruneReason);

  const tierDistribution: Record<EvidenceTier, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const item of fixture.evidence) tierDistribution[item.tier] += 1;
  const truthGuardPassed =
    publicClaims.every((claim) => publicClaimMeetsTruthGuard(fixture, claim, evidenceById)) &&
    publishedOpportunities.every((opportunity) =>
      opportunityLineageValid(fixture, opportunity, publishedIssueIds, evidenceById),
    ) &&
    (fixture.demonstrationFix?.publicationStatus !== "PUBLISHED" || credibleDemonstrationFix);
  const publishedUnsupportedClaimCount =
    publicClaims.filter((claim) => claim.verificationVerdict === "UNSUPPORTED").length +
    publishedOpportunities.filter((opportunity) => opportunity.verificationVerdict === "UNSUPPORTED").length;
  const publishedCandidateCount = publishedClaims.length + publishedOpportunities.length;
  const allCandidateCount = fixture.claims.length + fixture.opportunities.length;

  return {
    companyId: fixture.companyId,
    evidenceCount: fixture.evidence.length,
    chineseEvidenceRatio: ratio(
      fixture.evidence.filter((item) => item.language.toLowerCase().startsWith("zh")).length,
      fixture.evidence.length,
    ),
    tierDistribution,
    strengthCandidateCount: strengths.length,
    strengthPublishedCount: strengths.filter((claim) => claim.publicationStatus === "PUBLISHED").length,
    issueCandidateCount: issues.length,
    issuePublishedCount: publishedIssueIds.size,
    needsConfirmationIssueCount: issues.filter((claim) => claim.publicationStatus === "DEEP_NEEDS_CONFIRMATION").length,
    opportunityCandidateCount: fixture.opportunities.length,
    opportunityPublishedCount: publishedOpportunities.length,
    demonstrationFixCandidate: fixture.demonstrationFix !== null,
    demonstrationFixPublished: fixture.demonstrationFix?.publicationStatus === "PUBLISHED",
    credibleDemonstrationFix,
    pruneReasons,
    evidenceUtilizationRate: ratio(usedEvidenceIds.size, fixture.evidence.length),
    claimPublicationRate: optionalRatio(publishedCandidateCount, allCandidateCount),
    opportunityYieldRate: optionalRatio(publishedOpportunities.length, fixture.opportunities.length),
    quickVisibleCharacters: fixture.quickVisibleCharacters,
    durationMs: fixture.durationMs,
    providerCalls: {
      ...fixture.providerCalls,
      analysisTotal: fixture.providerCalls.bocha + fixture.providerCalls.crawler + fixture.providerCalls.deepseek,
    },
    scoreCoverage: fixture.scoreCoverage,
    measurementComposition: fixture.measurementComposition,
    truthGuardPassed,
    publishedUnsupportedClaimCount,
    publishedOpportunityLineageValidCount: validPublishedOpportunities.length,
    publishedOpportunityLineageInvalidCount: publishedOpportunities.length - validPublishedOpportunities.length,
    genericOpportunityCandidateCount: fixture.opportunities.filter((opportunity) => opportunity.genericTemplate).length,
    hasCredibleOpportunity: validPublishedOpportunities.length > 0,
    sparseButTruthful: truthGuardPassed && validPublishedOpportunities.length === 0,
  };
}

export function evaluateThreeCompanySample(fixtures: readonly CompanySampleFixture[]): ThreeCompanySampleEvaluation {
  if (fixtures.length !== 3) throw new Error(`Round-5.3 sample requires exactly 3 companies; received ${fixtures.length}`);
  if (new Set(fixtures.map((fixture) => fixture.companyId)).size !== fixtures.length) {
    throw new Error("Round-5.3 sample requires three distinct companyId values");
  }
  const companyMetrics = fixtures.map(computeCompanySampleMetrics);
  const truthPassCount = companyMetrics.filter((metric) => metric.truthGuardPassed).length;
  const unsupportedCount = companyMetrics.reduce((sum, metric) => sum + metric.publishedUnsupportedClaimCount, 0);
  const quickPassCount = companyMetrics.filter((metric) => metric.quickVisibleCharacters <= 1800).length;
  const viewSwitchCalls = companyMetrics.reduce(
    (sum, metric) => sum + metric.providerCalls.viewSwitchAdditional,
    0,
  );
  const lineageValidCount = companyMetrics.reduce(
    (sum, metric) => sum + metric.publishedOpportunityLineageValidCount,
    0,
  );
  const lineageInvalidCount = companyMetrics.reduce(
    (sum, metric) => sum + metric.publishedOpportunityLineageInvalidCount,
    0,
  );
  const credibleOpportunityCompanies = companyMetrics.filter((metric) => metric.hasCredibleOpportunity).length;
  const credibleFixCompanies = companyMetrics.filter((metric) => metric.credibleDemonstrationFix).length;
  const genericOpportunityCandidates = companyMetrics.reduce(
    (sum, metric) => sum + metric.genericOpportunityCandidateCount,
    0,
  );
  const sparseTruthfulCompanies = companyMetrics.filter((metric) => metric.sparseButTruthful).length;

  const gates: SampleGateResult[] = [
    {
      id: "ALL_TRUTH_GUARDS_PASS",
      passed: truthPassCount === 3,
      observed: `${truthPassCount}/3 companies`,
    },
    {
      id: "NO_UNSUPPORTED_PUBLISHED_CLAIMS",
      passed: unsupportedCount === 0,
      observed: `${unsupportedCount} unsupported published claims`,
    },
    {
      id: "ALL_QUICK_WITHIN_1800",
      passed: quickPassCount === 3,
      observed: `${quickPassCount}/3 Quick reports within 1800 visible characters`,
    },
    {
      id: "ALL_VIEW_SWITCHES_ZERO_PROVIDER_CALLS",
      passed: viewSwitchCalls === 0,
      observed: `${viewSwitchCalls} additional provider calls`,
    },
    {
      id: "ALL_PUBLISHED_OPPORTUNITY_LINEAGE_VALID",
      passed: lineageInvalidCount === 0,
      observed: `${lineageValidCount} valid / ${lineageInvalidCount} invalid published opportunities`,
    },
    {
      id: "AT_LEAST_TWO_COMPANIES_HAVE_CREDIBLE_OPPORTUNITY",
      passed: credibleOpportunityCompanies >= 2,
      observed: `${credibleOpportunityCompanies}/3 companies`,
    },
    {
      id: "AT_LEAST_ONE_COMPANY_HAS_CREDIBLE_DEMONSTRATION_FIX",
      passed: credibleFixCompanies >= 1,
      observed: `${credibleFixCompanies}/3 companies`,
    },
    {
      id: "NO_GENERIC_TEMPLATE_OPPORTUNITY_CANDIDATES",
      passed: genericOpportunityCandidates === 0,
      observed: `${genericOpportunityCandidates} generic opportunity candidates`,
    },
    {
      id: "OPPORTUNITY_NOT_REQUIRED_FOR_EVERY_COMPANY",
      passed: true,
      observed: `Gate 6 requires at least 2/3; no rule requires 3/3 (${3 - credibleOpportunityCompanies}/3 currently sparse)`,
    },
    {
      id: "SPARSE_REPORT_IS_NOT_SYSTEM_FAILURE",
      passed: sparseTruthfulCompanies === 0 || truthPassCount === 3,
      observed: `${sparseTruthfulCompanies} sparse-but-truthful companies`,
    },
  ];
  return {
    harnessVersion: "round53-three-company-sample.v1",
    companyMetrics,
    gates,
    ready: gates.every((gate) => gate.passed),
  };
}

function main(): void {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("usage: tsx scripts/round53-three-company-sample.ts <mock-fixture.json>");
  const fixtures = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as CompanySampleFixture[];
  process.stdout.write(`${JSON.stringify(evaluateThreeCompanySample(fixtures), null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main();
