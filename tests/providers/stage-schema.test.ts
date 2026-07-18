import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStageJson } from "../../src/providers/deepseek";
import { CompanyProfileStageOutput } from "../../src/diagnosis/analysis/stage-schemas";
import companyProfileFixture from "./fixtures/company-profile.json";

describe("parseStageJson", () => {
  const schema = z.object({ a: z.number(), b: z.string() });

  it("returns ok with typed value on a schema match", () => {
    const res = parseStageJson("unit", schema, { a: 1, b: "x" });
    expect(res).toEqual({ ok: true, value: { a: 1, b: "x" } });
  });

  it("classifies a shape violation as PROVIDER_SCHEMA_MISMATCH (non-retryable)", () => {
    const res = parseStageJson("unit", schema, { a: "not-a-number", b: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("PROVIDER_SCHEMA_MISMATCH");
      expect(res.error.retryable).toBe(false);
      expect(res.error.message).toContain("unit");
      expect(res.error.message).toContain("a"); // offending path surfaced
    }
  });

  it("accepts the deterministic company-profile fixture", () => {
    const res = parseStageJson("company_profile", CompanyProfileStageOutput, companyProfileFixture);
    expect(res.ok).toBe(true);
  });
});
