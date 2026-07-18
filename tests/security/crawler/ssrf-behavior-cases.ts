// ============================================================================
// Behavioral SSRF adversarial corpus — the SINGLE source of truth shared by:
//   - the vitest guard (tests/security/crawler/ssrf-behavior-gate.test.ts)
//   - the CI gate         (scripts/security-check.ts, strict-by-default)
//
// Every case is expressed purely in terms of the crawler's PUBLIC behaviour:
// given a URL plus an injected DNS resolver / fetch, `crawl()` must REJECT
// (or, for the positive controls, must SUCCEED). No case inspects crawler
// source strings, so the gate cannot be satisfied by comments or token
// vocabulary — only by real, observed behaviour. A crawler that stops blocking
// any invariant makes its case fail, and a crawler that "passes" by rejecting
// everything fails the positive controls.
//
// Nothing here touches the real network or real DNS: `fetchImpl` and
// `resolveHost` are always injected.
// ============================================================================
import {
  createGuardedCrawler,
  type CrawlOutcome,
  type CrawlRejectReason,
  type FetchImpl,
  type ResolveHost,
} from "../../../src/security/crawler/guarded-crawler";

const PUBLIC_IPV4 = "93.184.216.34";
/** Default resolver used when a case does not override it: every name is public. */
export const publicResolver: ResolveHost = async () => [PUBLIC_IPV4];

function html(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** A resolver keyed by hostname (falls back to a public IP). */
function resolverByHost(map: Record<string, string[]>): ResolveHost {
  return async (host: string) => map[host] ?? [PUBLIC_IPV4];
}

/** A resolver that returns `first` on its first call and `rest` thereafter. */
function flippingResolver(first: string[], rest: string[]): ResolveHost {
  let calls = 0;
  return async () => (calls++ === 0 ? first : rest);
}

export interface SsrfCase {
  /** Human-readable label; also the invariant it protects. */
  name: string;
  url: string;
  resolveHost?: ResolveHost;
  fetchImpl?: FetchImpl;
  maxRedirects?: number;
  maxBodyBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
  /** Expected top-level result. */
  outcome: "reject" | "allow";
  /** Optional exact rejection reason (when the reason itself is load-bearing). */
  reason?: CrawlRejectReason;
  /** Optional exact number of times fetch was invoked (0 = blocked pre-network). */
  fetchCalls?: number;
}

export interface CaseResult {
  name: string;
  pass: boolean;
  detail: string;
}

/**
 * Drive one case through a real `createGuardedCrawler`. The injected fetch is
 * wrapped in a counter so "must not reach the network" is enforceable: a
 * regression that fetches a private target both changes the outcome/reason AND
 * trips the fetch-call assertion.
 */
export async function runSsrfCase(c: SsrfCase): Promise<CaseResult> {
  let calls = 0;
  // Default fetch returns a leaky body: if a pre-network block regresses and
  // the target IS fetched, the case flips to `allow`/wrong-reason and fails.
  const baseFetch: FetchImpl = c.fetchImpl ?? (async () => html("<html>LEAKED-OK</html>"));
  const countingFetch: FetchImpl = async (u, init) => {
    calls++;
    return baseFetch(u, init);
  };

  const crawler = createGuardedCrawler({
    fetchImpl: countingFetch,
    resolveHost: c.resolveHost ?? publicResolver,
    maxRedirects: c.maxRedirects,
    maxBodyBytes: c.maxBodyBytes,
    timeoutMs: c.timeoutMs,
    allowedContentTypes: c.allowedContentTypes,
  });

  let out: CrawlOutcome;
  try {
    out = await crawler.crawl(c.url);
  } catch (err) {
    return { name: c.name, pass: false, detail: `crawl() threw: ${String(err)}` };
  }

  if (c.outcome === "allow") {
    if (!out.ok) {
      return {
        name: c.name,
        pass: false,
        detail: `expected ALLOW but was rejected: ${out.reason} (${out.detail})`,
      };
    }
  } else {
    if (out.ok) {
      return {
        name: c.name,
        pass: false,
        detail: `expected REJECT but crawl() succeeded (finalUrl=${out.finalUrl})`,
      };
    }
    if (c.reason && out.reason !== c.reason) {
      return {
        name: c.name,
        pass: false,
        detail: `rejected with ${out.reason}, expected ${c.reason} (${out.detail})`,
      };
    }
  }

  if (typeof c.fetchCalls === "number" && calls !== c.fetchCalls) {
    return {
      name: c.name,
      pass: false,
      detail: `fetch invoked ${calls}x, expected ${c.fetchCalls}`,
    };
  }

  return {
    name: c.name,
    pass: true,
    detail: out.ok ? "allowed" : `rejected: ${out.reason}`,
  };
}

export async function runAllSsrfCases(cases: SsrfCase[] = SSRF_CASES): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) results.push(await runSsrfCase(c));
  return results;
}

// ---------------------------------------------------------------------------
// The corpus. Grouped by the invariant each case defends
// (docs/SECURITY_INVARIANTS.md + task "必须拒绝 / 必须测试").
// ---------------------------------------------------------------------------

export const SSRF_CASES: SsrfCase[] = [
  // --- non-http(s) protocols (blocked before any network I/O) ---------------
  { name: "protocol: file://", url: "file:///etc/passwd", outcome: "reject", reason: "NON_HTTP_PROTOCOL", fetchCalls: 0 },
  { name: "protocol: ftp://", url: "ftp://example.com/x", outcome: "reject", reason: "NON_HTTP_PROTOCOL", fetchCalls: 0 },
  { name: "protocol: gopher://", url: "gopher://example.com/", outcome: "reject", reason: "NON_HTTP_PROTOCOL", fetchCalls: 0 },
  { name: "protocol: data:", url: "data:text/html,hi", outcome: "reject", reason: "NON_HTTP_PROTOCOL", fetchCalls: 0 },

  // --- credentials in URL ---------------------------------------------------
  { name: "credentials: user:pass@host", url: "https://user:pass@example.com/", outcome: "reject", reason: "CREDENTIALS_IN_URL", fetchCalls: 0 },
  { name: "credentials: over private host", url: "http://user:pass@10.0.0.1/", outcome: "reject", reason: "CREDENTIALS_IN_URL", fetchCalls: 0 },

  // --- invalid URL ----------------------------------------------------------
  { name: "invalid: empty host", url: "http://", outcome: "reject", reason: "INVALID_URL", fetchCalls: 0 },

  // --- localhost ------------------------------------------------------------
  { name: "localhost", url: "http://localhost/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "localhost: uppercase + port", url: "http://LOCALHOST:8080/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "localhost: *.localhost", url: "http://api.localhost/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },

  // --- IPv4 private / loopback / reserved literals --------------------------
  { name: "ipv4: 127.0.0.1 loopback", url: "http://127.0.0.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv4: 10.0.0.0/8", url: "http://10.1.2.3/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv4: 172.16.0.0/12", url: "http://172.16.0.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv4: 192.168.0.0/16", url: "http://192.168.1.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv4: 0.0.0.0", url: "http://0.0.0.0/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv4: 100.64.0.0/10 CGNAT", url: "http://100.64.0.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },

  // --- link-local + cloud metadata ------------------------------------------
  { name: "link-local: 169.254.x", url: "http://169.254.1.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "metadata: 169.254.169.254", url: "http://169.254.169.254/latest/meta-data/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },

  // --- alternative IPv4 encodings that normalize to a blocked address -------
  { name: "decimal ip: 2130706433 -> 127.0.0.1", url: "http://2130706433/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "decimal ip: 2852039166 -> 169.254.169.254", url: "http://2852039166/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "hex ip: 0x7f000001 -> 127.0.0.1", url: "http://0x7f000001/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "short ip: 127.1 -> 127.0.0.1", url: "http://127.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "octal ip: 0177.0.0.1 -> 127.0.0.1", url: "http://0177.0.0.1/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },

  // --- IPv6 private literals -------------------------------------------------
  { name: "ipv6: [::1] loopback", url: "http://[::1]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6: [::] unspecified", url: "http://[::]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6: [fe80::1] link-local", url: "http://[fe80::1]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6: [fc00::1] ULA", url: "http://[fc00::1]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6-mapped: [::ffff:127.0.0.1]", url: "http://[::ffff:127.0.0.1]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6-mapped: [::ffff:169.254.169.254] metadata", url: "http://[::ffff:169.254.169.254]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },
  { name: "ipv6-mapped-hex: [::ffff:a9fe:a9fe] metadata", url: "http://[::ffff:a9fe:a9fe]/", outcome: "reject", reason: "PRIVATE_HOST", fetchCalls: 0 },

  // --- DNS resolution: name resolving to a blocked IP (rebinding at seed) ----
  {
    name: "dns: public name -> 10.0.0.5 (rebinding)",
    url: "https://internal.attacker.example/",
    resolveHost: async () => ["10.0.0.5"],
    outcome: "reject",
    reason: "PRIVATE_RESOLVED_IP",
    fetchCalls: 0,
  },
  {
    name: "dns: public name -> 169.254.169.254 (metadata via DNS)",
    url: "https://metadata.attacker.example/",
    resolveHost: async () => ["169.254.169.254"],
    outcome: "reject",
    reason: "PRIVATE_RESOLVED_IP",
    fetchCalls: 0,
  },
  {
    name: "dns: public name -> fd00::1 (IPv6 ULA via DNS)",
    url: "https://v6.attacker.example/",
    resolveHost: async () => ["fd00::1"],
    outcome: "reject",
    reason: "PRIVATE_RESOLVED_IP",
    fetchCalls: 0,
  },
  {
    name: "dns: mixed public+private records — ALL must be public",
    url: "https://mixed.attacker.example/",
    resolveHost: async () => [PUBLIC_IPV4, "10.0.0.5"],
    outcome: "reject",
    reason: "PRIVATE_RESOLVED_IP",
    fetchCalls: 0,
  },
  {
    name: "dns: no records",
    url: "https://nxdomain.example/",
    resolveHost: async () => [],
    outcome: "reject",
    reason: "DNS_RESOLUTION_FAILED",
    fetchCalls: 0,
  },

  // --- HTTP redirect to a private target (each status code) ------------------
  ...[301, 302, 307, 308].map(
    (status): SsrfCase => ({
      name: `redirect ${status} -> 169.254.169.254 (metadata)`,
      url: "https://example.com/",
      fetchImpl: async (u) =>
        u === "https://example.com/"
          ? redirectTo("http://169.254.169.254/latest/meta-data/", status)
          : html("<html>SHOULD-NOT-REACH</html>"),
      outcome: "reject",
      reason: "REDIRECT_TO_PRIVATE",
      fetchCalls: 1,
    }),
  ),
  {
    name: "redirect -> non-http(s) (file://)",
    url: "https://example.com/",
    fetchImpl: async () => redirectTo("file:///etc/passwd"),
    outcome: "reject",
    reason: "NON_HTTP_PROTOCOL",
    fetchCalls: 1,
  },
  {
    name: "redirect -> DNS name resolving to private (rebinding at redirect)",
    url: "https://start.example/",
    resolveHost: resolverByHost({ "rebind.internal.example": ["10.0.0.9"] }),
    fetchImpl: async (u) =>
      u === "https://start.example/"
        ? redirectTo("https://rebind.internal.example/")
        : html("<html>SHOULD-NOT-REACH</html>"),
    outcome: "reject",
    reason: "REDIRECT_TO_PRIVATE",
    fetchCalls: 1,
  },
  {
    name: "redirect: multi-hop, last hop private",
    url: "https://a.example/",
    fetchImpl: async (u) => {
      if (u === "https://a.example/") return redirectTo("https://b.example/");
      if (u === "https://b.example/") return redirectTo("http://10.0.0.7/");
      return html("<html>SHOULD-NOT-REACH</html>");
    },
    outcome: "reject",
    reason: "REDIRECT_TO_PRIVATE",
    fetchCalls: 2,
  },
  {
    name: "rebinding across hops: DNS public first, private on re-resolution",
    url: "https://flip.example/",
    // Same host is re-resolved on the redirect hop; the answer flips to private.
    resolveHost: flippingResolver([PUBLIC_IPV4], ["10.0.0.11"]),
    fetchImpl: async (u) =>
      u === "https://flip.example/"
        ? redirectTo("https://flip.example/next")
        : html("<html>SHOULD-NOT-REACH</html>"),
    outcome: "reject",
    reason: "REDIRECT_TO_PRIVATE",
    fetchCalls: 1,
  },
  {
    name: "redirect: loop exceeding maxRedirects",
    url: "https://loop.example/",
    fetchImpl: async (u) => redirectTo(`${u}x`),
    maxRedirects: 2,
    outcome: "reject",
    reason: "TOO_MANY_REDIRECTS",
  },

  // --- response-level limits -------------------------------------------------
  {
    name: "content-type: disallowed (application/pdf)",
    url: "https://example.com/doc",
    fetchImpl: async () =>
      new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }),
    outcome: "reject",
    reason: "DISALLOWED_CONTENT_TYPE",
  },
  {
    name: "body: streamed body exceeds cap",
    url: "https://example.com/big",
    fetchImpl: async () => html("x".repeat(5000)),
    maxBodyBytes: 100,
    outcome: "reject",
    reason: "BODY_TOO_LARGE",
  },
  {
    name: "body: content-length exceeds cap",
    url: "https://example.com/claims-big",
    fetchImpl: async () => html("small", { "content-length": "9999999" }),
    maxBodyBytes: 100,
    outcome: "reject",
    reason: "BODY_TOO_LARGE",
  },
  {
    name: "timeout: fetch aborts (connect/headers)",
    url: "https://example.com/slow",
    fetchImpl: async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    },
    outcome: "reject",
    reason: "TIMEOUT",
  },
  {
    name: "timeout: body stalls beyond timeoutMs (slowloris body)",
    url: "https://example.com/slow-body",
    fetchImpl: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => {
              /* never enqueues, never closes */
            });
          },
        }),
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    timeoutMs: 40,
    outcome: "reject",
    reason: "TIMEOUT",
  },
  {
    name: "http error: non-2xx/3xx",
    url: "https://example.com/missing",
    fetchImpl: async () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } }),
    outcome: "reject",
    reason: "HTTP_ERROR",
  },

  // --- positive controls: legitimate public traffic MUST still succeed -------
  // These fail if a crawler is "hardened" into rejecting everything to pass.
  {
    name: "positive: public https html page is allowed",
    url: "https://example.com/",
    fetchImpl: async () => html("<html>ok</html>"),
    outcome: "allow",
    fetchCalls: 1,
  },
  {
    name: "positive: safe redirect to another public host is followed",
    url: "https://example.com/",
    fetchImpl: async (u) =>
      u === "https://example.com/"
        ? redirectTo("https://example.org/final")
        : html("<html>final</html>"),
    outcome: "allow",
    fetchCalls: 2,
  },
];
