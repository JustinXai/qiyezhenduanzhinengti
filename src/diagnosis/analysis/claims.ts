// Stage: claim generation (strengths / core issues / GEO opportunities /
// competitor gaps / demonstration fix).
//
// DeepSeek proposes the qualitative claims; this stage enforces the truth rules:
//   - referential integrity: every evidence id must resolve (unknown ids filtered).
//   - NO array[0] auto-backfill (PRODUCT_TRUTH_RULES §4.7): a claim left with zero
//     resolvable evidence ids is DROPPED, never padded.
//   - the demonstrationFix disclaimer is stamped from the frozen Zod literal, never
//     copied from model output; if its evidence does not resolve it becomes null
//     (PRODUCT_TRUTH_RULES §5 — never fabricate a module for completeness).
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
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import { indexEvidence, resolveEvidenceIds, type EvidenceIndex } from "./evidence-index";
import { ClaimsStageOutput } from "./stage-schemas";

// contracts/index.ts exports CompetitorGap only as a Zod value; derive the type.
type CompetitorGap = DiagnosisReport["competitorGaps"][number];

const FROZEN_DEMO_DISCLAIMER = DemonstrationFix.shape.disclaimer.value;

export interface ClaimsResult {
  strengths: Strength[];
  coreIssues: CoreIssue[];
  geoOpportunities: GeoOpportunity[];
  competitorGaps: CompetitorGap[];
  demonstrationFix: DemonstrationFixModel | null;
}

function buildStrengths(
  items: ClaimsStageOutput["strengths"],
  index: EvidenceIndex,
): Strength[] {
  const out: Strength[] = [];
  items.forEach((item) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) return; // drop, never backfill
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
): CoreIssue[] {
  const out: CoreIssue[] = [];
  items.forEach((item) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) return;
    out.push({
      id: `iss_${out.length + 1}`,
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
): GeoOpportunity[] {
  const out: GeoOpportunity[] = [];
  items.forEach((item) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) return;
    out.push({
      id: `geo_${out.length + 1}`,
      claimType: item.claimType,
      statement: item.statement,
      businessImpact: item.businessImpact,
      customerQuestion: item.customerQuestion,
      contentGap: item.contentGap,
      evidenceIds,
    });
  });
  return out;
}

function buildCompetitorGaps(
  items: ClaimsStageOutput["competitorGaps"],
  index: EvidenceIndex,
): CompetitorGap[] {
  const out: CompetitorGap[] = [];
  items.forEach((item) => {
    const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
    if (evidenceIds.length === 0) return;
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
): DemonstrationFixModel | null {
  if (item === null) return null;
  const evidenceIds = resolveEvidenceIds(item.evidenceIds, index);
  if (evidenceIds.length === 0) return null; // hide the module rather than fabricate
  return {
    id: "demo_1",
    fixType: item.fixType,
    currentIssue: item.currentIssue,
    suggestedAssetType: item.suggestedAssetType,
    before: item.before,
    after: item.after,
    whyBetter: item.whyBetter,
    customerConfirmationNeeded: item.customerConfirmationNeeded,
    geoTeamDeliverable: item.geoTeamDeliverable,
    evidenceIds,
    disclaimer: FROZEN_DEMO_DISCLAIMER,
  };
}

export function buildClaims(
  evidence: readonly EvidenceItem[],
  deepSeekJson: unknown,
): StageParseResult<ClaimsResult> {
  const parsed = parseStageJson("claims", ClaimsStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const index = indexEvidence(evidence);
  const s = parsed.value;
  return {
    ok: true,
    value: {
      strengths: buildStrengths(s.strengths, index),
      coreIssues: buildCoreIssues(s.coreIssues, index),
      geoOpportunities: buildGeoOpportunities(s.geoOpportunities, index),
      competitorGaps: buildCompetitorGaps(s.competitorGaps, index),
      demonstrationFix: buildDemonstrationFix(s.demonstrationFix, index),
    },
  };
}
