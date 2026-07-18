import { describe, expect, it, vi } from "vitest";
import {
  BOCHA_WEB_SEARCH_ENDPOINT,
  classifyStatus,
  createBochaProvider,
} from "../../src/providers/bocha/bocha-adapter";
import { RETRYABLE_PROVIDER_ERRORS } from "../../src/providers/types";

type FetchMock = (url: string, init: RequestInit) => Promise<Response>;

const FIXED_NOW = "2026-07-18T00:00:00.000Z";

function bochaSuccessBody(items: Array<Record<string, unknown>>): Response {
  return new Response(
    JSON.stringify({ code: 200, msg: null, data: { webPages: { value: items } } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseConfig = {
  apiKey: "test-key",
  retryBaseDelayMs: 0,
  sleep: async () => {},
  now: () => FIXED_NOW,
};

describe("createBochaProvider — success path", () => {
  it("maps a Bocha response to WebSearchResultItem[] and hits the frozen endpoint", async () => {
    const fetchImpl = vi.fn<FetchMock>(async () =>
      bochaSuccessBody([
        {
          name: "示例智能装备 - 官网",
          url: "https://example-equip.com/",
          summary: "柔性装配线与售后运维服务。",
          siteName: "example-equip.com",
          dateLastCrawled: "2026-07-01T00:00:00.000Z",
        },
      ]),
    );
    const provider = createBochaProvider({ ...baseConfig, fetchImpl });
    const out = await provider.search("示例智能装备", { limit: 5 });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.results).toHaveLength(1);
      expect(out.results[0]).toEqual({
        title: "示例智能装备 - 官网",
        url: "https://example-equip.com/",
        snippet: "柔性装配线与售后运维服务。",
        sourceDomain: "example-equip.com",
        fetchedAt: "2026-07-01T00:00:00.000Z",
      });
    }

    // Endpoint frozen; auth header + JSON body with query/count present.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0]!;
    expect(calledUrl).toBe(BOCHA_WEB_SEARCH_ENDPOINT);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init?.body as string) as { query: string; count: number };
    expect(body.query).toBe("示例智能装备");
    expect(body.count).toBe(5);
  });

  it("falls back to now() for fetchedAt and hostname for sourceDomain when fields are missing", async () => {
    const fetchImpl = vi.fn(async () =>
      bochaSuccessBody([{ name: "No dates", url: "https://news.example.net/a", snippet: "s" }]),
    );
    const provider = createBochaProvider({ ...baseConfig, fetchImpl });
    const out = await provider.search("q");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.results[0]?.fetchedAt).toBe(FIXED_NOW);
      expect(out.results[0]?.sourceDomain).toBe("news.example.net");
    }
  });

  it("returns an empty result set (not an error) when there are no web pages", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 200, data: {} }));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl });
    const out = await provider.search("q");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.results).toEqual([]);
  });

  it("clamps the limit into [1,50]", async () => {
    const fetchImpl = vi.fn<FetchMock>(async () => bochaSuccessBody([]));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl });
    await provider.search("q", { limit: 999 });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string) as { count: number };
    expect(body.count).toBe(50);
  });
});

describe("createBochaProvider — error classification & retries", () => {
  it("returns PROVIDER_AUTH_FAILED without any fetch when the API key is missing", async () => {
    const fetchImpl = vi.fn(async () => bochaSuccessBody([]));
    const provider = createBochaProvider({ ...baseConfig, apiKey: "", fetchImpl });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("PROVIDER_AUTH_FAILED");
      expect(out.error.retryable).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does NOT retry a 401 auth failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "unauthorized" }, 401));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 3 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("PROVIDER_AUTH_FAILED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 rate limit up to maxRetries then fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "slow down" }, 429));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 2 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("PROVIDER_RATE_LIMITED");
      expect(out.error.retryable).toBe(true);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries a 500 and succeeds on a later attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ msg: "boom" }, 500))
      .mockResolvedValueOnce(bochaSuccessBody([{ name: "ok", url: "https://x.example/a" }]));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 2 });
    const out = await provider.search("q");
    expect(out.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps a thrown network error to PROVIDER_CONNECTION_FAILED (retryable)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 1 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("PROVIDER_CONNECTION_FAILED");
      expect(out.error.retryable).toBe(true);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps an aborted request to PROVIDER_TIMEOUT (retryable)", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 0 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("PROVIDER_TIMEOUT");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps invalid JSON to PROVIDER_INVALID_JSON (not retryable, no retry)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<<not json>>", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 3 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("PROVIDER_INVALID_JSON");
      expect(out.error.retryable).toBe(false);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a non-object body to PROVIDER_INVALID_RESPONSE_SHAPE", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(["unexpected", "array"]));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("PROVIDER_INVALID_RESPONSE_SHAPE");
  });

  it("classifies an in-envelope error code (HTTP 200 body.code != 200)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 429, msg: "rate limited in body" }));
    const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 0 });
    const out = await provider.search("q");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("PROVIDER_RATE_LIMITED");
  });

  it("every failure's retryable flag matches RETRYABLE_PROVIDER_ERRORS", async () => {
    const codes = [
      { status: 401, expected: false },
      { status: 402, expected: false },
      { status: 429, expected: true },
      { status: 500, expected: true },
      { status: 400, expected: false },
    ];
    for (const { status, expected } of codes) {
      const fetchImpl = vi.fn(async () => jsonResponse({ msg: "x" }, status));
      const provider = createBochaProvider({ ...baseConfig, fetchImpl, maxRetries: 0 });
      const out = await provider.search("q");
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.retryable).toBe(RETRYABLE_PROVIDER_ERRORS.has(out.error.code));
        expect(out.error.retryable).toBe(expected);
      }
    }
  });
});

describe("classifyStatus", () => {
  it("maps HTTP statuses to the documented ProviderErrorCodes", () => {
    expect(classifyStatus(401)).toBe("PROVIDER_AUTH_FAILED");
    expect(classifyStatus(403)).toBe("PROVIDER_AUTH_FAILED");
    expect(classifyStatus(402)).toBe("PROVIDER_QUOTA_EXCEEDED");
    expect(classifyStatus(408)).toBe("PROVIDER_TIMEOUT");
    expect(classifyStatus(413)).toBe("PROVIDER_REQUEST_TOO_LARGE");
    expect(classifyStatus(429)).toBe("PROVIDER_RATE_LIMITED");
    expect(classifyStatus(400)).toBe("PROVIDER_INVALID_REQUEST");
    expect(classifyStatus(422)).toBe("PROVIDER_INVALID_REQUEST");
    expect(classifyStatus(503)).toBe("PROVIDER_UPSTREAM_5XX");
  });
});
