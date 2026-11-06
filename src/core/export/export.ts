/**
 * Export du résultat : formats, noms de fichiers, fond. Logique pure (testée) + une fonction
 * navigateur (`exportCanvas`) qui encode un canvas pleine résolution.
 */

export type ExportFormat = "png" | "webp" | "jpg";

export type Background = { kind: "transparent" } | { kind: "white" } | { kind: "color"; color: string };

const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
};

export function mimeFor(format: ExportFormat): string {
  return MIME[format];
}

/** JPG n'a pas de canal alpha : un fond transparent y est remplacé par du blanc. */
export function effectiveBackground(format: ExportFormat, background: Background): Background {
  return format === "jpg" && background.kind === "transparent" ? { kind: "white" } : background;
}

/** Couleur CSS à peindre sous le sujet, ou `null` pour garder la transparence. */
export function backgroundFill(background: Background): string | null {
  switch (background.kind) {
    case "transparent":
      return null;
    case "white":
      return "#ffffff";
    case "color":
      return /^#[0-9a-f]{6}$/i.test(background.color) ? background.color : "#ffffff";
  }
}

/** "Vacances été.HEIC.jpg" → "Vacances été.HEIC-cutova.png" (extension remplacée, nom gardé). */
export function exportFileName(originalName: string, format: ExportFormat): string {
  const base = originalName.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || "image";
  // Retire les caractères interdits dans les noms de fichiers des principaux OS.
  const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
  return `${safe}-cutova.${format}`;
}

/** Qualité d'encodage : PNG sans perte ; WebP/JPG à 0.92 (bon compromis poids/qualité). */
export function qualityFor(format: ExportFormat): number | undefined {
  return format === "png" ? undefined : 0.92;
}

/**
 * Compose `cutout` (sujet sur fond transparent, pleine résolution) sur le fond demandé et encode.
 * Navigateur uniquement (OffscreenCanvas).
 */
export async function exportCanvas(cutout: OffscreenCanvas | HTMLCanvasElement, format: ExportFormat, background: Background): Promise<Blob> {
  const fill = backgroundFill(effectiveBackground(format, background));
  const out = new OffscreenCanvas(cutout.width, cutout.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D indisponible");
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(cutout, 0, 0);
  return out.convertToBlob({ type: mimeFor(format), quality: qualityFor(format) });
}
