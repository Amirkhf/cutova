import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { dimensionsFromHeader } from "../../src/core/validate-image/header-dimensions.ts";
import { validateImage } from "../../src/core/validate-image/validate-image.ts";

const make = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#336699" } });

describe("dimensions lues dans l'en-tête (sans décodage)", () => {
  it.each([
    ["png", () => make(321, 123).png().toBuffer()],
    ["jpeg", () => make(321, 123).withMetadata({ exif: { IFD0: { Copyright: "x".repeat(4000) } } }).jpeg().toBuffer()],
    ["webp", () => make(321, 123).webp().toBuffer()],
    ["webp", () => make(321, 123).webp({ lossless: true }).toBuffer()],
    ["webp", () => sharp({ create: { width: 321, height: 123, channels: 4, background: "#33669980" } }).webp().toBuffer()],
    ["gif", () => make(321, 123).gif().toBuffer()],
    ["avif", () => make(321, 123).avif().toBuffer()],
  ] as const)("%s", async (format, build) => {
    const bytes = new Uint8Array(await build());
    expect(dimensionsFromHeader(format, bytes)).toEqual({ width: 321, height: 123 });
  });

  it("en-tête tronqué ou abîmé → null (repli sur le décodage)", () => {
    expect(dimensionsFromHeader("png", new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(dimensionsFromHeader("jpeg", new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe("validateImage : robustesse", () => {
  it("fichier vide", async () => {
    expect(await validateImage(new Blob([]))).toEqual({ ok: false, error: { code: "empty" } });
  });

  it("bombe de décompression (PNG 40 000 × 20 000 annoncé) refusée sans décodage", async () => {
    // En-tête PNG valide annonçant 800 MP, sans données d'image.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x9c, 0x40, 0, 0, 0x4e, 0x20, 8, 2, 0, 0, 0]);
    expect(await validateImage(new Blob([png]))).toEqual({ ok: false, error: { code: "dimensions-too-large", width: 40000, height: 20000 } });
  });

  it("grande image (100 MP) acceptée avec réduction annoncée", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x27, 0x10, 0, 0, 0x27, 0x10, 8, 2, 0, 0, 0]);
    const result = await validateImage(new Blob([png]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resizeTo!.width * result.resizeTo!.height).toBeLessThanOrEqual(50_000_000);
  });
});
