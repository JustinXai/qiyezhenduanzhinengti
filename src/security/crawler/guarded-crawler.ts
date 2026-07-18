// ============================================================================
// Guarded crawler (Agent C) — see docs/SECURITY_INVARIANTS.md.
//
// A controlled fetch wrapper that enforces every crawler invariant:
//   - structural SSRF check on every hop (assertUrlAllowed)
//   - DNS resolution + per-IP re-validation before connecting (rebinding)
//   - MANUAL redirect handling; each redirect target is re-validated
//   - redirect-to-private is blocked and reported distinctly
//   - request timeout (AbortController)
//   - response body size cap (streamed, aborts early)
//   - Content-Type allow-list
//   - redirect-count cap
//
// `fetchImpl` and `resolveHost` are injectable so unit tests never touch the
// real network or DNS. The production defaults use global fetch + node:dns.
// ============================================================================

import { lookup } from "node:dns/promises";
import {
  assertUrlAllowed,
  classifyIp,
  isIpLiteral,
  stripBrackets,
} from "./ssrf-guard";

export type CrawlRejectReason =
  | "INVALID_URL"
  | "NON_HTTP_PROTOCOL"
  | "CREDENTIALS_IN_URL"
  | "PRIVATE_HOST"
  | "PRIVATE_RESOLVED_IP"
  | "DNS_RESOLUTION_FAILED"
  | "REDIRECT_TO_PRIVATE"
  | "TOO_MANY_REDIRECTS"
  | "DISALLOWED_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "FETCH_FAILED";

export interface CrawlSuccess {
  ok: true;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirectChain: string[];
}

export interface CrawlRejection {
  ok: false;
  reason: CrawlRejectReason;
  detail: string;
}

export type CrawlOutcome = CrawlSuccess | CrawlRejection;

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;
export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface GuardedCrawlerConfig {
  fetchImpl?: FetchImpl;
  resolveHost?: ResolveHost;
  maxRedirects?: number;
  maxBodyBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
  userAgent?: string;
}

export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

async function readCappedText(
  res: Response,
  cap: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > cap) {
          await reader.cancel();
          return { ok: false };
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, text: new TextDecoder("utf-8").decode(merged) };
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > cap) return { ok: false };
  return { ok: true, text: new TextDecoder("utf-8").decode(buf) };
}

export function createGuardedCrawler(config: GuardedCrawlerConfig = {}) {
  const fetchImpl: FetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchImpl);
  const resolveHost: ResolveHost = config.resolveHost ?? defaultResolveHost;
  const maxRedirects = config.maxRedirects ?? 3;
  const maxBodyBytes = config.maxBodyBytes ?? 2_000_000;
  const timeoutMs = config.timeoutMs ?? 8_000;
  const allowed = (config.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES).map((c) =>
    c.toLowerCase(),
  );
  const userAgent = config.userAgent ?? "EnterpriseDiagnosisBot/1.0 (+guarded-crawler)";

  /** Structural + DNS-resolution validation for a single target URL. */
  async function guardTarget(
    url: URL,
  ): Promise<{ ok: true } | { ok: false; reason: CrawlRejectReason; detail: string }> {
    const structural = assertUrlAllowed(url);
    if (!structural.ok) {
      return { ok: false, reason: structural.reason, detail: structural.detail };
    }
    if (!isIpLiteral(url.hostname)) {
      let ips: string[];
      try {
        ips = await resolveHost(stripBrackets(url.hostname));
      } catch (err) {
        return { ok: false, reason: "DNS_RESOLUTION_FAILED", detail: String(err) };
      }
      if (!ips || ips.length === 0) {
        return { ok: false, reason: "DNS_RESOLUTION_FAILED", detail: "no A/AAAA records" };
      }
      for (const ip of ips) {
        const cls = classifyIp(ip);
        if (cls !== "public") {
          return {
            ok: false,
            reason: "PRIVATE_RESOLVED_IP",
            detail: `${url.hostname} -> ${ip} (${cls})`,
          };
        }
      }
    }
    return { ok: true };
  }

  async function crawl(rawUrl: string): Promise<CrawlOutcome> {
    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      return { ok: false, reason: "INVALID_URL", detail: rawUrl };
    }

    const redirectChain: string[] = [];

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const guard = await guardTarget(current);
      if (!guard.ok) {
        // A blocked target discovered while following a redirect is reported as
        // "redirect to private" so callers can distinguish it from a bad seed.
        const reason =
          hop > 0 && (guard.reason === "PRIVATE_HOST" || guard.reason === "PRIVATE_RESOLVED_IP")
            ? "REDIRECT_TO_PRIVATE"
            : guard.reason;
        return { ok: false, reason, detail: guard.detail };
      }
      redirectChain.push(current.toString());

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(current.toString(), {
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": userAgent, accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        });
      } catch (err) {
        clearTimeout(timer);
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError" || name === "TimeoutError") {
          return { ok: false, reason: "TIMEOUT", detail: `aborted after ${timeoutMs}ms` };
        }
        return { ok: false, reason: "FETCH_FAILED", detail: String(err) };
      } finally {
        clearTimeout(timer);
      }

      const status = res.status;

      if (REDIRECT_STATUSES.has(status)) {
        const location = res.headers.get("location");
        if (!location) {
          return { ok: false, reason: "HTTP_ERROR", detail: `${status} without Location` };
        }
        if (hop >= maxRedirects) {
          return { ok: false, reason: "TOO_MANY_REDIRECTS", detail: `>${maxRedirects} redirects` };
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { ok: false, reason: "REDIRECT_TO_PRIVATE", detail: `unparseable Location: ${location}` };
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          return { ok: false, reason: "NON_HTTP_PROTOCOL", detail: next.protocol };
        }
        current = next;
        continue;
      }

      if (status < 200 || status >= 300) {
        return { ok: false, reason: "HTTP_ERROR", detail: String(status) };
      }

      const contentTypeRaw = res.headers.get("content-type") ?? "";
      const contentType = (contentTypeRaw.split(";")[0] ?? "").trim().toLowerCase();
      if (!allowed.includes(contentType)) {
        return { ok: false, reason: "DISALLOWED_CONTENT_TYPE", detail: contentTypeRaw || "(none)" };
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && Number(contentLength) > maxBodyBytes) {
        return { ok: false, reason: "BODY_TOO_LARGE", detail: `content-length ${contentLength}` };
      }

      const bodyRead = await readCappedText(res, maxBodyBytes);
      if (!bodyRead.ok) {
        return { ok: false, reason: "BODY_TOO_LARGE", detail: `body exceeded ${maxBodyBytes} bytes` };
      }

      return {
        ok: true,
        finalUrl: current.toString(),
        status,
        contentType,
        body: bodyRead.text,
        redirectChain,
      };
    }

    return { ok: false, reason: "TOO_MANY_REDIRECTS", detail: `>${maxRedirects} redirects` };
  }

  return { crawl };
}

export type GuardedCrawler = ReturnType<typeof createGuardedCrawler>;
