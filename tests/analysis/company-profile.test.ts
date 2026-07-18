import { describe, expect, it } from "vitest";
import { extractCompanyProfile } from "../../src/diagnosis/analysis";
import profileFixture from "../providers/fixtures/company-profile.json";

describe("extractCompanyProfile", () => {
  it("stamps the authoritative website and merges the model's qualitative fields", () => {
    const res = extractCompanyProfile({ website: "https://example-equip.com" }, profileFixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.website).toBe("https://example-equip.com");
    expect(res.value.brandName).toBe("示例智能装备");
    expect(res.value.industry).toBe("工业自动化设备");
    expect(res.value.competitors).toEqual(["竞品甲自动化", "竞品乙智造"]);
    expect(res.value.unresolvedQuestions).toHaveLength(2);
  });

  it("prefers a user-supplied brand name over the model guess", () => {
    const res = extractCompanyProfile(
      { website: "https://example-equip.com", providedBrandName: "客户指定名" },
      profileFixture,
    );
    expect(res.ok && res.value.brandName).toBe("客户指定名");
  });

  it("merges + dedupes user-supplied competitors ahead of the model's", () => {
    const res = extractCompanyProfile(
      { website: "https://example-equip.com", providedCompetitors: ["竞品甲自动化", "竞品丙"] },
      profileFixture,
    );
    expect(res.ok && res.value.competitors).toEqual(["竞品甲自动化", "竞品丙", "竞品乙智造"]);
  });

  it("reports PROVIDER_SCHEMA_MISMATCH for a malformed payload", () => {
    const res = extractCompanyProfile({ website: "https://x.com" }, { brandName: 123 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
  });
});
