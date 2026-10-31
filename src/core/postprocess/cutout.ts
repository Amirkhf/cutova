/**
 * Pipeline pleine résolution (navigateur) : masque du modèle (ex. 1024×1024, image étirée) →
 * masque affiné par filtre guidé à la résolution de travail (`buildCutout`), puis sujet détouré à la
 * taille voulue (`composeCutout` : aperçu ou export pleine résolution).
 *
 * Mémoire : l'affinage se fait à une "résolution de travail" plafonnée (`REFINE_MAX_SIDE`), puis le
 * masque affiné est agrandi par le canvas (interpolation GPU/Skia) jusqu'à la pleine résolution.
 * On ne crée donc jamais de tableau Float32 de la taille de l'image d'origine (50 MP × 4 octets × 6
 * tampons serait > 1 Go).
 */
import { guidedFilter, luminance } from "./guided-filter.ts";
import type { Region } from "./crop.ts";

/** Plus grand côté de la résolution de travail pour l'affinage (≈ 4 MP max). */
export const REFINE_MAX_SIDE = 2048;

export interface CutoutResult {
  /**
   * Masque affiné à la résolution de travail, porté par le canal alpha d'un canvas : c'est lui que
   * la gomme / restauration modifie (src/core/postprocess/brush.ts) avant composition.
   */
  mask: OffscreenCanvas;
  /** Taille de l'image d'origine (= taille de l'export). */
  width: number;
  height: number;
  refineMs: number;
}

/** Taille de travail : même rapport que l'image, plus grand côté ≤ `maxSide`. */
export function workingSize(width: number, height: number, maxSide = REFINE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Paramètres du filtre guidé, proportionnels à la taille de travail. */
export function refineParams(workWidth: number, workHeight: number): { radius: number; epsilon: number } {
  const radius = Math.min(8, Math.max(2, Math.round(Math.max(workWidth, workHeight) / 256)));
  return { radius, epsilon: 1e-3 };
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D indisponible");
  return ctx;
}

/** Masque (niveaux de gris) → canvas dont le canal alpha porte le masque. */
function maskToAlphaCanvas(mask: Uint8Array | Uint8ClampedArray, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = context2d(canvas);
  const data = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) data.data[i * 4 + 3] = mask[i]!;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * @param image image source à sa taille de travail finale (déjà réduite si elle dépassait le budget
 *   de pixels de l'appareil, voir `src/core/limits/device-limits.ts`).
 * @param mask sortie du modèle (`maskWidth`×`maskHeight`, image étirée sans conserver le rapport).
 */
export function buildCutout(
  image: ImageBitmap,
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  options: { refine?: boolean } = {},
): CutoutResult {
  const started = performance.now();
  const { width, height } = image;
  const work = workingSize(width, height);

  // 1. Masque agrandi à la taille de travail (interpolation lissée du canvas).
  const workMaskCanvas = new OffscreenCanvas(work.width, work.height);
  const workMaskCtx = context2d(workMaskCanvas);
  workMaskCtx.imageSmoothingEnabled = true;
  workMaskCtx.imageSmoothingQuality = "high";
  workMaskCtx.drawImage(maskToAlphaCanvas(mask, maskWidth, maskHeight), 0, 0, work.width, work.height);
  const workAlpha = workMaskCtx.getImageData(0, 0, work.width, work.height).data;
  const workPixels = work.width * work.height;
  let refined: Uint8Array | Uint8ClampedArray = new Uint8ClampedArray(workPixels);
  for (let i = 0; i < workPixels; i++) refined[i] = workAlpha[i * 4 + 3]!;

  // 2. Affinage des bords guidé par l'image (cheveux, poils, contours nets).
  if (options.refine !== false) {
    const guideCanvas = new OffscreenCanvas(work.width, work.height);
    const guideCtx = context2d(guideCanvas);
    guideCtx.drawImage(image, 0, 0, work.width, work.height);
    const guide = luminance(guideCtx.getImageData(0, 0, work.width, work.height).data, workPixels);
    refined = guidedFilter(guide, refined, work.width, work.height, refineParams(work.width, work.height));
  }

  return { mask: maskToAlphaCanvas(refined, work.width, work.height), width, height, refineMs: performance.now() - started };
}

/**
 * Composition : `image` dessinée à la taille `width`×`height`, puis masque agrandi en
 * "destination-in" (interpolation lissée du canvas). Sert à l'aperçu (petite taille) comme à
 * l'export (pleine résolution, `width`/`height` = taille de l'image).
 */
export function composeCutout(image: ImageBitmap, mask: OffscreenCanvas, width: number, height: number, region?: Region): OffscreenCanvas {
  // `region` (pixels de l'image) = recadrage ; la même zone est prise dans le masque, à son échelle.
  const r = region ?? { x: 0, y: 0, width: image.width, height: image.height };
  const sx = mask.width / image.width;
  const sy = mask.height / image.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, r.x * sx, r.y * sy, r.width * sx, r.height * sy, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}
