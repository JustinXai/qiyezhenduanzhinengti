import { describe, expect, it } from "vitest";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  countIndependentEvidenceDomains,
  evidenceRootDomain,
} from "../../src/report/validation/evidence-independence";

describe("Evidence independence by normalized root domain", () => {
  it("collapses different subdomains of the same registrable root", () => {
    const template = buildSampleReport().evidence[0]!;
    const evidence = [
      { ...template, id: "a", sourceDomain: "www.insta360.com", normalizedDomain: "insta360.com" },
      { ...template, id: "b", sourceDomain: "store.insta360.com", normalizedDomain: "store.insta360.com" },
    ];
    expect(countIndependentEvidenceDomains(["a", "b"], evidence)).toBe(1);
  });

  it("retains multi-label public suffix roots", () => {
    const item = {
      ...buildSampleReport().evidence[0]!,
      sourceDomain: "news.example.com.cn",
      normalizedDomain: "news.example.com.cn",
    };
    expect(evidenceRootDomain(item)).toBe("example.com.cn");
  });

  it("counts distinct normalized roots and ignores missing Evidence ids", () => {
    const template = buildSampleReport().evidence[0]!;
    const evidence = [
      { ...template, id: "a", sourceDomain: "a.example.com", normalizedDomain: "a.example.com" },
      { ...template, id: "b", sourceDomain: "source.example.net", normalizedDomain: "source.example.net" },
    ];
    expect(countIndependentEvidenceDomains(["a", "b", "missing"], evidence)).toBe(2);
  });
});
