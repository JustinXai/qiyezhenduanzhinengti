import { describe, expect, it } from "vitest";
import {
  competitorInputName,
  competitorInputWebsite,
  competitorNames,
  parseDiagnosisInput,
} from "../../src/runtime/diagnosis-input";

const BASE = { website: "https://example-equip.com" };

describe("DiagnosisInput competitor contract", () => {
  it("accepts a plain string[] of competitors (backward compatible)", () => {
    const res = parseDiagnosisInput({ ...BASE, competitors: ["GoPro", "大疆 DJI"] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.input.competitors).toEqual(["GoPro", "大疆 DJI"]);
  });

  it("accepts the object form with a name and optional website", () => {
    const res = parseDiagnosisInput({
      ...BASE,
      competitors: [{ name: "大疆", website: "https://www.dji.com" }, { name: "Moka" }],
    });
    expect(res.ok).toBe(true);
  });

  it("accepts a mixed string + object list", () => {
    const res = parseDiagnosisInput({
      ...BASE,
      competitors: ["GoPro", { name: "大疆", website: "https://www.dji.com" }],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an object competitor whose website is not a valid URL", () => {
    const res = parseDiagnosisInput({
      ...BASE,
      competitors: [{ name: "x", website: "not-a-url" }],
    });
    expect(res.ok).toBe(false);
  });

  it("rejects unknown keys on a competitor object (strict)", () => {
    const res = parseDiagnosisInput({
      ...BASE,
      competitors: [{ name: "x", homepage: "https://x.example.com" }],
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an empty competitor name", () => {
    expect(parseDiagnosisInput({ ...BASE, competitors: [""] }).ok).toBe(false);
    expect(parseDiagnosisInput({ ...BASE, competitors: [{ name: "" }] }).ok).toBe(false);
  });
});

describe("competitor input helpers", () => {
  it("competitorInputName extracts and trims the name from either form", () => {
    expect(competitorInputName("  GoPro ")).toBe("GoPro");
    expect(competitorInputName({ name: " 大疆 " })).toBe("大疆");
  });

  it("competitorInputWebsite returns the website only for the object form", () => {
    expect(competitorInputWebsite("GoPro")).toBeUndefined();
    expect(competitorInputWebsite({ name: "大疆", website: "https://dji.com" })).toBe(
      "https://dji.com",
    );
    expect(competitorInputWebsite({ name: "大疆" })).toBeUndefined();
  });

  it("competitorNames projects a mixed list to de-duplicated names", () => {
    expect(
      competitorNames(["GoPro", { name: "GoPro", website: "https://gopro.com" }, { name: "大疆" }]),
    ).toEqual(["GoPro", "大疆"]);
    expect(competitorNames(undefined)).toEqual([]);
  });
});
