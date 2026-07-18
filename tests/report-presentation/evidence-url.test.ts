import { describe, expect, it } from "vitest";
import { sanitizeEvidenceUrl } from "../../src/report/presentation/evidence-url";

describe("sanitizeEvidenceUrl (docs/PRODUCT_TRUTH_RULES.md §6)", () => {
  it("strips embedded username and password credentials", () => {
    const out = sanitizeEvidenceUrl("https://user:secret@example.com/page");
    expect(out).not.toContain("user");
    expect(out).not.toContain("secret");
    expect(out).toBe("https://example.com/page");
  });

  it("strips the URL fragment", () => {
    expect(sanitizeEvidenceUrl("https://example.com/a#token=abc")).toBe(
      "https://example.com/a",
    );
  });

  it("removes token / signature / access_key / auth query parameters", () => {
    const out = sanitizeEvidenceUrl(
      "https://example.com/a?token=abc&signature=xyz&access_key=k&auth=z&keep=1",
    );
    expect(out).toContain("keep=1");
    expect(out).not.toMatch(/token|signature|access_key|auth/i);
  });

  it("removes credential-bearing params case-insensitively", () => {
    const out = sanitizeEvidenceUrl(
      "https://example.com/a?ApiKey=1&X-Auth-Token=2&Password=3&normal=ok",
    );
    expect(out).toContain("normal=ok");
    expect(out.toLowerCase()).not.toMatch(/apikey|auth|password/);
  });

  it("preserves clean URLs unchanged", () => {
    expect(sanitizeEvidenceUrl("https://example.com/products?id=42")).toBe(
      "https://example.com/products?id=42",
    );
  });

  it("returns non-URL input unchanged (defensive fallback)", () => {
    expect(sanitizeEvidenceUrl("not a url")).toBe("not a url");
  });
});
