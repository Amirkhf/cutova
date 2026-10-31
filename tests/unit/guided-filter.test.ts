import { describe, expect, it } from "vitest";
import { boxMean, guidedFilter, luminance } from "../../src/core/postprocess/guided-filter.ts";

describe("boxMean", () => {
  it("garde une image constante inchangée", () => {
    const src = new Float32Array(25).fill(0.4);
    const out = boxMean(src, 5, 5, 2);
    for (const v of out) expect(v).toBeCloseTo(0.4, 6);
  });

  it("moyenne correctement en tenant compte des bords", () => {
    // 3×1 : [0, 3, 6], rayon 1 → [1.5, 3, 4.5]
    const out = boxMean(new Float32Array([0, 3, 6]), 3, 1, 1);
    expect(Array.from(out)).toEqual([1.5, 3, 4.5]);
  });
});

describe("luminance", () => {
  it("blanc = 1, noir = 0", () => {
    const out = luminance(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });
});

describe("guidedFilter", () => {
  it("recolle un masque flou au contour net du guide", () => {
    // Guide : moitié gauche noire, moitié droite blanche (contour net en x = 10).
    const w = 20;
    const h = 8;
    const guide = new Float32Array(w * h);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        guide[y * w + x] = x >= 10 ? 1 : 0;
        // Masque flou : rampe de 0 à 255 entre x = 6 et x = 14.
        mask[y * w + x] = Math.max(0, Math.min(255, Math.round(((x - 6) / 8) * 255)));
      }
    }
    const out = guidedFilter(guide, mask, w, h, { radius: 3, epsilon: 1e-4 });
    const row = 4 * w;
    // Le contour devient net : à gauche du bord quasi 0, à droite quasi 255.
    expect(out[row + 8]!).toBeLessThan(mask[row + 8]!);
    expect(out[row + 11]!).toBeGreaterThan(mask[row + 11]!);
    expect(out[row + 2]!).toBeLessThan(10);
    expect(out[row + 17]!).toBeGreaterThan(245);
  });

  it("ne change pas un masque uniforme", () => {
    const guide = new Float32Array(36).map((_, i) => (i % 6) / 5);
    const mask = new Uint8Array(36).fill(255);
    const out = guidedFilter(guide, mask, 6, 6, { radius: 2, epsilon: 1e-3 });
    for (const v of out) expect(v).toBe(255);
  });
});
