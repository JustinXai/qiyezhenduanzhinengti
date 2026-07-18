// ============================================================================
// Deterministic (Mock-mode) verifier strategy — ZERO provider calls.
//
// Proposes a raw support level from CONTENT OVERLAP between the claim text and
// the evidence title+snippet. It does NOT apply source/polarity/coverage rules —
// that is the shared clamp's job (clamp.ts), applied identically to every
// strategy. Keeping the raw signal content-only is what lets test 7 exercise the
// clamp: even a strong-overlap DIRECT proposal is downgraded when the evidence
// source or claim polarity forbids it.
// ============================================================================

import type { AssessPairsInput, AssessPairsResult, RawVerdict, VerifierStrategy } from "./types";
import type { EvidenceItem } from "../../contracts";
import { overlap } from "./classify";

export const DETERMINISTIC_VERIFIER_VERSION = "claim-evidence.deterministic.v1";

/** Strong / moderate overlap thresholds (shared CJK-bigram + token count). */
const STRONG_OVERLAP = 3;
const MODERATE_OVERLAP = 1;

function evidenceText(e: EvidenceItem): string {
  return `${e.title} ${e.snippet}`;
}

function rawFromOverlap(claimText: string, e: EvidenceItem): RawVerdict {
  const { shared } = overlap(claimText, evidenceText(e));
  if (shared >= STRONG_OVERLAP) {
    return {
      evidenceId: e.id,
      supportLevel: "DIRECT_SUPPORT",
      confidence: 0.85,
      justification: `内容重叠较强(${shared} 项),初判可直接支持(待确定性前置裁剪)。`,
    };
  }
  if (shared >= MODERATE_OVERLAP) {
    return {
      evidenceId: e.id,
      supportLevel: "PARTIAL_SUPPORT",
      confidence: 0.55,
      justification: `内容存在部分重叠(${shared} 项),初判部分支持。`,
    };
  }
  return {
    evidenceId: e.id,
    supportLevel: "CONTEXT_ONLY",
    confidence: 0.3,
    justification: "内容重叠很弱,初判仅作背景。",
  };
}

export function createDeterministicVerifier(): VerifierStrategy {
  return {
    mode: "MOCK_DETERMINISTIC",
    version: DETERMINISTIC_VERIFIER_VERSION,
    async assess(input: AssessPairsInput): Promise<AssessPairsResult> {
      const verdicts = input.candidates.map((e) => rawFromOverlap(input.claim.text, e));
      // Deterministic mock makes NO provider call. It still reports a usage
      // sample so the budget seam is exercised (callCount 0).
      return {
        verdicts,
        usage: [
          {
            provider: "deterministic-verifier",
            stage: "CLAIM_EVIDENCE_VERIFICATION",
            callCount: 0,
          },
        ],
      };
    },
  };
}
