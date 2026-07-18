import { describe, expect, it } from "vitest";
import {
  normalizeEvidence,
  type EvidenceNormalizationContext,
} from "../../src/diagnosis/evidence/normalize";
import { EvidenceItem } from "../../src/contracts";
import type { WebSearchResultItem } from "../../src/providers/types";

const FETCHED_AT = "2026-07-18T00:00:00.000Z";

function result(overrides: Partial<WebSearchResultItem> = {}): WebSearchResultItem {
  return {
    title: "Some page",
    url: "https://industry-news.example.net/articles/x",
    snippet: "A snippet.",
    sourceDomain: "industry-news.example.net",
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

const ctx: EvidenceNormalizationContext = {
  companyDomains: ["example-equip.com"],
  competitorDomains: ["competitor-jia.example.net"],
};

describe("normalizeEvidence", () => {
  it("classifies the company's own domain (and subdomains) as FIRST_PARTY", () => {
    const [home, blog] = normalizeEvidence(
      [
        result({ url: "https://example-equip.com/", sourceDomain: "example-equip.com" }),
        result({ url: "https://www.example-equip.com/about" }),
        result({ url: "https://news.example-equip.com/post-1" }),
      ],
      ctx,
    );
    expect(home?.sourceType).toBe("FIRST_PARTY_EVIDENCE");
    expect(home?.authorityLevel).toBe("OWNED");
    expect(blog?.sourceType).toBe("FIRST_PARTY_EVIDENCE"); // www. is stripped
  });

  it("classifies a known competitor domain as COMPETITOR", () => {
    const [item] = normalizeEvidence(
      [result({ url: "https://competitor-jia.example.net/", sourceDomain: "competitor-jia.example.net" })],
      ctx,
    );
    expect(item?.sourceType).toBe("COMPETITOR_WEB_EVIDENCE");
    expect(item?.authorityLevel).toBe("OWNED");
  });

  it("classifies everything else as OBSERVED with MEDIA authority", () => {
    const [item] = normalizeEvidence([result()], ctx);
    expect(item?.sourceType).toBe("OBSERVED_WEB_EVIDENCE");
    expect(item?.authorityLevel).toBe("MEDIA");
  });

  it("does NOT infer competitor from a name in the snippet (no domain match)", () => {
    const [item] = normalizeEvidence(
      [
        result({
          url: "https://random-blog.example.org/post",
          sourceDomain: "random-blog.example.org",
          snippet: "本文提到了 竞品甲自动化 的产品线。",
        }),
      ],
      { companyDomains: ["example-equip.com"], competitorDomains: ["competitor-jia.example.net"] },
    );
    expect(item?.sourceType).toBe("OBSERVED_WEB_EVIDENCE");
  });

  it("falls through competitor sites to OBSERVED when no competitor domains provided", () => {
    const [item] = normalizeEvidence(
      [result({ url: "https://competitor-jia.example.net/" })],
      { companyDomains: ["example-equip.com"] },
    );
    expect(item?.sourceType).toBe("OBSERVED_WEB_EVIDENCE");
  });

  it("defaults supportLevel to CONTEXT_ONLY for every item", () => {
    const out = normalizeEvidence(
      [
        result({ url: "https://example-equip.com/" }),
        result({ url: "https://competitor-jia.example.net/" }),
        result(),
      ],
      ctx,
    );
    expect(out.every((e) => e.supportLevel === "CONTEXT_ONLY")).toBe(true);
  });

  it("de-duplicates by canonical URL, keeping the first occurrence", () => {
    const out = normalizeEvidence(
      [
        result({ url: "https://example-equip.com/products", title: "First" }),
        result({ url: "https://example-equip.com/products#section", title: "Dup via fragment" }),
        result({ url: "https://example-equip.com/products", title: "Exact dup" }),
      ],
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("First");
  });

  it("passes fetchedAt through verbatim", () => {
    const stamp = "2025-01-02T03:04:05.678Z";
    const [item] = normalizeEvidence([result({ fetchedAt: stamp })], ctx);
    expect(item?.fetchedAt).toBe(stamp);
  });

  it("drops results with invalid or non-http(s) URLs", () => {
    const out = normalizeEvidence(
      [
        result({ url: "not a url" }),
        result({ url: "ftp://example-equip.com/file" }),
        result({ url: "file:///etc/passwd" }),
        result({ url: "https://example-equip.com/ok" }),
      ],
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe("https://example-equip.com/ok");
  });

  it("produces a stable id derived from the canonical URL", () => {
    const a = normalizeEvidence([result({ url: "https://example-equip.com/products" })], ctx);
    const b = normalizeEvidence([result({ url: "https://example-equip.com/products#x" })], ctx);
    expect(a[0]?.id).toBe(b[0]?.id); // fragment ignored -> same canonical URL -> same id
    expect(a[0]?.id).toMatch(/^ev_[0-9a-f]{8}$/);
  });

  it("is deterministic — same input yields identical output", () => {
    const input = [
      result({ url: "https://example-equip.com/" }),
      result({ url: "https://competitor-jia.example.net/" }),
      result(),
    ];
    expect(normalizeEvidence(input, ctx)).toEqual(normalizeEvidence(input, ctx));
  });

  it("emits EvidenceItems that validate against the canonical schema", () => {
    const out = normalizeEvidence(
      [
        result({ url: "https://example-equip.com/" }),
        result({ url: "https://competitor-jia.example.net/" }),
        result(),
      ],
      ctx,
    );
    for (const item of out) {
      expect(() => EvidenceItem.parse(item)).not.toThrow();
    }
  });
});
