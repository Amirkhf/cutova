import { describe, expect, it } from "vitest";
import { brushRadius, containedRect, toMaskPoint } from "../../src/core/postprocess/brush.ts";

describe("containedRect", () => {
  it("image plus large que l'élément : bandes en haut et en bas", () => {
    expect(containedRect({ x: 0, y: 0, width: 400, height: 400 }, 2000, 1000)).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });

  it("image plus haute : bandes à gauche et à droite", () => {
    expect(containedRect({ x: 10, y: 20, width: 400, height: 200 }, 1000, 1000)).toEqual({ x: 110, y: 20, width: 200, height: 200 });
  });
});

describe("toMaskPoint", () => {
  const image = { x: 100, y: 50, width: 200, height: 100 };
  it("convertit les coordonnées écran en coordonnées du masque", () => {
    expect(toMaskPoint(200, 100, image, 2000, 1000)).toEqual({ x: 1000, y: 500 });
    expect(toMaskPoint(100, 50, image, 2000, 1000)).toEqual({ x: 0, y: 0 });
  });

  it("renvoie null hors de l'image", () => {
    expect(toMaskPoint(99, 100, image, 2000, 1000)).toBeNull();
    expect(toMaskPoint(200, 151, image, 2000, 1000)).toBeNull();
  });
});

describe("brushRadius", () => {
  it("de 0,5 % à 10 % du plus grand côté, borné", () => {
    expect(brushRadius(1, 2000, 1000)).toBeCloseTo(10, 5);
    expect(brushRadius(100, 2000, 1000)).toBeCloseTo(200, 5);
    expect(brushRadius(500, 2000, 1000)).toBeCloseTo(200, 5);
    expect(brushRadius(-3, 2000, 1000)).toBeCloseTo(10, 5);
  });
});
