// Stage: claim generation (strengths / core issues / GEO opportunities /
// competitor gaps / demonstration fix).
//
// DeepSeek proposes the qualitative claims; this stage enforces the truth rules:
//   - referential integrity: every evidence id must resolve (unknown ids filtered).
//   - NO array[0] auto-backfill (PRODUCT_TRUTH_RULES §4.7): a claim left with zero
//     resolvable evidence ids is DROPPED, never padded.
//   - the model emits only a strict CandidateDemonstrationFix. currentIssue comes
//     from its exact source issue and the disclaimer comes from the frozen literal.
//   - a missing source issue or missing issue/evidence relationship makes the
//     demonstration fix null; there is no first-issue or first-evidence fallback.
//
// Support-level publish thresholds (≥1 DIRECT_SUPPORT etc.) are enforced later by
// Agent B's Evidence Semantic Guard; this stage guarantees the structural + id
// integrity those guards assume.

import { DemonstrationFix } from "../../contracts";
import type {
  CoreIssue,
  DiagnosisReport,
  DemonstrationFix as DemonstrationFixModel,
  EvidenceItem,
  GeoOpportunity,
  Strength,
} from "../../contracts";
import type { EvidenceCoverage } from "../../contracts/claim-evidence";
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import { indexEvidence, resolveEvidenceIds, type EvidenceIndex } from "./evidence-index";
import { ClaimsStageOutput } from "./stage-schemas";
import type { CandidateDemonstrationFix } from "./stage-schemas";
import { inspectOpportunityCopy } from "./opportunity-copy-policy";

// contracts/index.ts exports CompetitorGap only as a Zod value; derive the type.
type CompetitorGap = DiagnosisReport["competitorGaps"][number];

const FROZEN_DEMO_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

const SUGGESTED_ASSET_TYPE: Record<CandidateDemonstrationFix["assetType"], string> = {
  ENTITY_DESCRIPTION: "企业实体描述",
  FAQ_EXAMPLE: "结构化 FAQ 区块",
  BEFORE_AFTER_STRUCTURE: "内容结构改版示意",
};

export interface ClaimsResult {
  strengths: Strength[];
  coreIssues: CoreIssue[];
  geoOpportunities: GeoOpportunity[];
  competitorGaps: CompetitorGap[];
  demonstrationFix: DemonstrationFixModel | null;
  /** Round-5.1 §七: why candidates were dropped (content-yield diagnostics). */
  dropped: AnalysisPruneCandidate[];
}

export interface AnalysisPruneCandidate {
  claimKind: string;
  candidateRef: string;
  sourceIssueId: string | null;
  reasonCode:
    | "NO_VALID_EVIDENCE"
    | "INVALID_EVIDENCE_REFERENCE"
    | "INVALID_SOURCE_ISSUE_REFERENCE"
    | "NO_MEASUREMENT_COVERAGE"
    | "MISSING_COVERAGE_PREFIX"
    | "GENERIC_OR_UNACTIONABLE"
    | "BANNED_OR_OVERPROMISING_COPY"
    | "UNVERIFIED_COMPETITOR_ASSERTION";
  guardRule: string;
  evidenceIds: string[];
  coverageStatus?:
    | "NOT_REQUIRED"
    | "ESTABLISHED_AND_BOUNDED"
    | "NOT_ESTABLISHED"
    | "SCOPE_LIMITATION_MISSING";
}

/** NO ids at all vs. ids that all failed to resolve — different diagnoses. */
function dropReasonForEvidence(
  raw: readonly string[],
): "NO_VALID_EVIDENCE" | "INVALID_EVIDENCE_REFERENCE" {
  return raw.length === 0 ? "NO_VALID_EVIDENCE" : "INVALID_EVIDENCE_REFERENCE";
}

function buildStrengths(
  items: ClaimsStageOutput["strengths"],
  index: EvidenceIndex,
  dropped: AnalysisPruneCandidate[],
): Strength[] {
  const out: Strength[] = [];
  items.forEach((item, sourceIndex) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) {
      dropped.push({
        claimKind: "strength",
        candidateRef: `strength_candidate_${sourceIndex + 1}`,
        sourceIssueId: null,
        reasonCode: dropReasonForEvidence(item.evidenceIds),
        guardRule: "ANALYSIS_EVIDENCE_REFERENCE_INTEGRITY",
        evidenceIds: [...item.evidenceIds],
      });
      return;
    }
    out.push({
      id: `str_${out.length + 1}`,
      claimType: item.claimType,
      statement: item.statement,
      businessImpact: item.businessImpact,
      evidenceIds,
    });
  });
  return out;
}

function buildCoreIssues(
  items: ClaimsStageOutput["coreIssues"],
  index: EvidenceIndex,
  dropped: AnalysisPruneCandidate[],
): CoreIssue[] {
  const out: CoreIssue[] = [];
  items.forEach((item, sourceIndex) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) {
      dropped.push({
        claimKind: "coreIssue",
        candidateRef: `iss_${sourceIndex + 1}`,
        sourceIssueId: null,
        reasonCode: dropReasonForEvidence(item.evidenceIds),
        guardRule: "ANALYSIS_EVIDENCE_REFERENCE_INTEGRITY",
        evidenceIds: [...item.evidenceIds],
      });
      return;
    }
    out.push({
      // Preserve the model's positional source id even when an earlier issue is
      // dropped. Renumbering would let iss_1 silently point at a different issue.
      id: `iss_${sourceIndex + 1}`,
      claimType: item.claimType,
      statement: item.statement,
      businessImpact: item.businessImpact,
      fixDirection: item.fixDirection,
      evidenceIds,
    });
  });
  return out;
}

function buildGeoOpportunities(
  items: ClaimsStageOutput["geoOpportunities"],
  index: EvidenceIndex,
  issueIds: ReadonlySet<string>,
  dropped: AnalysisPruneCandidate[],
  coverage?: EvidenceCoverage,
): GeoOpportunity[] {
  const out: GeoOpportunity[] = [];
  items.forEach((item, sourceIndex) => {
    const candidateRef = `geo_candidate_${sourceIndex + 1}`;
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) {
      dropped.push({
        claimKind: "geoOpportunity",
        candidateRef,
        sourceIssueId: item.sourceIssueId ?? null,
        reasonCode: dropReasonForEvidence(item.evidenceIds),
        guardRule: "ANALYSIS_EVIDENCE_REFERENCE_INTEGRITY",
        evidenceIds: [...item.evidenceIds],
      });
      return;
    }
    // §七: a declared source issue must resolve to a BUILT core issue; an
    // opportunity hanging off a dropped/unknown issue is not publishable.
    if (item.sourceIssueId !== undefined && !issueIds.has(item.sourceIssueId)) {
      dropped.push({
        claimKind: "geoOpportunity",
        candidateRef,
        sourceIssueId: item.sourceIssueId,
        reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
        guardRule: "ANALYSIS_SOURCE_ISSUE_REFERENCE_INTEGRITY",
        evidenceIds: [...item.evidenceIds],
      });
      return;
    }
    const copyPrune = inspectOpportunityCopy(item, index, coverage);
    if (copyPrune) {
      dropped.push({
        claimKind: "geoOpportunity",
        candidateRef,
        sourceIssueId: item.sourceIssueId ?? null,
        reasonCode: copyPrune.reasonCode,
        guardRule: copyPrune.guardRule,
        evidenceIds: [...item.evidenceIds],
        coverageStatus: copyPrune.coverageStatus,
      });
      return;
    }
    out.push({
      id: `geo_${out.length + 1}`,
      claimType: item.claimType,
      statement: item.statement,
      businessImpact: item.businessImpact,
      customerQuestion: item.customerQuestion,
      contentGap: item.contentGap,
      evidenceIds,
      // §八 lineage — carried into the canonical report when the stage supplied it.
      ...(item.sourceIssueId !== undefined ? { sourceIssueId: item.sourceIssueId } : {}),
      ...(item.recommendedAction !== undefined ? { recommendedAction: item.recommendedAction } : {}),
      ...(item.priorityReason !== undefined ? { priorityReason: item.priorityReason } : {}),
    });
  });
  return out;
}

function buildCompetitorGaps(
  items: ClaimsStageOutput["competitorGaps"],
  index: EvidenceIndex,
  dropped: AnalysisPruneCandidate[],
): CompetitorGap[] {
  const out: CompetitorGap[] = [];
  items.forEach((item, sourceIndex) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) {
      dropped.push({
        claimKind: "competitorGap",
        candidateRef: `competitor_gap_candidate_${sourceIndex + 1}`,
        sourceIssueId: null,
        reasonCode: dropReasonForEvidence(item.evidenceIds),
        guardRule: "ANALYSIS_EVIDENCE_REFERENCE_INTEGRITY",
        evidenceIds: [...item.evidenceIds],
      });
      return;
    }
    out.push({
      id: `gap_${out.length + 1}`,
      competitorName: item.competitorName,
      gapStatement: item.gapStatement,
      evidenceIds,
    });
  });
  return out;
}

function buildDemonstrationFix(
  item: ClaimsStageOutput["demonstrationFix"],
  index: EvidenceIndex,
  issuesById: ReadonlyMap<string, CoreIssue>,
  dropped: AnalysisPruneCandidate[],
): DemonstrationFixModel | null {
  if (item === null) return null;
  const issue = issuesById.get(item.sourceIssueId);
  if (!issue) {
    dropped.push({
      claimKind: "demonstrationFix",
      candidateRef: "demo_1",
      sourceIssueId: item.sourceIssueId,
      reasonCode: "INVALID_SOURCE_ISSUE_REFERENCE",
      guardRule: "ANALYSIS_SOURCE_ISSUE_REFERENCE_INTEGRITY",
      evidenceIds: [...item.evidenceIds],
    });
    return null;
  }

  const resolvedEvidenceIds = resolveEvidenceIds(item.evidenceIds, index);
  if (resolvedEvidenceIds.length !== item.evidenceIds.length) {
    dropped.push({
      claimKind: "demonstrationFix",
      candidateRef: "demo_1",
      sourceIssueId: item.sourceIssueId,
      reasonCode: dropReasonForEvidence(item.evidenceIds),
      guardRule: "ANALYSIS_EVIDENCE_REFERENCE_INTEGRITY",
      evidenceIds: [...item.evidenceIds],
    });
    return null;
  }

  // Candidate evidence must have an explicit input-level relationship to the
  // exact issue. Semantic verification remains the downstream verifier's job.
  // Keep only that intersection; never substitute evidence[0] or issue[0].
  const issueEvidence = new Set(issue.evidenceIds);
  const evidenceIds = resolvedEvidenceIds.filter((id) => issueEvidence.has(id));
  if (evidenceIds.length === 0) {
    dropped.push({
      claimKind: "demonstrationFix",
      candidateRef: "demo_1",
      sourceIssueId: item.sourceIssueId,
      reasonCode: "INVALID_EVIDENCE_REFERENCE",
      guardRule: "ANALYSIS_DEMONSTRATION_FIX_EVIDENCE_LINEAGE",
      evidenceIds: [...item.evidenceIds],
    });
    return null;
  }

  return {
    id: "demo_1",
    fixType: item.assetType,
    currentIssue: issue.statement,
    suggestedAssetType: SUGGESTED_ASSET_TYPE[item.assetType],
    before: item.beforeStructure,
    after: item.afterStructure,
    whyBetter: item.whyBetter,
    customerConfirmationNeeded: item.confirmationNeeded,
    geoTeamDeliverable: item.deliverable,
    evidenceIds,
    disclaimer: FROZEN_DEMO_DISCLAIMER,
  };
}

export function buildClaims(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
  coverage?: EvidenceCoverage,
): StageParseResult<ClaimsResult> {
  const parsed = parseStageJson("claims", ClaimsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const s = parsed.value;
  const dropped: AnalysisPruneCandidate[] = [];

  const strengths = buildStrengths(s.strengths, index, dropped);
  const coreIssues = buildCoreIssues(s.coreIssues, index, dropped);
  // The stage output declares issue links positionally ("iss_1"…), which is the
  // id scheme buildCoreIssues assigns — so linkage is validated on BUILT ids.
  const issuesById = new Map(coreIssues.map((i) => [i.id, i]));
  const issueIds = new Set(issuesById.keys());

  const competitorGaps = buildCompetitorGaps(s.competitorGaps, index, dropped);

  return {
    ok: true,
    value: {
      strengths,
      coreIssues,
      geoOpportunities: buildGeoOpportunities(
        s.geoOpportunities,
        index,
        issueIds,
        dropped,
        coverage,
      ),
      competitorGaps,
      demonstrationFix: buildDemonstrationFix(s.demonstrationFix, index, issuesById, dropped),
      dropped,
    },
  };
}
