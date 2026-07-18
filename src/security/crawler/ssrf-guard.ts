// ============================================================================
// SSRF guard (Agent C) — see docs/SECURITY_INVARIANTS.md.
//
// Pure, synchronous URL / IP classification used by the guarded crawler. It
// blocks requests to loopback, private, link-local, CGNAT, IPv6 ULA/link-local,
// IPv4-mapped-private, cloud metadata (169.254.169.254), credentials-in-URL,
// and non-http(s) protocols. DNS-name hosts pass the *structural* check here
// and are re-validated after resolution by the crawler (DNS-rebinding defense).
//
// Fail-closed: anything we cannot parse as a public IP literal is rejected when
// it looks like a literal, and unparseable resolved IPs are treated as private.
// ============================================================================

export type SsrfGuardReason =
  | "INVALID_URL"
  | "NON_HTTP_PROTOCOL"
  | "CREDENTIALS_IN_URL"
  | "PRIVATE_HOST";

export type SsrfCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: SsrfGuardReason; detail: string };

export type IpClass = "private" | "public" | "invalid";

// --- helpers ----------------------------------------------------------------

/** Remove surrounding brackets from an IPv6 literal ("[::1]" -> "::1"). */
export function stripBrackets(host: string): string {
  let h = host.trim();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  return h;
}

function parseIpv4(str: string): readonly number[] | null {
  const parts = str.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    out.push(v);
  }
  return out;
}

function ipv4ToInt(o: readonly number[]): number {
  const a = o[0] ?? 0;
  const b = o[1] ?? 0;
  const c = o[2] ?? 0;
  const d = o[3] ?? 0;
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function inCidr(n: number, base: readonly number[], prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const left = (n & mask) >>> 0;
  const right = (baseInt & mask) >>> 0;
  return left === right;
}

function classifyIpv4(o: readonly number[]): IpClass {
  const n = ipv4ToInt(o);
  const blocked: Array<[readonly number[], number]> = [
    [[0, 0, 0, 0], 8], // "this" network / 0.0.0.0/8
    [[10, 0, 0, 0], 8], // private
    [[100, 64, 0, 0], 10], // CGNAT
    [[127, 0, 0, 0], 8], // loopback
    [[169, 254, 0, 0], 16], // link-local incl. 169.254.169.254 metadata
    [[172, 16, 0, 0], 12], // private
    [[192, 0, 0, 0], 24], // IETF protocol assignments
    [[192, 0, 2, 0], 24], // TEST-NET-1
    [[192, 88, 99, 0], 24], // 6to4 relay anycast
    [[192, 168, 0, 0], 16], // private
    [[198, 18, 0, 0], 15], // benchmarking
    [[198, 51, 100, 0], 24], // TEST-NET-2
    [[203, 0, 113, 0], 24], // TEST-NET-3
    [[224, 0, 0, 0], 4], // multicast
    [[240, 0, 0, 0], 4], // reserved incl. 255.255.255.255
  ];
  for (const [base, prefix] of blocked) {
    if (inCidr(n, base, prefix)) return "private";
  }
  return "public";
}

/** Parse an IPv6 literal (with optional zone id / embedded IPv4) to 16 bytes. */
function parseIpv6(input: string): readonly number[] | null {
  let s = input.trim();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (s === "") return null;
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return null;

  // Fold an embedded IPv4 suffix (e.g. ::ffff:127.0.0.1) into two hex groups.
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx < 0) return null;
    const v4 = parseIpv4(s.slice(idx + 1));
    if (!v4) return null;
    const g1 = (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16);
    const g2 = (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16);
    s = s.slice(0, idx + 1) + g1 + ":" + g2;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (str: string): number[] | null => {
    if (str === "") return [];
    const groups = str.split(":");
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parseGroups(halves[0] ?? "");
  if (!head) return null;

  let groups: number[];
  if (halves.length === 2) {
    const tail = parseGroups(halves[1] ?? "");
    if (!tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return bytes;
}

function classifyIpv6(bytes: readonly number[]): IpClass {
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const allZero = bytes.every((x) => x === 0);
  if (allZero) return "private"; // :: unspecified
  const firstFifteenZero = bytes.slice(0, 15).every((x) => x === 0);
  if (firstFifteenZero && (bytes[15] ?? 0) === 1) return "private"; // ::1 loopback
  if (b0 === 0xff) return "private"; // ff00::/8 multicast
  if ((b0 & 0xfe) === 0xfc) return "private"; // fc00::/7 unique-local
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return "private"; // fe80::/10 link-local
  if (b0 === 0xfe && (b1 & 0xc0) === 0xc0) return "private"; // fec0::/10 site-local (deprecated)
  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 -> classify the v4 tail.
  const first10Zero = bytes.slice(0, 10).every((x) => x === 0);
  if (first10Zero && (bytes[10] ?? 0) === 0xff && (bytes[11] ?? 0) === 0xff) {
    return classifyIpv4(bytes.slice(12, 16));
  }
  const first12Zero = bytes.slice(0, 12).every((x) => x === 0);
  if (first12Zero) return classifyIpv4(bytes.slice(12, 16));
  return "public";
}

/** Classify a bare IP string as private / public / invalid. Fail-closed. */
export function classifyIp(ip: string): IpClass {
  const s = stripBrackets(ip.trim());
  if (s === "") return "invalid";
  if (s.includes(":")) {
    const bytes = parseIpv6(s);
    return bytes ? classifyIpv6(bytes) : "invalid";
  }
  const v4 = parseIpv4(s);
  return v4 ? classifyIpv4(v4) : "invalid";
}

/** True when a resolved IP must be blocked (private, or unparseable). */
export function isBlockedResolvedIp(ip: string): boolean {
  return classifyIp(ip) !== "public";
}

/** True when the URL hostname is an IP literal (IPv4 dotted-quad or bracketed IPv6). */
export function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith("[")) return true;
  return parseIpv4(hostname) !== null;
}

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "") return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  return false;
}

/**
 * Structural SSRF check on a URL. Rejects non-http(s) protocols, embedded
 * credentials, localhost, and IP literals in blocked ranges. DNS-name hosts
 * pass here and MUST be re-validated after resolution (see the crawler).
 */
export function assertUrlAllowed(rawUrl: string | URL): SsrfCheckResult {
  let url: URL;
  try {
    url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;
  } catch {
    return { ok: false, reason: "INVALID_URL", detail: String(rawUrl) };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "NON_HTTP_PROTOCOL", detail: url.protocol };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "CREDENTIALS_IN_URL", detail: "userinfo present in URL" };
  }

  const host = stripBrackets(url.hostname);
  if (isBlockedHostname(host)) {
    return { ok: false, reason: "PRIVATE_HOST", detail: host || "(empty host)" };
  }
  if (isIpLiteral(url.hostname)) {
    const cls = classifyIp(host);
    if (cls !== "public") {
      return { ok: false, reason: "PRIVATE_HOST", detail: `${host} (${cls})` };
    }
  }

  return { ok: true, url };
}
