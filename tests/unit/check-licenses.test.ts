import { describe, expect, it } from "vitest";
// @ts-expect-error — module JS (.mjs) utilisé tel quel par Node.
import { isForbidden, licenseOf } from "../../scripts/check-licenses.mjs";

describe("contrôle de licences", () => {
  it("GPL et AGPL interdites, LGPL et licences permissives acceptées", () => {
    for (const l of ["GPL-2.0", "GPL-3.0-only", "AGPL-3.0", "GPL-2.0-or-later"]) expect(isForbidden(l)).toBe(true);
    for (const l of ["MIT", "Apache-2.0", "LGPL-3.0-or-later", "BSD-3-Clause", "MPL-2.0", "Apache-2.0 AND LGPL-3.0-or-later AND MIT"]) expect(isForbidden(l)).toBe(false);
  });
  it("double licence avec une option non-GPL acceptée", () => {
    expect(isForbidden("(MIT OR GPL-3.0)")).toBe(false);
    expect(isForbidden("GPL-2.0 OR AGPL-3.0")).toBe(true);
  });
  it("lit les anciens formats du champ licence", () => {
    expect(licenseOf({ license: { type: "MIT" } })).toBe("MIT");
    expect(licenseOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
    expect(licenseOf({})).toBe("UNKNOWN");
  });
});

// @ts-expect-error — module JS (.mjs).
import { percentile } from "../../scripts/bench/browser-bench.mjs";
describe("percentile (banc)", () => {
  it("p50 / p95 par rang", () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(10);
    expect(percentile(v, 95)).toBe(19);
    expect(percentile([5], 95)).toBe(5);
  });
});
