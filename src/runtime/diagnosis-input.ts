// Diagnosis request input contract.
//
// The frozen canonical contracts (src/contracts/index.ts) describe the OUTPUT
// report shape only; the request payload that starts a diagnosis is a runtime
// concern owned by Agent E. A confirmed website enables full diagnosis; a
// name-only request is accepted but must remain LIMITED/NEEDS_CONFIRMATION.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Competitor input (Agent I) — accepts either a bare NAME string or an object
// carrying the name plus a user-supplied official website. Both forms coexist
// in the same array, and a plain string[] payload stays valid unchanged
// (backward compatible with round-1/2 callers).
//
//   competitors: ["GoPro", { name: "大疆", website: "https://www.dji.com" }]
//
// The website here is the competitor's OWN official site as asserted by the
// user; it is later re-validated by the competitor resolver (SSRF / URL guard)
// before any trust is placed in it. See src/diagnosis/competitors/.
// ---------------------------------------------------------------------------

export const CompetitorInputObjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    /** User-asserted official website for this competitor (optional). */
    website: z.string().url().max(2000).optional(),
  })
  .strict();

export type CompetitorInputObject = z.infer<typeof CompetitorInputObjectSchema>;

export const CompetitorInputSchema = z.union([
  z.string().min(1).max(200),
  CompetitorInputObjectSchema,
]);

export type CompetitorInput = z.infer<typeof CompetitorInputSchema>;

export const DiagnosisInputSchema = z
  .object({
    website: z.union([z.string().url(), z.literal("")]).default(""),
    brandName: z.string().min(1).max(200).optional(),
    industry: z.string().min(1).max(200).optional(),
    productOrService: z.string().min(1).max(1000).optional(),
    targetRegion: z.string().min(1).max(200).optional(),
    customerQuestions: z
      .array(z.object({ question: z.string().min(1).max(1000) }).strict())
      .max(20)
      .optional(),
    // Backward compatible: a string[] still validates because each element
    // matches the string branch of CompetitorInputSchema.
    competitors: z.array(CompetitorInputSchema).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export type DiagnosisInput = z.infer<typeof DiagnosisInputSchema>;

/** The name of a competitor input regardless of which form it took. */
export function competitorInputName(c: CompetitorInput): string {
  return (typeof c === "string" ? c : c.name).trim();
}

/** The user-supplied website of a competitor input, or undefined. */
export function competitorInputWebsite(c: CompetitorInput): string | undefined {
  if (typeof c === "string") return undefined;
  const w = c.website?.trim();
  return w && w.length > 0 ? w : undefined;
}

/**
 * Project a mixed competitor list down to bare, de-duplicated names.
 *
 * Kept here (not in the resolver) so the many string[]-only consumers
 * (query planner profile, company-profile merge, scenario stage output) can
 * stay unchanged while callers upgrade to the richer object form.
 */
export function competitorNames(
  competitors: readonly CompetitorInput[] | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of competitors ?? []) {
    const name = competitorInputName(c);
    if (name.length > 0 && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export interface DiagnosisInputIssue {
  path: string;
  message: string;
}

export type ParseDiagnosisInputResult =
  | { ok: true; input: DiagnosisInput }
  | { ok: false; issues: DiagnosisInputIssue[] };

export function parseDiagnosisInput(raw: unknown): ParseDiagnosisInputResult {
  const res = DiagnosisInputSchema.safeParse(raw);
  if (res.success) return { ok: true, input: res.data };
  return {
    ok: false,
    issues: res.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}
