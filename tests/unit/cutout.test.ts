import { describe, expect, it } from "vitest";
import { refineParams, REFINE_MAX_SIDE, workingSize } from "../../src/core/postprocess/cutout.ts";

describe("workingSize", () => {
  it("ne grossit jamais une petite image", () => {
    expect(workingSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("réduit en gardant le rapport, plus grand côté = plafond", () => {
    expect(workingSize(8000, 4000)).toEqual({ width: REFINE_MAX_SIDE, height: REFINE_MAX_SIDE / 2 });
    expect(workingSize(3000, 6000, 1000)).toEqual({ width: 500, height: 1000 });
  });
});

describe("refineParams", () => {
  it("rayon proportionnel à la taille, borné entre 2 et 8", () => {
    expect(refineParams(200, 100).radius).toBe(2);
    expect(refineParams(1024, 768).radius).toBe(4);
    expect(refineParams(2048, 2048).radius).toBe(8);
    expect(refineParams(9000, 100).radius).toBe(8);
  });
});
