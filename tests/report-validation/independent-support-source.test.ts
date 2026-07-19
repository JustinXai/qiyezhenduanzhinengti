import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/contracts";
import type { ClaimPublicationSourceContext } from "../../src/contracts/independent-support-source";
import { buildSampleReport } from "../../src/fixtures/sample-report";
import {
  countIndependentSupportSources,
  independentSupportSourceKeys,
  registrableDomain,
  resolveIndependentSupportSourceKey,
} from "../../src/report/validation/independent-support-source";

const template = buildSampleReport().evidence[0]!;

function evidence(
  id: string,
  sourceType: EvidenceItem["sourceType"],
  domain: string,
  url = `https://${domain}/page`,
): EvidenceItem {
  return { ...template, id, sourceType, sourceDomain: domain, normalizedDomain: domain, url };
}

function context(
  overrides: Partial<ClaimPublicationSourceContext> = {},
): ClaimPublicationSourceContext {
  return {
    companyId: "company_1",
    firstPartyDomains: ["example.com", "example.cn", "shop.market.example"],
    competitorEntities: [],
    ...overrides,
  };
}

describe("IndependentSupportSourceKey", () => {
  it("collapses a first-party root and support subdomain to the current company entity", () => {
    const items = [
      evidence("a", "FIRST_PARTY_EVIDENCE", "example.com"),
      evidence("b", "FIRST_PARTY_EVIDENCE", "support.example.com"),
    ];
    expect(independentSupportSourceKeys(["a", "b"], items, context())).toEqual([
      "ENTITY:CURRENT_COMPANY:company_1",
    ]);
  });

  it("collapses confirmed .com and .cn first-party domains", () => {
    const items = [
      evidence("a", "FIRST_PARTY_EVIDENCE", "example.com"),
      evidence("b", "FIRST_PARTY_EVIDENCE", "example.cn"),
    ];
    expect(countIndependentSupportSources(["a", "b"], items, context())).toBe(1);
  });

  it("collapses a confirmed official marketplace host into the company entity", () => {
    expect(
      resolveIndependentSupportSourceKey(
        evidence("shop", "FIRST_PARTY_EVIDENCE", "shop.market.example"),
        context(),
      ),
    ).toBe("ENTITY:CURRENT_COMPANY:company_1");
  });

  it("default-denies a first-party label outside the confirmed domain set", () => {
    expect(
      resolveIndependentSupportSourceKey(
        evidence("bad", "FIRST_PARTY_EVIDENCE", "unconfirmed.example.net"),
        context(),
      ),
    ).toBeNull();
  });

  it("collapses competitor root and subdomain through one resolved entity id", () => {
    const ctx = context({
      competitorEntities: [
        { competitorEntityId: "competitor_1", domains: ["competitor.com", "competitor.cn"] },
      ],
    });
    const items = [
      evidence("a", "COMPETITOR_WEB_EVIDENCE", "competitor.com"),
      evidence("b", "COMPETITOR_WEB_EVIDENCE", "support.competitor.com"),
      evidence("c", "COMPETITOR_WEB_EVIDENCE", "competitor.cn"),
    ];
    expect(independentSupportSourceKeys(["a", "b", "c"], items, ctx)).toEqual([
      "ENTITY:COMPETITOR:competitor_1",
    ]);
  });

  it("counts two resolved competitor entities separately", () => {
    const ctx = context({
      competitorEntities: [
        { competitorEntityId: "competitor_1", domains: ["one.example"] },
        { competitorEntityId: "competitor_2", domains: ["two.example"] },
      ],
    });
    const items = [
      evidence("a", "COMPETITOR_WEB_EVIDENCE", "one.example"),
      evidence("b", "COMPETITOR_WEB_EVIDENCE", "two.example"),
    ];
    expect(countIndependentSupportSources(["a", "b"], items, ctx)).toBe(2);
  });

  it("default-denies a competitor source without resolved entity provenance", () => {
    expect(
      resolveIndependentSupportSourceKey(
        evidence("a", "COMPETITOR_WEB_EVIDENCE", "unknown.example"),
        context(),
      ),
    ).toBeNull();
  });

  it("uses exact Evidence binding before domain matching for a competitor", () => {
    const ctx = context({
      competitorEntities: [
        { competitorEntityId: "competitor_1", domains: [], evidenceIds: ["bound"] },
      ],
    });
    expect(
      resolveIndependentSupportSourceKey(
        evidence("bound", "COMPETITOR_WEB_EVIDENCE", "search-cache.example"),
        ctx,
      ),
    ).toBe("ENTITY:COMPETITOR:competitor_1");
  });

  it("collapses observed subdomains by registrable domain", () => {
    const items = [
      evidence("a", "OBSERVED_WEB_EVIDENCE", "news.media.example.com"),
      evidence("b", "OBSERVED_WEB_EVIDENCE", "reviews.example.com"),
    ];
    expect(independentSupportSourceKeys(["a", "b"], items, context())).toEqual([
      "DOMAIN:example.com",
    ]);
  });

  it("counts two different observed registrable domains", () => {
    const items = [
      evidence("a", "OBSERVED_WEB_EVIDENCE", "news.example.com"),
      evidence("b", "OBSERVED_WEB_EVIDENCE", "source.example.net"),
    ];
    expect(countIndependentSupportSources(["a", "b"], items, context())).toBe(2);
  });

  it("preserves common multi-label public suffixes", () => {
    expect(registrableDomain("news.example.com.cn")).toBe("example.com.cn");
    expect(registrableDomain("sub.example.co.uk")).toBe("example.co.uk");
  });

  it("falls back to the URL host when a display sourceDomain is not a host", () => {
    const item = evidence("jd", "OBSERVED_WEB_EVIDENCE", "京东", "https://mall.jd.com/shop");
    expect(resolveIndependentSupportSourceKey(item, context())).toBe("DOMAIN:jd.com");
  });

  it("ignores unknown Evidence ids without inventing a key", () => {
    const items = [evidence("a", "OBSERVED_WEB_EVIDENCE", "one.example")];
    expect(independentSupportSourceKeys(["missing"], items, context())).toEqual([]);
  });
});
