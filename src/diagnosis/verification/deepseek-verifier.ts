// ============================================================================
// DeepSeek-backed VerifierStrategy (real mode) — implemented, NOT invoked live
// this round. Wraps a StructuredCompletionProvider (which tests drive with a
// deterministic mock fetch — never the real endpoint).
//
// Its raw verdicts still pass through the shared clamp in verify-report, so the
// model's judgement is never authoritative on its own. Illegal evidence ids the
// model may return are caught by verify-report's referential-integrity gate.
// ============================================================================

import type { StructuredCompletionProvider } from "../../providers/types";
import {
  DEEPSEEK_VERIFIER_VERSION,
  VERIFIER_STAGE,
  buildVerifierSystemPrompt,
  buildVerifierUserPrompt,
  parseVerifierResponse,
} from "../../providers/deepseek/verifier-adapter";
import type { AssessPairsInput, AssessPairsResult, RawVerdict, VerifierStrategy } from "./types";

export class VerifierProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VerifierProviderError";
  }
}

export interface DeepSeekVerifierOptions {
  maxTokens?: number;
  version?: string;
}

/**
 * Build a DeepSeek-backed verifier strategy. One structured completion per claim.
 * Every call counts against the provider budget (usage sample per assess).
 */
export function createDeepSeekVerifierStrategy(
  provider: StructuredCompletionProvider,
  opts: DeepSeekVerifierOptions = {},
): VerifierStrategy {
  const maxTokens = opts.maxTokens ?? 1024;
  const version = opts.version ?? DEEPSEEK_VERIFIER_VERSION;

  return {
    mode: "DEEPSEEK_STRUCTURED",
    version,
    async assess(input: AssessPairsInput): Promise<AssessPairsResult> {
      // No candidates → no call, no budget spend.
      if (input.candidates.length === 0) {
        return { verdicts: [], usage: [] };
      }

      const res = await provider.completeJson({
        stage: VERIFIER_STAGE,
        systemPrompt: buildVerifierSystemPrompt(),
        userPrompt: buildVerifierUserPrompt(
          { id: input.claim.id, text: input.claim.text },
          input.candidates,
        ),
        maxTokens,
      });

      const usage = [
        {
          provider: "deepseek" as const,
          stage: "CLAIM_EVIDENCE_VERIFICATION",
          callCount: 1,
          errorCode: res.ok ? null : res.error.code,
        },
      ];

      if (!res.ok) {
        throw new VerifierProviderError(res.error.code, res.error.message);
      }

      const parsed = parseVerifierResponse(res.json);
      if (!parsed.ok) {
        throw new VerifierProviderError("PROVIDER_SCHEMA_MISMATCH", parsed.message);
      }

      // Pass model verdicts through verbatim (including any illegal ids); the
      // referential-integrity gate in verify-report is the single authority.
      const verdicts: RawVerdict[] = parsed.response.verdicts.map((v) => ({
        evidenceId: v.evidenceId,
        supportLevel: v.supportLevel,
        confidence: v.confidence,
        justification: v.justification,
      }));

      return { verdicts, usage };
    },
  };
}
