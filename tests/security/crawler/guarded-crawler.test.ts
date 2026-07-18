import { describe, expect, it, vi } from "vitest";
import {
  createGuardedCrawler,
  type FetchImpl,
  type ResolveHost,
} from "../../../src/security/crawler/guarded-crawler";

const PUBLIC_IP = "93.184.216.34";
const publicResolver: ResolveHost = async () => [PUBLIC_IP];

function htmlResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("createGuardedCrawler", () => {
  it("fetches a public html page and returns its body", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("<html>ok</html>"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.status).toBe(200);
      expect(out.contentType).toBe("text/html");
      expect(out.body).toContain("ok");
      expect(out.redirectChain).toEqual(["https://example.com/"]);
    }
  });

  it("blocks a non-http(s) seed before any fetch", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("nope"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("file:///etc/passwd");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("NON_HTTP_PROTOCOL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a private IP-literal seed before any fetch", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("nope"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("http://169.254.169.254/latest/meta-data/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("PRIVATE_HOST");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding — public hostname resolving to a private IP", async () => {
    const rebind: ResolveHost = async () => ["10.0.0.5"];
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("secret"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: rebind });
    const out = await crawler.crawl("https://internal.attacker-controlled.example/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("PRIVATE_RESOLVED_IP");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to no records", async () => {
    const empty: ResolveHost = async () => [];
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("x"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: empty });
    const out = await crawler.crawl("https://nxdomain.example/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("DNS_RESOLUTION_FAILED");
  });

  it("blocks a redirect that points at a private host", async () => {
    const fetchImpl: FetchImpl = vi.fn(async (url: string) => {
      if (url === "https://example.com/") return redirectResponse("http://169.254.169.254/");
      return htmlResponse("should not reach");
    });
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("REDIRECT_TO_PRIVATE");
    // First hop fetched, second (private) never fetched.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a non-http(s) protocol", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => redirectResponse("file:///etc/passwd"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("NON_HTTP_PROTOCOL");
  });

  it("follows a safe redirect to a public host and re-validates it", async () => {
    const fetchImpl: FetchImpl = vi.fn(async (url: string) => {
      if (url === "https://example.com/") return redirectResponse("https://example.org/final");
      return htmlResponse("<html>final</html>");
    });
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.finalUrl).toBe("https://example.org/final");
      expect(out.redirectChain).toEqual(["https://example.com/", "https://example.org/final"]);
    }
  });

  it("rejects a redirect loop that exceeds maxRedirects", async () => {
    const fetchImpl: FetchImpl = vi.fn(async (url: string) =>
      redirectResponse(`${url}x`),
    );
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver, maxRedirects: 2 });
    const out = await crawler.crawl("https://example.com/");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("TOO_MANY_REDIRECTS");
  });

  it("rejects a disallowed content-type", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/doc");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("DISALLOWED_CONTENT_TYPE");
  });

  it("rejects a body larger than the cap (streamed)", async () => {
    const big = "x".repeat(5000);
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse(big));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver, maxBodyBytes: 100 });
    const out = await crawler.crawl("https://example.com/big");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("BODY_TOO_LARGE");
  });

  it("rejects an oversized body declared via content-length", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      htmlResponse("small", { "content-length": "9999999" }),
    );
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver, maxBodyBytes: 100 });
    const out = await crawler.crawl("https://example.com/claims-big");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("BODY_TOO_LARGE");
  });

  it("maps an aborted fetch to TIMEOUT", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/slow");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("TIMEOUT");
  });

  it("times out when the response body stalls beyond timeoutMs (slowloris body)", async () => {
    // Headers arrive fast, but the body never yields a chunk. The per-hop
    // timeout must abort the streamed read, not hang forever.
    const stalling = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => {
          /* never enqueues, never closes */
        });
      },
    });
    const fetchImpl: FetchImpl = vi.fn(
      async () =>
        new Response(stalling, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const crawler = createGuardedCrawler({
      fetchImpl,
      resolveHost: publicResolver,
      timeoutMs: 40,
    });
    const out = await crawler.crawl("https://example.com/slow-body");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("TIMEOUT");
  });

  it("maps a generic network error to FETCH_FAILED", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => {
      throw new TypeError("connect ECONNREFUSED");
    });
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/down");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("FETCH_FAILED");
  });

  it("maps a non-2xx/3xx status to HTTP_ERROR", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } }));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("https://example.com/missing");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("HTTP_ERROR");
  });

  it("never performs a real fetch when the seed URL is invalid", async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => htmlResponse("x"));
    const crawler = createGuardedCrawler({ fetchImpl, resolveHost: publicResolver });
    const out = await crawler.crawl("http://");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("INVALID_URL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
