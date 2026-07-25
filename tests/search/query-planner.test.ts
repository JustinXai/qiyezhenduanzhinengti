import { describe, expect, it } from "vitest";
import {
  buildCompetitorDomainQueries,
  planCompetitorDomainResolutionQueries,
  planSearchQueries,
  type CompanyProfileInput,
} from "../../src/diagnosis/search/query-planner";
import type { CompetitorResolution } from "../../src/diagnosis/competitors/types";
import { SAMPLE_DIAGNOSIS_REPORT } from "../../src/fixtures/sample-report";

function resolution(overrides: Partial<CompetitorResolution> = {}): CompetitorResolution {
  return {
    name: "竞品甲自动化",
    providedDomain: null,
    resolvedDomain: "jia-auto.example.com",
    status: "RESOLVED",
    confidence: 0.8,
    evidenceIds: [],
    resolutionReason: "test",
    candidateDomains: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<CompanyProfileInput> = {}): CompanyProfileInput {
  return {
    brandName: "示例智能装备",
    website: "https://example-equip.com",
    industry: "工业自动化设备",
    productOrService: "柔性装配线",
    targetRegion: "华东地区",
    competitors: ["竞品甲自动化", "竞品乙智造"],
    unresolvedQuestions: ["官网未明确说明典型交付周期"],
    ...overrides,
  };
}

describe("planSearchQueries", () => {
  it("is deterministic — identical input yields byte-identical output", () => {
    const profile = makeProfile();
    const a = planSearchQueries(profile);
    const b = planSearchQueries(profile);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces brand, reputation, purchase and competitor intent categories from a full profile", () => {
    const queries = planSearchQueries(makeProfile());
    const categories = new Set(queries.map((q) => q.category));
    expect(categories.has("BRAND_DIRECT")).toBe(true);
    expect(categories.has("REPUTATION_REVIEW")).toBe(true);
    expect(categories.has("PURCHASE_DECISION")).toBe(true);
    expect(categories.has("COMPETITOR_COMPARISON")).toBe(true);
  });

  it("puts sales-readiness queries before reputation and competitor queries", () => {
    const queries = planSearchQueries(makeProfile());
    const firstReputation = queries.findIndex((q) => q.category === "REPUTATION_REVIEW");
    const firstPurchase = queries.findIndex((q) => q.category === "PURCHASE_DECISION");
    const firstCompetitor = queries.findIndex((q) => q.category === "COMPETITOR_COMPARISON");
    expect(firstReputation).toBeGreaterThan(-1);
    expect(firstPurchase).toBeGreaterThan(-1);
    expect(firstPurchase).toBeLessThan(firstReputation);
    expect(firstCompetitor).toBeGreaterThan(firstPurchase);
  });

  it("includes a bare brand query and a competitor comparison for each competitor", () => {
    const queries = planSearchQueries(makeProfile());
    const strings = queries.map((q) => q.query);
    expect(strings).toContain("示例智能装备");
    expect(strings).toContain("示例智能装备 和 竞品甲自动化 对比");
    expect(strings).toContain("示例智能装备 和 竞品乙智造 对比");
  });

  it("threads unresolved questions into purchase-decision queries", () => {
    const queries = planSearchQueries(makeProfile());
    const purchase = queries.filter((q) => q.category === "PURCHASE_DECISION").map((q) => q.query);
    expect(purchase).toContain("官网未明确说明典型交付周期");
    expect(purchase).toContain("示例智能装备 适合谁 不适合谁");
    expect(purchase).toContain("示例智能装备 团队 资质");
    expect(purchase).toContain("示例智能装备 交付流程 交付物");
  });

  it("handles an empty competitor list without producing competitor queries", () => {
    const queries = planSearchQueries(makeProfile({ competitors: [] }));
    expect(queries.some((q) => q.category === "COMPETITOR_COMPARISON")).toBe(false);
    // Brand + purchase queries still present.
    expect(queries.some((q) => q.category === "BRAND_DIRECT")).toBe(true);
  });

  it("handles empty unresolved questions and blank fields gracefully", () => {
    const queries = planSearchQueries(
      makeProfile({ unresolvedQuestions: [], productOrService: "  ", competitors: ["  "] }),
    );
    // No blank/whitespace-only queries ever emitted.
    expect(queries.every((q) => q.query.trim().length > 0)).toBe(true);
    // Blank competitor is skipped.
    expect(queries.some((q) => q.category === "COMPETITOR_COMPARISON")).toBe(false);
  });

  it("de-duplicates repeated competitor entries", () => {
    const queries = planSearchQueries(
      makeProfile({ competitors: ["竞品甲自动化", "竞品甲自动化"] }),
    );
    const compQueries = queries
      .filter((q) => q.category === "COMPETITOR_COMPARISON")
      .map((q) => q.query);
    const unique = new Set(compQueries);
    expect(compQueries.length).toBe(unique.size);
  });

  it("respects a deterministic maxTotal cap applied after ordering", () => {
    const full = planSearchQueries(makeProfile());
    const capped = planSearchQueries(makeProfile(), { maxTotal: 3 });
    expect(capped).toHaveLength(3);
    expect(capped).toEqual(full.slice(0, 3));
  });

  it("returns an empty list for a blank brand and empty everything", () => {
    const queries = planSearchQueries(
      makeProfile({
        brandName: "  ",
        industry: "",
        productOrService: "",
        targetRegion: "",
        competitors: [],
        unresolvedQuestions: [],
      }),
    );
    expect(queries).toEqual([]);
  });

  it("plans against the shared canonical sample profile without throwing", () => {
    const queries = planSearchQueries(SAMPLE_DIAGNOSIS_REPORT.companyProfile);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => typeof q.query === "string" && q.query.length > 0)).toBe(true);
  });

  it("default output is unchanged when no resolutions are supplied (backward compatible)", () => {
    const withOpt = planSearchQueries(makeProfile(), { competitorResolutions: [] });
    const without = planSearchQueries(makeProfile());
    expect(withOpt).toEqual(without);
    // Never emits COMPETITOR_DOMAIN_RESOLUTION in the default plan.
    expect(without.some((q) => q.category === "COMPETITOR_DOMAIN_RESOLUTION")).toBe(false);
  });

  it("adds a domain-scoped query for a CONFIRMED competitor", () => {
    const queries = planSearchQueries(makeProfile(), {
      competitorResolutions: [resolution({ name: "竞品甲自动化", resolvedDomain: "jia-auto.example.com" })],
    });
    const strings = queries.map((q) => q.query);
    expect(strings).toContain("site:jia-auto.example.com");
    // Name-based comparison queries are still present.
    expect(strings).toContain("示例智能装备 和 竞品甲自动化 对比");
  });

  it("does not add a domain-scoped query for an UNCONFIRMED competitor", () => {
    const queries = planSearchQueries(makeProfile({ competitors: ["竞品甲自动化"] }), {
      competitorResolutions: [
        resolution({ name: "竞品甲自动化", status: "NOT_FOUND", resolvedDomain: null }),
      ],
    });
    expect(queries.some((q) => q.query.startsWith("site:"))).toBe(false);
  });
});

describe("buildCompetitorDomainQueries", () => {
  it("phrases official-domain queries without concatenating a domain", () => {
    const qs = buildCompetitorDomainQueries("大疆 DJI");
    expect(qs).toEqual(["大疆 DJI 官网", "大疆 DJI 官方网站", "大疆 DJI official site"]);
    // Crucially never fabricates a host like "大疆dji.com".
    expect(qs.some((q) => q.includes(".com"))).toBe(false);
  });

  it("returns nothing for a blank name", () => {
    expect(buildCompetitorDomainQueries("  ")).toEqual([]);
  });
});

describe("planCompetitorDomainResolutionQueries", () => {
  it("tags queries as COMPETITOR_DOMAIN_RESOLUTION and de-duplicates across names", () => {
    const planned = planCompetitorDomainResolutionQueries(["GoPro", "GoPro", "  "]);
    expect(planned.every((q) => q.category === "COMPETITOR_DOMAIN_RESOLUTION")).toBe(true);
    expect(planned).toHaveLength(3); // one GoPro, blank skipped, dedup applied
  });
});
