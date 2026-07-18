// ============================================================================
// Bocha web-search adapter (Agent C) — implements WebSearchProvider.
//
// Reliability contract: docs/PROVIDER_RELIABILITY_CONTRACT.md + AGENTS.md §5.
//
// The endpoint is FROZEN to https://api.bocha.cn/v1/web-search per AGENTS.md §5
// ("博查仅 …/v1/web-search"). We deliberately do NOT honor a BOCHA_BASE_URL
// override here: freezing the host is the strongest guarantee we never call a
// non-Bocha origin. Only the API key is env-configurable. `fetchImpl` is
// injectable so unit tests use a mocked fetch and NEVER touch the real API.
//
// HTTP / network / body errors are classified into ProviderFailure with a
// `code` + `retryable` derived from RETRYABLE_PROVIDER_ERRORS. Only retryable
// classes are auto-retried, with exponential backoff.
// ============================================================================

import {
  RETRYABLE_PROVIDER_ERRORS,
  type ProviderErrorCode,
  type ProviderFailure,
  type WebSearchProvider,
  type WebSearchResultItem,
} from "../types";

/** Frozen Bocha web-search endpoint. Do not parameterize (AGENTS.md §5). */
export const BOCHA_WEB_SEARCH_ENDPOINT = "https://api.bocha.cn/v1/web-search";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface BochaAdapterConfig {
  /** API key; defaults to process.env.BOCHA_API_KEY. */
  apiKey?: string;
  /** Injectable fetch (tests pass a mock; never a real client). */
  fetchImpl?: FetchLike;
  /** Retry attempts after the first, for retryable errors only. Default 2. */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff between retries. Default 200. */
  retryBaseDelayMs?: number;
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Injectable sleep for deterministic tests. Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock producing ISO strings; used as fetchedAt fallback. */
  now?: () => string;
}

type SearchResult =
  | { ok: true; results: WebSearchResultItem[] }
  | { ok: false; error: ProviderFailure };

function makeFailure(code: ProviderErrorCode, message: string): ProviderFailure {
  return { code, message, retryable: RETRYABLE_PROVIDER_ERRORS.has(code) };
}

/** Map an HTTP status (or Bocha body `code`) to a ProviderErrorCode. */
export function classifyStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 402) return "PROVIDER_QUOTA_EXCEEDED";
  if (status === 408) return "PROVIDER_TIMEOUT";
  if (status === 413) return "PROVIDER_REQUEST_TOO_LARGE";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 400 || status === 422) return "PROVIDER_INVALID_REQUEST";
  if (status === 404) return "PROVIDER_INVALID_REQUEST";
  if (status >= 500 && status <= 599) return "PROVIDER_UPSTREAM_5XX";
  if (status >= 400 && status <= 499) return "PROVIDER_INVALID_REQUEST";
  return "PROVIDER_UNKNOWN";
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extract WebSearchResultItems from a parsed Bocha response body. Returns null
 * when the top-level shape is not an object (invalid shape). A well-formed body
 * that simply carries no results yields an empty array.
 */
function extractResults(body: unknown, now: () => string): WebSearchResultItem[] | null {
  if (!isRecord(body)) return null;
  const data = body["data"];
  if (!isRecord(data)) return [];
  const webPages = data["webPages"];
  if (!isRecord(webPages)) return [];
  const value = webPages["value"];
  if (!Array.isArray(value)) return [];

  const items: WebSearchResultItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const url = typeof raw["url"] === "string" ? raw["url"] : "";
    if (url === "") continue;
    const title = typeof raw["name"] === "string" ? raw["name"] : "";
    const snippet =
      typeof raw["summary"] === "string"
        ? raw["summary"]
        : typeof raw["snippet"] === "string"
          ? raw["snippet"]
          : "";
    const siteName = typeof raw["siteName"] === "string" ? raw["siteName"] : "";
    const fetchedAt =
      typeof raw["dateLastCrawled"] === "string" && raw["dateLastCrawled"] !== ""
        ? raw["dateLastCrawled"]
        : now();
    items.push({
      title,
      url,
      snippet,
      sourceDomain: siteName || hostnameOf(url),
      fetchedAt,
    });
  }
  return items;
}

export function createBochaProvider(config: BochaAdapterConfig = {}): WebSearchProvider {
  const apiKey = config.apiKey ?? process.env.BOCHA_API_KEY ?? "";
  const fetchImpl: FetchLike = config.fetchImpl ?? (globalThis.fetch as FetchLike);
  const maxRetries = config.maxRetries ?? 2;
  const retryBaseDelayMs = config.retryBaseDelayMs ?? 200;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const sleep = config.sleep ?? defaultSleep;
  const now = config.now ?? (() => new Date().toISOString());

  async function attempt(query: string, limit: number): Promise<SearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(BOCHA_WEB_SEARCH_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, count: limit, summary: true }),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        return { ok: false, error: makeFailure("PROVIDER_TIMEOUT", `request aborted after ${timeoutMs}ms`) };
      }
      return { ok: false, error: makeFailure("PROVIDER_CONNECTION_FAILED", String(err)) };
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const code = classifyStatus(res.status);
      return { ok: false, error: makeFailure(code, `Bocha HTTP ${res.status}`) };
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      return { ok: false, error: makeFailure("PROVIDER_INVALID_JSON", String(err)) };
    }

    // Bocha may return HTTP 200 with an error `code` in the JSON envelope.
    if (isRecord(parsed) && typeof parsed["code"] === "number" && parsed["code"] !== 200) {
      const code = classifyStatus(parsed["code"]);
      const msg = typeof parsed["msg"] === "string" ? parsed["msg"] : `Bocha code ${parsed["code"]}`;
      return { ok: false, error: makeFailure(code, msg) };
    }

    const results = extractResults(parsed, now);
    if (results === null) {
      return { ok: false, error: makeFailure("PROVIDER_INVALID_RESPONSE_SHAPE", "unexpected Bocha response shape") };
    }
    return { ok: true, results };
  }

  return {
    async search(query, opts) {
      if (apiKey === "") {
        return { ok: false, error: makeFailure("PROVIDER_AUTH_FAILED", "missing BOCHA_API_KEY") };
      }
      const requested = opts?.limit ?? 10;
      const limit = Math.max(1, Math.min(50, Math.trunc(requested)));

      let last: ProviderFailure | null = null;
      for (let i = 0; i <= maxRetries; i++) {
        const result = await attempt(query, limit);
        if (result.ok) return result;
        last = result.error;
        if (!RETRYABLE_PROVIDER_ERRORS.has(result.error.code)) return result;
        if (i < maxRetries) {
          await sleep(retryBaseDelayMs * 2 ** i);
        }
      }
      return {
        ok: false,
        error: last ?? makeFailure("PROVIDER_UNKNOWN", "exhausted retries without a result"),
      };
    },
  };
}
