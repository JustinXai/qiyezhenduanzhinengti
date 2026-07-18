// Classification of a 2xx DeepSeek chat-completion envelope.
//
// Only `choices[0].message.content` is trusted as the final JSON. `reasoning_content`
// is never used as a fallback (PROVIDER_RELIABILITY_CONTRACT). The order of checks
// matters: truncation / content-filter finish reasons are detected BEFORE attempting
// to parse content, so a cut-off body is reported as TRUNCATED_OUTPUT rather than
// masquerading as INVALID_JSON.

import type { ProviderFailure } from "../types";
import { makeFailure } from "./error-classification";
import { parseStrictJson } from "./parse-json";

interface ChatChoice {
  finish_reason?: unknown;
  message?: { content?: unknown; reasoning_content?: unknown } | null;
}

export type EnvelopeResult =
  | { ok: true; json: unknown }
  | { ok: false; error: ProviderFailure };

/**
 * Interpret an already-JSON-parsed 200 response body from the chat-completions
 * endpoint and extract the structured JSON payload, or classify the failure.
 */
export function classifyEnvelope(body: unknown): EnvelopeResult {
  if (!body || typeof body !== "object") {
    return fail("PROVIDER_INVALID_RESPONSE_SHAPE", "Response body is not a JSON object");
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return fail("PROVIDER_INVALID_RESPONSE_SHAPE", "Response has no `choices` array");
  }
  if (choices.length === 0) {
    return fail("PROVIDER_EMPTY_CHOICES", "Response `choices` array is empty");
  }

  const choice = choices[0] as ChatChoice | undefined;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "";

  if (finishReason === "length") {
    return fail("PROVIDER_TRUNCATED_OUTPUT", "Output truncated (finish_reason=length); increase maxTokens");
  }
  if (finishReason === "content_filter") {
    return fail("PROVIDER_CONTENT_FILTERED", "Output blocked by content filter (finish_reason=content_filter)");
  }

  const content = choice?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return fail("PROVIDER_EMPTY_FINAL_CONTENT", "choices[0].message.content is empty (reasoning_content is not a fallback)");
  }

  const parsed = parseStrictJson(content);
  if (!parsed.ok) {
    return fail("PROVIDER_INVALID_JSON", "choices[0].message.content is not valid JSON (no auto-repair)");
  }

  return { ok: true, json: parsed.value };
}

function fail(code: ProviderFailure["code"], message: string): EnvelopeResult {
  return { ok: false, error: makeFailure(code, message) };
}
