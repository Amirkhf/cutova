/**
 * Géométrie de sortie : quelle zone de l'image d'origine, à quelle taille, placée où dans le canevas
 * final. Pur et testé. Trois cadrages : image entière, recadrée sur le sujet (+ marge), ou format
 * prédéfini (W×H fixes, sujet centré avec une marge intérieure).
 */
import { outputSize, scaleRegion, withMargin, type Region } from "../postprocess/crop.ts";
import { findPreset, type FramingSetting } from "./settings.ts";

export interface OutputGeometry {
  /** Zone de l'image d'origine utilisée (pixels de l'image). */
  source: Region;
  /** Taille du canevas final. */
  canvasWidth: number;
  canvasHeight: number;
  /** Rectangle où la zone `source` est dessinée dans le canevas final. */
  dest: Region;
}

/**
 * @param subject boîte du sujet en pixels de l'image (null = masque vide → image entière)
 * @param requestedWidth largeur de sortie voulue (null = taille naturelle ; jamais d'agrandissement
 *   au-delà de la taille naturelle, sauf pour un format prédéfini qui fixe sa propre taille)
 */
export function computeGeometry(
  imageWidth: number,
  imageHeight: number,
  framing: FramingSetting,
  subject: Region | null,
  requestedWidth: number | null = null,
): OutputGeometry {
  const whole: Region = { x: 0, y: 0, width: imageWidth, height: imageHeight };

  if (framing.kind === "preset") {
    const preset = findPreset(framing.presetId);
    if (preset) {
      const box = subject ?? whole;
      const pad = Math.max(0, Math.min(40, framing.paddingPercent)) / 100;
      const innerW = preset.width * (1 - 2 * pad);
      const innerH = preset.height * (1 - 2 * pad);
      const scale = Math.min(innerW / box.width, innerH / box.height);
      const w = box.width * scale;
      const h = box.height * scale;
      return {
        source: box,
        canvasWidth: preset.width,
        canvasHeight: preset.height,
        dest: { x: (preset.width - w) / 2, y: (preset.height - h) / 2, width: w, height: h },
      };
    }
  }

  let source = whole;
  if (framing.kind === "subject" && subject) {
    source = scaleRegion(withMargin(subject, framing.marginPercent / 100, imageWidth, imageHeight), imageWidth, imageHeight, imageWidth, imageHeight);
  }
  const out = outputSize(source.width, source.height, requestedWidth);
  return { source, canvasWidth: out.width, canvasHeight: out.height, dest: { x: 0, y: 0, width: out.width, height: out.height } };
}

/** Même géométrie, réduite d'un facteur (aperçu à l'écran). */
export function scaleGeometry(g: OutputGeometry, factor: number): OutputGeometry {
  return {
    source: g.source,
    canvasWidth: Math.max(1, Math.round(g.canvasWidth * factor)),
    canvasHeight: Math.max(1, Math.round(g.canvasHeight * factor)),
    dest: { x: g.dest.x * factor, y: g.dest.y * factor, width: g.dest.width * factor, height: g.dest.height * factor },
  };
}
