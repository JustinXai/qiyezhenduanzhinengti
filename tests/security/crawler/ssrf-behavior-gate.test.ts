// ============================================================================
// Behavioral SSRF gate (vitest mirror of the CI gate).
//
// Runs the shared adversarial corpus (ssrf-behavior-cases.ts) through the REAL
// guarded crawler and asserts every case behaves as required. This is the same
// corpus scripts/security-check.ts enforces, so the fast unit run and the CI
// gate can never drift. A `it.each` per case gives a precise failure label.
// ============================================================================
import { describe, expect, it } from "vitest";
import { runSsrfCase, SSRF_CASES } from "./ssrf-behavior-cases";

describe("SSRF behavior gate (real crawler, adversarial corpus)", () => {
  it("has a non-trivial corpus with at least one positive control", () => {
    expect(SSRF_CASES.length).toBeGreaterThanOrEqual(30);
    expect(SSRF_CASES.some((c) => c.outcome === "allow")).toBe(true);
    expect(SSRF_CASES.some((c) => c.outcome === "reject")).toBe(true);
  });

  it.each(SSRF_CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const result = await runSsrfCase(c);
    expect(result.pass, result.detail).toBe(true);
  });
});
