import { describe, expect, it } from "vitest";
import { outputSize, scaleRegion, subjectBounds, withMargin } from "../../src/core/postprocess/crop.ts";

describe("subjectBounds", () => {
  it("trouve la boîte englobante du sujet", () => {
    const w = 6;
    const h = 5;
    const alpha = new Uint8Array(w * h);
    alpha[1 * w + 2] = 255;
    alpha[3 * w + 4] = 200;
    alpha[0 * w + 0] = 10; // sous le seuil : ignoré
    expect(subjectBounds(alpha, w, h)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });

  it("lit l'alpha d'un tableau RGBA", () => {
    const rgba = new Uint8ClampedArray(4 * 4);
    rgba[2 * 4 + 3] = 255; // pixel (0, 1) d'une image 2×2
    expect(subjectBounds(rgba, 2, 2, { stride: 4, offset: 3 })).toEqual({ x: 0, y: 1, width: 1, height: 1 });
  });

  it("masque vide → null", () => {
    expect(subjectBounds(new Uint8Array(9), 3, 3)).toBeNull();
  });
});

describe("withMargin", () => {
  it("ajoute une marge proportionnelle au plus grand côté, bornée à l'image", () => {
    expect(withMargin({ x: 40, y: 40, width: 20, height: 10 }, 0.5, 100, 100)).toEqual({ x: 30, y: 30, width: 40, height: 30 });
    expect(withMargin({ x: 2, y: 2, width: 96, height: 96 }, 0.1, 100, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe("scaleRegion", () => {
  it("passe des coordonnées du masque à celles de l'image, arrondi vers l'extérieur", () => {
    expect(scaleRegion({ x: 10, y: 5, width: 20, height: 10 }, 100, 50, 1000, 500)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(scaleRegion({ x: 0.5, y: 0.5, width: 1, height: 1 }, 10, 10, 15, 15)).toEqual({ x: 0, y: 0, width: 3, height: 3 });
  });
});

describe("outputSize", () => {
  it("conserve le rapport et n'agrandit jamais", () => {
    expect(outputSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
    expect(outputSize(2000, 1000, 4000)).toEqual({ width: 2000, height: 1000 });
    expect(outputSize(2000, 1000, null)).toEqual({ width: 2000, height: 1000 });
    expect(outputSize(2000, 1000, Number.NaN)).toEqual({ width: 2000, height: 1000 });
    expect(outputSize(3, 1000, 1)).toEqual({ width: 1, height: 333 });
  });
});
