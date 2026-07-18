// Error classification for the DeepSeek adapter.
//
// Maps transport failures, HTTP status codes, and OpenAI-style chat-completion
// envelope problems onto the frozen `ProviderErrorCode` union. `retryable` is
// ALWAYS derived from RETRYABLE_PROVIDER_ERRORS (src/providers/types.ts) so the
// retry policy in PROVIDER_RELIABILITY_CONTRACT stays the single source of truth
// and can never drift from an ad-hoc per-call boolean.

import {
  RETRYABLE_PROVIDER_ERRORS,
  type ProviderErrorCode,
  type ProviderFailure,
} from "../types";

export function makeFailure(code: ProviderErrorCode, message: string): ProviderFailure {
  return {
    code,
    message,
    retryable: RETRYABLE_PROVIDER_ERRORS.has(code),
  };
}

/** Lower-cased haystack helper for keyword sniffing in error bodies. */
function hay(...parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => typeof p === "string").join(" ").toLowerCase();
}

/**
 * Classify a thrown transport error (network / abort). fetch rejects with an
 * AbortError on timeout and a TypeError on DNS/connection failure.
 */
export function classifyTransportError(err: unknown): ProviderFailure {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "AbortError" || name === "TimeoutError") {
    return makeFailure("PROVIDER_TIMEOUT", `Request aborted/timed out: ${message}`);
  }
  // Undici / whatwg fetch surfaces network failures as TypeError.
  if (name === "TypeError" || err instanceof TypeError) {
    return makeFailure("PROVIDER_CONNECTION_FAILED", `Connection failed: ${message}`);
  }
  return makeFailure("PROVIDER_UNKNOWN", `Unexpected transport error: ${message}`);
}

/**
 * Best-effort extraction of an OpenAI-style error `{ error: { code, message, type } }`
 * from an already-parsed response body. Returns undefined-ish strings when absent.
 */
export function readErrorBody(body: unknown): { code?: string; message?: string; type?: string } {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (e && typeof e === "object") {
      const rec = e as Record<string, unknown>;
      return {
        code: typeof rec.code === "string" ? rec.code : undefined,
        message: typeof rec.message === "string" ? rec.message : undefined,
        type: typeof rec.type === "string" ? rec.type : undefined,
      };
    }
    if (typeof e === "string") {
      return { message: e };
    }
  }
  return {};
}

/**
 * Classify a non-2xx HTTP response. `body` is the parsed JSON body when
 * available (may be undefined if the body was not JSON).
 */
export function classifyHttpStatus(status: number, body: unknown): ProviderFailure {
  const { code, message, type } = readErrorBody(body);
  const text = hay(code, message, type);
  const detail = message ?? code ?? `HTTP ${status}`;

  if (status === 401 || status === 403) {
    return makeFailure("PROVIDER_AUTH_FAILED", `Auth failed (${status}): ${detail}`);
  }
  if (status === 402) {
    return makeFailure("PROVIDER_QUOTA_EXCEEDED", `Payment required / balance exhausted (402): ${detail}`);
  }
  if (status === 429) {
    if (text.includes("quota") || text.includes("balance") || text.includes("insufficient")) {
      return makeFailure("PROVIDER_QUOTA_EXCEEDED", `Quota exceeded (429): ${detail}`);
    }
    return makeFailure("PROVIDER_RATE_LIMITED", `Rate limited (429): ${detail}`);
  }
  if (status === 413) {
    return makeFailure("PROVIDER_REQUEST_TOO_LARGE", `Request too large (413): ${detail}`);
  }
  if (status === 400 || status === 422) {
    if (text.includes("context length") || text.includes("context_length") || text.includes("maximum context") || text.includes("too many tokens")) {
      return makeFailure("PROVIDER_CONTEXT_LIMIT", `Context limit exceeded (${status}): ${detail}`);
    }
    if (text.includes("too large") || text.includes("request entity")) {
      return makeFailure("PROVIDER_REQUEST_TOO_LARGE", `Request too large (${status}): ${detail}`);
    }
    return makeFailure("PROVIDER_INVALID_REQUEST", `Invalid request (${status}): ${detail}`);
  }
  if (status === 404) {
    if (text.includes("model")) {
      return makeFailure("PROVIDER_MODEL_UNAVAILABLE", `Model unavailable (404): ${detail}`);
    }
    return makeFailure("PROVIDER_INVALID_REQUEST", `Not found (404): ${detail}`);
  }
  if (status === 503) {
    if (text.includes("resource")) {
      return makeFailure("PROVIDER_INSUFFICIENT_RESOURCE", `Insufficient system resource (503): ${detail}`);
    }
    return makeFailure("PROVIDER_UPSTREAM_5XX", `Upstream unavailable (503): ${detail}`);
  }
  if (status >= 500) {
    return makeFailure("PROVIDER_UPSTREAM_5XX", `Upstream error (${status}): ${detail}`);
  }
  return makeFailure("PROVIDER_UNKNOWN", `Unhandled HTTP status ${status}: ${detail}`);
}
