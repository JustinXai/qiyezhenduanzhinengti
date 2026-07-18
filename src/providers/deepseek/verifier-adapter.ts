// ============================================================================
// DeepSeek Claim/Evidence verifier adapter (pure helpers).
//
// This is the PROVIDER-layer half of the real-mode verifier: it builds the
// structured request and parses/validates the structured response. It performs
// NO network I/O itself and imports nothing from the diagnosis layer, so it can
// be unit-tested in isolation and reused by the verification strategy.
//
// Contract (AGENTS.md §5): the caller drives a StructuredCompletionProvider with
// stream=false, response_format=json_object; only choices[0].message.content is
// parsed (handled by the shared DeepSeek adapter). This module only shapes the
// prompt and validates the JSON body against the verifier schema.
//
// Round-3 hard rule: this is implemented but NOT invoked against the real
// DeepSeek endpoint in this round.
// ============================================================================

import { z } from "zod";
import { EvidenceSupportLevel, type EvidenceItem } from "../../contracts";

export const VERIFIER_STAGE = "claim_evidence_verification";
export const DEEPSEEK_VERIFIER_PROMPT_VERSION = "claim-evidence.deepseek.prompt.v1";
export const DEEPSEEK_VERIFIER_VERSION = "claim-evidence.deepseek.v1";

/** Minimal claim shape the prompt needs (kept provider-layer independent). */
export interface VerifierPromptClaim {
  id: string;
  text: string;
}

export const VerifierResponseSchema = z.object({
  verdicts: z.array(
    z.object({
      evidenceId: z.string(),
      supportLevel: EvidenceSupportLevel,
      confidence: z.number().min(0).max(1),
      justification: z.string().default(""),
    }),
  ),
});
export type VerifierResponse = z.infer<typeof VerifierResponseSchema>;

const SYSTEM_PROMPT = [
  "你是企业诊断系统中的 Claim–Evidence 语义验证器。",
  "只判断给定的每条 Evidence 是否在语义上支持给定 Claim,输出支持等级。",
  "严格约束:",
  "1. 只能引用下方提供的 Evidence ID,禁止编造或返回任何不在列表中的 ID。",
  "2. 禁止返回 URL、CTA、分数或任何未被要求的字段。",
  "3. 不得修改 Claim,不得新增 Evidence。",
  "4. 来源权威度不等于语义支持度;首方页面不等于直接支持。",
  "5. 负面/缺失型判断需谨慎:单个页面不能直接证明某内容缺失。",
  '只返回 JSON:{"verdicts":[{"evidenceId","supportLevel","confidence","justification"}]}。',
  "supportLevel 取值:DIRECT_SUPPORT | PARTIAL_SUPPORT | CONTEXT_ONLY | UNSUPPORTED。",
].join("\n");

export function buildVerifierSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildVerifierUserPrompt(
  claim: VerifierPromptClaim,
  candidates: readonly EvidenceItem[],
): string {
  const lines: string[] = [];
  lines.push(`Claim(${claim.id}): ${claim.text}`);
  lines.push("");
  lines.push("候选 Evidence:");
  for (const e of candidates) {
    lines.push(
      `- id=${e.id} | sourceType=${e.sourceType} | title=${e.title} | snippet=${e.snippet}`,
    );
  }
  lines.push("");
  lines.push("请对每条候选 Evidence 给出 supportLevel、confidence(0-1) 与简短 justification。");
  return lines.join("\n");
}

export interface ParsedVerifierResponse {
  ok: true;
  response: VerifierResponse;
}
export interface ParsedVerifierFailure {
  ok: false;
  message: string;
}

/** Validate a raw JSON body from the model against the verifier schema. */
export function parseVerifierResponse(
  json: unknown,
): ParsedVerifierResponse | ParsedVerifierFailure {
  const parsed = VerifierResponseSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: `verifier response did not match schema (${
        first ? `${first.path.join(".") || "<root>"}: ${first.message}` : "unknown"
      })`,
    };
  }
  return { ok: true, response: parsed.data };
}
