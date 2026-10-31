import { describe, expect, it } from "vitest";
import { backgroundFill, effectiveBackground, exportFileName, mimeFor, qualityFor } from "../../src/core/export/export.ts";

describe("export", () => {
  it("donne le bon type MIME", () => {
    expect(mimeFor("png")).toBe("image/png");
    expect(mimeFor("webp")).toBe("image/webp");
    expect(mimeFor("jpg")).toBe("image/jpeg");
  });

  it("remplace la transparence par du blanc en JPG seulement", () => {
    expect(effectiveBackground("jpg", { kind: "transparent" })).toEqual({ kind: "white" });
    expect(effectiveBackground("png", { kind: "transparent" })).toEqual({ kind: "transparent" });
    expect(effectiveBackground("jpg", { kind: "color", color: "#112233" })).toEqual({ kind: "color", color: "#112233" });
  });

  it("calcule la couleur de fond (et refuse une couleur invalide)", () => {
    expect(backgroundFill({ kind: "transparent" })).toBeNull();
    expect(backgroundFill({ kind: "white" })).toBe("#ffffff");
    expect(backgroundFill({ kind: "color", color: "#5B4BFF" })).toBe("#5B4BFF");
    expect(backgroundFill({ kind: "color", color: "red; background:url(x)" })).toBe("#ffffff");
  });

  it("construit un nom de fichier sûr", () => {
    expect(exportFileName("photo.jpg", "png")).toBe("photo-cutova.png");
    expect(exportFileName("Vacances été.HEIC.jpeg", "webp")).toBe("Vacances été.HEIC-cutova.webp");
    expect(exportFileName("a/b:c*?.png", "jpg")).toBe("a_b_c__-cutova.jpg");
    expect(exportFileName(".png", "png")).toBe("image-cutova.png");
  });

  it("PNG sans paramètre de qualité, WebP/JPG à 0.92", () => {
    expect(qualityFor("png")).toBeUndefined();
    expect(qualityFor("jpg")).toBe(0.92);
  });
});
