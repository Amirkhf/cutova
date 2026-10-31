import { afterEach, describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES, validateImage } from "../../src/core/validate-image/validate-image.ts";
import { ABSOLUTE_MAX_DECODE_PIXELS, DEFAULT_MAX_DECODED_PIXELS } from "../../src/core/limits/device-limits.ts";

function bytes(...groups: (number[] | string)[]): Uint8Array {
  const parts = groups.map((g) =>
    typeof g === "string" ? Uint8Array.from(g.split("").map((c) => c.charCodeAt(0))) : Uint8Array.from(g),
  );
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const PNG_HEADER = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0]);
const JPEG_HEADER = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF");
const GIF_HEADER = bytes("GIF89a", [10, 0, 10, 0]);
const WEBP_HEADER = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ");
const AVIF_HEADER = bytes(
  [0x00, 0x00, 0x00, 0x1c],
  "ftyp",
  "avif",
  [0, 0, 0, 0],
  "mif1",
  "miaf",
);
const HEIC_HEADER = bytes(
  [0x00, 0x00, 0x00, 0x18],
  "ftyp",
  "heic",
  [0, 0, 0, 0],
  "mif1",
);

function makeFile(data: Uint8Array, name: string): File {
  return new File([data], name, { type: "application/octet-stream" });
}

describe("validateImage — détection par signature", () => {
  it.each([
    ["PNG", PNG_HEADER, "png"],
    ["JPEG", JPEG_HEADER, "jpeg"],
    ["GIF", GIF_HEADER, "gif"],
    ["WebP", WEBP_HEADER, "webp"],
    ["AVIF", AVIF_HEADER, "avif"],
  ])("accepte un fichier %s valide", async (_label, data, expectedFormat) => {
    const result = await validateImage(makeFile(data, "image.bin"));
    expect(result).toEqual({ ok: true, format: expectedFormat });
  });

  it("rejette un .png qui est en réalité un JPEG (extension trompeuse)", async () => {
    const result = await validateImage(makeFile(JPEG_HEADER, "photo.png"));
    expect(result).toEqual({ ok: true, format: "jpeg" });
  });

  it("rejette un .jpg dont le contenu n'est pas une image reconnue (extension trompeuse)", async () => {
    const result = await validateImage(makeFile(bytes("just plain text, not an image"), "photo.jpg"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: "unsupported-format", format: "unknown" });
    }
  });

  it("signale le HEIC comme non pris en charge", async () => {
    const result = await validateImage(makeFile(HEIC_HEADER, "photo.heic"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: "unsupported-format", format: "heic" });
    }
  });

  it("rejette un fichier de plus de 50 Mo", async () => {
    const oversized = new Uint8Array(MAX_FILE_SIZE_BYTES + 1);
    oversized.set(PNG_HEADER, 0);
    const result = await validateImage(makeFile(oversized, "huge.png"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("file-too-large");
    }
  });

  it("accepte un fichier juste sous la limite de 50 Mo", async () => {
    const atLimit = new Uint8Array(MAX_FILE_SIZE_BYTES);
    atLimit.set(PNG_HEADER, 0);
    const result = await validateImage(makeFile(atLimit, "large.png"));
    expect(result).toEqual({ ok: true, format: "png" });
  });
});

describe("validateImage — limite de pixels adaptée à l'appareil", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  function mockDimensions(width: number, height: number): void {
    (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = (async () => ({
      width,
      height,
      close() {},
    })) as unknown as typeof createImageBitmap;
  }

  afterEach(() => {
    (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = originalCreateImageBitmap;
  });

  it("accepte sans réduction une image qui tient dans le budget de pixels", async () => {
    mockDimensions(4000, 3000); // 12 MP < DEFAULT_MAX_DECODED_PIXELS
    const result = await validateImage(makeFile(PNG_HEADER, "ok.png"));
    expect(result).toEqual({ ok: true, format: "png" });
  });

  it("au-delà du budget mais sous la limite absolue : accepte avec une réduction, jamais un rejet", async () => {
    const side = Math.ceil(Math.sqrt(DEFAULT_MAX_DECODED_PIXELS * 2));
    mockDimensions(side, side);
    const result = await validateImage(makeFile(PNG_HEADER, "big.png"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resizeTo).toBeDefined();
      expect(result.resizeTo!.width * result.resizeTo!.height).toBeLessThanOrEqual(DEFAULT_MAX_DECODED_PIXELS);
    }
  });

  it("au-delà de la limite absolue (bombe de décompression probable) : rejette", async () => {
    const side = Math.ceil(Math.sqrt(ABSOLUTE_MAX_DECODE_PIXELS * 2));
    mockDimensions(side, side);
    const result = await validateImage(makeFile(PNG_HEADER, "huge.png"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("dimensions-too-large");
    }
  });
});
