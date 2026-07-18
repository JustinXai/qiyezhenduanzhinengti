// Diagnosis request input contract.
//
// The frozen canonical contracts (src/contracts/index.ts) describe the OUTPUT
// report shape only; the request payload that starts a diagnosis is a runtime
// concern owned by Agent E. Keep it minimal: a website is the one hard
// requirement, everything else is optional context the engine may use.

import { z } from "zod";

export const DiagnosisInputSchema = z
  .object({
    website: z.string().url(),
    brandName: z.string().min(1).max(200).optional(),
    industry: z.string().min(1).max(200).optional(),
    productOrService: z.string().min(1).max(1000).optional(),
    targetRegion: z.string().min(1).max(200).optional(),
    competitors: z.array(z.string().min(1).max(200)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export type DiagnosisInput = z.infer<typeof DiagnosisInputSchema>;

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
