import { describe, expect, it } from "vitest";
import { resolveCompetitors } from "../../../src/diagnosis/competitors/resolve";
import { createMockCompetitorSearch } from "../../../src/diagnosis/competitors/mock-search";
import type { WebSearchProvider } from "../../../src/providers/types";
import type { CompetitorInput } from "../../../src/runtime/diagnosis-input";
import {
  AMBIGUOUS_NAME,
  FULL_COMPETITOR_BATCH,
  INVALID_DOMAIN_INPUT,
  NOT_FOUND_NAME,
  PRIVATE_URL,
  RESOLVABLE_NAMES,
  USER_CONFIRMED_INPUT,
  USER_CONFIRMED_WEBSITE,
} from "../../fixtures/competitor-inputs";

const deps = () => ({ search: createMockCompetitorSearch() });

async function resolveOne(input: CompetitorInput) {
  const res = await resolveCompetitors([input], deps());
  return res.resolutions[0]!;
}

describe("resolveCompetitors", () => {
  it("USER_CONFIRMED: user website that passes the URL/SSRF guard is trusted", async () => {
    const r = await resolveOne(USER_CONFIRMED_INPUT);
    expect(r.status).toBe("USER_CONFIRMED");
    expect(r.resolvedDomain).toBe("competitor-demo.example.net");
    expect(r.providedDomain).toBe("competitor-demo.example.net");
    expect(r.confidence).toBe(1);
    // No search performed for a user-confirmed website.
    expect(r.evidenceIds).toEqual([]);
  });

  it("INVALID_DOMAIN: user-supplied private/loopback URL is rejected, not trusted", async () => {
    const r = await resolveOne(INVALID_DOMAIN_INPUT);
    expect(r.status).toBe("INVALID_DOMAIN");
    expect(r.resolvedDomain).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.resolutionReason).toContain("PRIVATE_HOST");
  });

  it.each([
    ["GoPro", "gopro.com"],
    ["大疆 DJI", "dji.com"],
    ["Moka", "mokahr.com"],
    ["SAP SuccessFactors", "sap.com"],
  ])("RESOLVED: %s → %s via search evidence (no string concatenation)", async (name, domain) => {
    const r = await resolveOne(name);
    expect(r.status).toBe("RESOLVED");
    expect(r.resolvedDomain).toBe(domain);
    expect(r.confidence).toBeGreaterThan(0.6);
    expect(r.evidenceIds.length).toBeGreaterThan(0);
    expect(r.candidateDomains).toEqual([]);
  });

  it("AMBIGUOUS: same-name firms yield multiple candidates and no resolved domain", async () => {
    const r = await resolveOne(AMBIGUOUS_NAME);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.resolvedDomain).toBeNull();
    expect(r.candidateDomains.length).toBeGreaterThanOrEqual(2);
    expect(r.candidateDomains).toContain("xingchen-sh.example.com");
    expect(r.candidateDomains).toContain("xingchen-bj.example.net");
  });

  it("NOT_FOUND: no official-marked result yields NOT_FOUND, never a guessed domain", async () => {
    const r = await resolveOne(NOT_FOUND_NAME);
    expect(r.status).toBe("NOT_FOUND");
    expect(r.resolvedDomain).toBeNull();
    expect(r.candidateDomains).toEqual([]);
  });

  it("never fabricates <name>.com when the search knows nothing about the entity", async () => {
    const empty: WebSearchProvider = { async search() { return { ok: true, results: [] }; } };
    const r = (await resolveCompetitors(["某完全未知品牌"], { search: empty })).resolutions[0]!;
    expect(r.status).toBe("NOT_FOUND");
    expect(r.resolvedDomain).toBeNull();
  });

  it("processes EVERY input with a status — nothing is silently dropped", async () => {
    const res = await resolveCompetitors(FULL_COMPETITOR_BATCH, deps());
    // De-duplicated by name; the batch has no duplicate names, so 1:1.
    expect(res.resolutions).toHaveLength(FULL_COMPETITOR_BATCH.length);
    const statuses = res.resolutions.map((r) => r.status);
    expect(statuses).toEqual([
      "RESOLVED", // GoPro
      "RESOLVED", // 大疆 DJI
      "RESOLVED", // Moka
      "RESOLVED", // SAP SuccessFactors
      "AMBIGUOUS", // 星辰科技
      "NOT_FOUND", // 云雀未知企业
      "USER_CONFIRMED", // 示例竞品 (website)
      "INVALID_DOMAIN", // 内网竞品 (private URL)
    ]);
  });

  it("preserves input order and de-duplicates by name (first wins, adopts a website)", async () => {
    const res = await resolveCompetitors(
      ["GoPro", "GoPro", { name: "GoPro", website: USER_CONFIRMED_WEBSITE }],
      deps(),
    );
    expect(res.resolutions).toHaveLength(1);
    // First occurrence was name-only; it adopts the later duplicate's website,
    // so the merged input is user-confirmed.
    expect(res.resolutions[0]!.status).toBe("USER_CONFIRMED");
  });

  it("aggregates only CONFIRMED hosts into resolvedDomains", async () => {
    const res = await resolveCompetitors(
      [...RESOLVABLE_NAMES, AMBIGUOUS_NAME, NOT_FOUND_NAME, USER_CONFIRMED_INPUT],
      deps(),
    );
    expect(res.resolvedDomains).toEqual([
      "gopro.com",
      "dji.com",
      "mokahr.com",
      "sap.com",
      "competitor-demo.example.net",
    ]);
  });

  it("keeps resolution evidence with referential integrity (evidenceIds ⊆ evidence)", async () => {
    const res = await resolveCompetitors(RESOLVABLE_NAMES, deps());
    const ids = new Set(res.evidence.map((e) => e.id));
    for (const r of res.resolutions) {
      for (const id of r.evidenceIds) expect(ids.has(id)).toBe(true);
    }
    // Resolved competitor pages are classified as competitor evidence.
    expect(res.evidence.some((e) => e.sourceType === "COMPETITOR_WEB_EVIDENCE")).toBe(true);
  });

  it("is deterministic — identical input yields identical resolutions", async () => {
    const a = await resolveCompetitors(FULL_COMPETITOR_BATCH, deps());
    const b = await resolveCompetitors(FULL_COMPETITOR_BATCH, deps());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles an empty / undefined competitor list", async () => {
    expect((await resolveCompetitors([], deps())).resolutions).toEqual([]);
    expect((await resolveCompetitors(undefined, deps())).resolvedDomains).toEqual([]);
  });

  it.each([
    "ftp://example.com/resource",
    PRIVATE_URL,
    "http://127.0.0.1:8080",
    "http://169.254.169.254/latest/meta-data",
  ])("rejects unsafe user website %s as INVALID_DOMAIN", async (website) => {
    const r = await resolveOne({ name: "x", website });
    expect(r.status).toBe("INVALID_DOMAIN");
  });
});
