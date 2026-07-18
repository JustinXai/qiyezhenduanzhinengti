// Stage: company profile extraction.
//
// DeepSeek reads first-party / observed evidence and proposes the qualitative
// profile fields (industry, product, region, competitors, open questions). The
// authoritative facts we already know from the diagnosis request — the website
// URL and any user-supplied brand name / competitors — are NOT delegated to the
// model; they are stamped/merged here to avoid drift and hallucination.

import type { DiagnosisReport } from "../../contracts";
import { parseStageJson, type StageParseResult } from "../../providers/deepseek";
import { CompanyProfileStageOutput } from "./stage-schemas";

// contracts/index.ts exports CompanyProfile only as a Zod value; derive the type.
type CompanyProfile = DiagnosisReport["companyProfile"];

export interface CompanyProfileInput {
  /** Authoritative target website from the diagnosis request. */
  website: string;
  /** Optional user-supplied brand name (wins over the model's guess). */
  providedBrandName?: string;
  /** Optional user-supplied competitors, merged with the model's list. */
  providedCompetitors?: readonly string[];
}

function dedupeNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v.length > 0 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function extractCompanyProfile(
  input: CompanyProfileInput,
  deepSeekJson: unknown,
): StageParseResult<CompanyProfile> {
  const parsed = parseStageJson("company_profile", CompanyProfileStageOutput, deepSeekJson);
  if (!parsed.ok) return parsed;

  const out = parsed.value;
  const brandName = (input.providedBrandName?.trim() || out.brandName.trim());

  const profile: CompanyProfile = {
    brandName,
    website: input.website,
    industry: out.industry.trim(),
    productOrService: out.productOrService.trim(),
    targetRegion: out.targetRegion.trim(),
    competitors: dedupeNonEmpty([...(input.providedCompetitors ?? []), ...out.competitors]),
    unresolvedQuestions: dedupeNonEmpty(out.unresolvedQuestions),
  };

  return { ok: true, value: profile };
}
