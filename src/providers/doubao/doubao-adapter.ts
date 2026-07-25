// ============================================================================
// Doubao web-search adapter.
//
// Supports the FeedCoop / Volcano web search API used as a supplement when the
// primary Bocha search returns weak or irrelevant coverage.
//
// The adapter is intentionally tolerant in response parsing because the public
// docs expose request fields more clearly than the result envelope. It accepts
// several plausible result shapes and normalizes them into WebSearchResultItem.
// ============================================================================

import {
  RETRYABLE_PROVIDER_ERRORS,
  type ProviderErrorCode,
  type ProviderFailure,
  type WebSearchProvider,
  type WebSearchResultItem,
} from "../types";

export const DOUBAO_WEB_SEARCH_ENDPOINT =
  "https://open.feedcoopapi.com/search_api/web_search";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DoubaoSearchAdapterConfig {
  apiKey?: string;
  apiKeyId?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
}

function makeFailure(code: ProviderErrorCode, message: string): ProviderFailure {
  return { code, message, retryable: RETRYABLE_PROVIDER_ERRORS.has(code) };
}

function classifyStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 402) return "PROVIDER_QUOTA_EXCEEDED";
  if (status === 408) return "PROVIDER_TIMEOUT";
  if (status === 413) return "PROVIDER_REQUEST_TOO_LARGE";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 400 || status === 422 || status === 404) return "PROVIDER_INVALID_REQUEST";
  if (status >= 500 && status <= 599) return "PROVIDER_UPSTREAM_5XX";
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

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickText(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function pickResultsFromArray(value: unknown[], now: () => string): WebSearchResultItem[] {
  const items: WebSearchResultItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const url = pickText(raw, ["url", "link", "Url", "Link"]);
    if (!url) continue;
    const title = pickText(raw, ["title", "name", "Title", "Name"]);
    const snippet = pickText(raw, [
      "snippet",
      "summary",
      "content",
      "text",
      "desc",
      "description",
      "Snippet",
      "Summary",
      "Content",
    ]);
    const sourceDomain =
      pickText(raw, ["sourceDomain", "siteName", "domain", "Domain", "SiteName"]) || hostnameOf(url);
    const fetchedAt =
      pickText(raw, ["fetchedAt", "date", "dateLastCrawled", "Date", "DateLastCrawled"]) || now();
    items.push({ title, url, snippet, sourceDomain, fetchedAt });
  }
  return items;
}

function extractResults(body: unknown, now: () => string): WebSearchResultItem[] | null {
  if (Array.isArray(body)) return pickResultsFromArray(body, now);
  if (!isRecord(body)) return null;

  const topLevelCandidates = [
    body["data"],
    body["Data"],
    body["result"],
    body["results"],
    body["items"],
  ];
  for (const candidate of topLevelCandidates) {
    if (Array.isArray(candidate)) return pickResultsFromArray(candidate, now);
    if (isRecord(candidate)) {
      const nested = [
        candidate["webPages"],
        candidate["webpages"],
        candidate["value"],
        candidate["results"],
        candidate["items"],
        candidate["data"],
      ];
      for (const inner of nested) {
        if (Array.isArray(inner)) return pickResultsFromArray(inner, now);
        if (isRecord(inner) && Array.isArray(inner["value"])) return pickResultsFromArray(inner["value"], now);
      }
    }
  }
  if (Array.isArray(body["value"])) return pickResultsFromArray(body["value"], now);
  return [];
}

export function createDoubaoSearchProvider(config: DoubaoSearchAdapterConfig = {}): WebSearchProvider {
  const apiKey = config.apiKey ?? process.env.DOUBAO_SEARCH_API_KEY ?? "";
  const apiKeyId = config.apiKeyId ?? process.env.DOUBAO_SEARCH_API_KEY_ID ?? "";
  const endpoint = config.endpoint ?? DOUBAO_WEB_SEARCH_ENDPOINT;
  const fetchImpl: FetchLike = config.fetchImpl ?? (globalThis.fetch as FetchLike);
  const maxRetries = config.maxRetries ?? 1;
  const retryBaseDelayMs = config.retryBaseDelayMs ?? 250;
  const timeoutMs = config.timeoutMs ?? 12_000;
  const sleep = config.sleep ?? defaultSleep;
  const now = config.now ?? (() => new Date().toISOString());

  async function attempt(query: string, limit: number): Promise<
    { ok: true; results: WebSearchResultItem[] } | { ok: false; error: ProviderFailure }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: apiKey ? `Bearer ${apiKey}` : "",
          "x-api-key": apiKey,
          "x-api-key-id": apiKeyId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Query: query,
          SearchType: "web",
          Count: Math.max(1, Math.min(50, Math.trunc(limit))),
          Filter: {
            NeedContent: true,
            NeedUrl: true,
          },
          QueryControl: {
            QueryRewrite: true,
          },
          ContentFormats: "text",
        }),
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
      return { ok: false, error: makeFailure(classifyStatus(res.status), `Doubao HTTP ${res.status}`) };
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      return { ok: false, error: makeFailure("PROVIDER_INVALID_JSON", String(err)) };
    }

    if (isRecord(parsed)) {
      const code = parsed["code"];
      if (typeof code === "number" && code !== 0 && code !== 200) {
        const msg = valueAsString(parsed["msg"]) || valueAsString(parsed["message"]) || `Doubao code ${code}`;
        return { ok: false, error: makeFailure(classifyStatus(code), msg) };
      }
    }

    const results = extractResults(parsed, now);
    if (results === null) {
      return { ok: false, error: makeFailure("PROVIDER_INVALID_RESPONSE_SHAPE", "unexpected Doubao response shape") };
    }
    return { ok: true, results };
  }

  return {
    async search(query, opts) {
      if (apiKey === "") {
        return { ok: false, error: makeFailure("PROVIDER_AUTH_FAILED", "missing DOUBAO_SEARCH_API_KEY") };
      }
      const requested = opts?.limit ?? 10;
      let last: ProviderFailure | null = null;
      for (let i = 0; i <= maxRetries; i++) {
        const result = await attempt(query, requested);
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
