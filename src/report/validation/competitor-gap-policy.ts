import type { DiagnosisReport } from "../../contracts";
import type { ClaimEvidenceRelation } from "../../contracts/claim-evidence";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

/** A public competitor gap needs a provided competitor plus usable official-source pair support. */
export function competitorGapHasVerifiedOfficialSupport(input: {
  report: DiagnosisReport;
  gapId: string;
  relations: readonly ClaimEvidenceRelation[];
}): boolean {
  const gap = input.report.competitorGaps.find((item) => item.id === input.gapId);
  if (!gap) return false;
  if (
    !input.report.companyProfile.competitors
      .map(normalized)
      .includes(normalized(gap.competitorName))
  ) {
    return false;
  }
  const cited = new Set(gap.evidenceIds);
  const officialEvidenceIds = new Set(
    input.report.evidence
      .filter((item) => cited.has(item.id) && item.sourceType === "COMPETITOR_WEB_EVIDENCE")
      .map((item) => item.id),
  );
  return input.relations.some(
    (relation) =>
      relation.claimId === gap.id &&
      relation.claimKind === "competitorGap" &&
      officialEvidenceIds.has(relation.evidenceId) &&
      (relation.supportLevel === "DIRECT_SUPPORT" ||
        relation.supportLevel === "PARTIAL_SUPPORT"),
  );
}
