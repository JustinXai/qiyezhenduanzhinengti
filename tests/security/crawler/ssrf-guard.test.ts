import { describe, expect, it } from "vitest";
import {
  assertUrlAllowed,
  classifyIp,
  isBlockedResolvedIp,
  isIpLiteral,
  stripBrackets,
} from "../../../src/security/crawler/ssrf-guard";

describe("classifyIp", () => {
  const privateIps = [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1", // CGNAT
    "127.0.0.1",
    "127.1.2.3",
    "169.254.0.1",
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.1",
    "198.18.0.1", // benchmarking
    "224.0.0.1", // multicast
    "255.255.255.255",
    "::1", // IPv6 loopback
    "::", // IPv6 unspecified
    "fc00::1", // ULA
    "fd12:3456:789a::1", // ULA
    "fe80::1", // link-local
    "fec0::1", // site-local (deprecated)
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1", // IPv4-mapped private
  ];
  for (const ip of privateIps) {
    it(`classifies ${ip} as private`, () => {
      expect(classifyIp(ip)).toBe("private");
    });
  }

  const publicIps = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "172.15.0.1", "172.32.0.1"];
  for (const ip of publicIps) {
    it(`classifies ${ip} as public`, () => {
      expect(classifyIp(ip)).toBe("public");
    });
  }

  it("returns invalid for non-IP strings", () => {
    expect(classifyIp("example.com")).toBe("invalid");
    expect(classifyIp("999.999.999.999")).toBe("invalid");
    expect(classifyIp("")).toBe("invalid");
  });

  it("isBlockedResolvedIp treats private and invalid as blocked, public as allowed", () => {
    expect(isBlockedResolvedIp("10.0.0.1")).toBe(true);
    expect(isBlockedResolvedIp("garbage")).toBe(true);
    expect(isBlockedResolvedIp("8.8.8.8")).toBe(false);
  });
});

describe("stripBrackets / isIpLiteral", () => {
  it("strips IPv6 brackets", () => {
    expect(stripBrackets("[::1]")).toBe("::1");
    expect(stripBrackets("example.com")).toBe("example.com");
  });
  it("detects IP literals vs DNS names", () => {
    expect(isIpLiteral("127.0.0.1")).toBe(true);
    expect(isIpLiteral("[::1]")).toBe(true);
    expect(isIpLiteral("example.com")).toBe(false);
  });
});

describe("assertUrlAllowed", () => {
  it("allows a normal public https URL (DNS name deferred to resolution)", () => {
    const r = assertUrlAllowed("https://example.com/path?q=1");
    expect(r.ok).toBe(true);
  });

  it("rejects non-http(s) protocols", () => {
    for (const url of ["ftp://example.com/", "file:///etc/passwd", "gopher://x/", "data:text/plain,hi"]) {
      const r = assertUrlAllowed(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("NON_HTTP_PROTOCOL");
    }
  });

  it("rejects URLs carrying credentials", () => {
    const r = assertUrlAllowed("https://user:pass@example.com/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("CREDENTIALS_IN_URL");
  });

  it("rejects localhost and *.localhost", () => {
    for (const url of ["http://localhost/", "http://LOCALHOST:8080/", "http://api.localhost/"]) {
      const r = assertUrlAllowed(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("PRIVATE_HOST");
    }
  });

  it("rejects private / loopback / link-local IPv4 literals", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "http://0.0.0.0/",
    ]) {
      const r = assertUrlAllowed(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("PRIVATE_HOST");
    }
  });

  it("rejects private IPv6 literals", () => {
    for (const url of ["http://[::1]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[::ffff:127.0.0.1]/"]) {
      const r = assertUrlAllowed(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("PRIVATE_HOST");
    }
  });

  it("rejects decimal/hex IPv4 forms that normalize to loopback", () => {
    // WHATWG URL normalizes these to 127.0.0.1 before we classify.
    for (const url of ["http://2130706433/", "http://0x7f000001/", "http://127.1/"]) {
      const r = assertUrlAllowed(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("PRIVATE_HOST");
    }
  });

  it("rejects an unparseable URL", () => {
    const r = assertUrlAllowed("http://");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_URL");
  });
});
