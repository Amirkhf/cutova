import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DECODED_PIXELS,
  IOS_SAFARI_MAX_CANVAS_PIXELS,
  fitWithinPixelBudget,
  getMaxDecodedPixels,
} from "../../src/core/limits/device-limits.ts";

const DESKTOP_CHROME = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  maxTouchPoints: 0,
  platform: "Win32",
} as Navigator;

const IPHONE_SAFARI = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  maxTouchPoints: 5,
  platform: "iPhone",
} as Navigator;

const IPAD_OS_SAFARI = {
  // iPadOS 13+ se présente comme un Mac mais expose un écran tactile.
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  maxTouchPoints: 5,
  platform: "MacIntel",
} as Navigator;

const MAC_DESKTOP_SAFARI = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  maxTouchPoints: 0,
  platform: "MacIntel",
} as Navigator;

describe("getMaxDecodedPixels", () => {
  it("plafonne à 16 777 216 px (4096×4096) sur iPhone Safari", () => {
    expect(getMaxDecodedPixels(IPHONE_SAFARI)).toBe(IOS_SAFARI_MAX_CANVAS_PIXELS);
  });

  it("plafonne à 16 777 216 px sur iPadOS Safari (UA 'Macintosh' + tactile)", () => {
    expect(getMaxDecodedPixels(IPAD_OS_SAFARI)).toBe(IOS_SAFARI_MAX_CANVAS_PIXELS);
  });

  it("ne confond pas un vrai Mac de bureau (pas tactile) avec de l'iPadOS", () => {
    expect(getMaxDecodedPixels(MAC_DESKTOP_SAFARI)).toBe(DEFAULT_MAX_DECODED_PIXELS);
  });

  it("utilise la limite par défaut (≥ 50 MP) ailleurs", () => {
    expect(getMaxDecodedPixels(DESKTOP_CHROME)).toBe(DEFAULT_MAX_DECODED_PIXELS);
    expect(DEFAULT_MAX_DECODED_PIXELS).toBeGreaterThanOrEqual(50_000_000);
  });
});

describe("fitWithinPixelBudget", () => {
  it("laisse les dimensions inchangées quand elles tiennent déjà dans le budget", () => {
    expect(fitWithinPixelBudget({ width: 1000, height: 1000 }, 2_000_000)).toEqual({ width: 1000, height: 1000 });
  });

  it("réduit proportionnellement en conservant le ratio d'aspect", () => {
    const result = fitWithinPixelBudget({ width: 8000, height: 4000 }, 16_000_000);
    expect(result.width * result.height).toBeLessThanOrEqual(16_000_000);
    expect(result.width / result.height).toBeCloseTo(8000 / 4000, 1);
  });

  it("retourne toujours des dimensions paires et jamais nulles", () => {
    const result = fitWithinPixelBudget({ width: 50_001, height: 3 }, 1000);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
