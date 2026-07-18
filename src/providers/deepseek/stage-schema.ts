// Validate DeepSeek stage output against a per-stage Zod schema.
//
// The adapter returns `json: unknown` (a syntactically valid JSON value). Whether
// that value matches the SHAPE a given analysis stage expects is a separate
// reliability concern classified as PROVIDER_SCHEMA_MISMATCH (non-retryable per
// PROVIDER_RELIABILITY_CONTRACT). Keeping this next to the adapter lets
// tests/providers exercise the full error taxonomy including schema mismatch.

import type { ZodType } from "zod";
import type { ProviderFailure } from "../types";
import { makeFailure } from "./error-classification";

export type StageParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderFailure };

/**
 * Parse `json` (a DeepSeek stage payload) against `schema`. On failure returns a
 * PROVIDER_SCHEMA_MISMATCH ProviderFailure carrying the first Zod issue path.
 */
export function parseStageJson<T>(
  stage: string,
  schema: ZodType<T>,
  json: unknown,
): StageParseResult<T> {
  const parsed = schema.safeParse(json);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const first = parsed.error.issues[0];
  const where = first ? `${first.path.join(".") || "<root>"}: ${first.message}` : "unknown";
  return {
    ok: false,
    error: makeFailure(
      "PROVIDER_SCHEMA_MISMATCH",
      `DeepSeek "${stage}" output did not match expected schema (${where})`,
    ),
  };
}
