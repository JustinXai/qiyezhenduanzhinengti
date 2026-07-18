// Shared provider interfaces. Real adapters live in ./bocha (Agent C) and ./deepseek (Agent D).
// Mock implementations under ./mock/ back `pnpm smoke:mock` and never call real APIs.

export type ProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_CONNECTION_FAILED"
  | "PROVIDER_CONTEXT_LIMIT"
  | "PROVIDER_REQUEST_TOO_LARGE"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_EMPTY_CHOICES"
  | "PROVIDER_EMPTY_FINAL_CONTENT"
  | "PROVIDER_TRUNCATED_OUTPUT"
  | "PROVIDER_CONTENT_FILTERED"
  | "PROVIDER_INSUFFICIENT_RESOURCE"
  | "PROVIDER_INVALID_RESPONSE_SHAPE"
  | "PROVIDER_INVALID_JSON"
  | "PROVIDER_SCHEMA_MISMATCH"
  | "PROVIDER_UPSTREAM_5XX"
  | "PROVIDER_MODEL_UNAVAILABLE"
  | "PROVIDER_UNKNOWN";

export const RETRYABLE_PROVIDER_ERRORS: ReadonlySet<ProviderErrorCode> = new Set([
  "PROVIDER_TIMEOUT",
  "PROVIDER_CONNECTION_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM_5XX",
  "PROVIDER_MODEL_UNAVAILABLE",
]);

export interface ProviderFailure {
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
  fetchedAt: string;
}

export interface WebSearchProvider {
  search(query: string, opts?: { limit?: number }): Promise<
    { ok: true; results: WebSearchResultItem[] } | { ok: false; error: ProviderFailure }
  >;
}

export interface StructuredCompletionProvider {
  completeJson(input: {
    stage: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<
    { ok: true; json: unknown } | { ok: false; error: ProviderFailure }
  >;
}
