/**
 * Limite de pixels décodés adaptée à l'appareil. Remplace l'ancienne limite fixe de
 * 8000 px par côté (voir context.md > Décisions) : iOS/iPadOS Safari plafonne les
 * canvas à 16 777 216 px (4096×4096) ; ailleurs on vise ≥ 50 MP si la mémoire le permet.
 */

/** iOS/iPadOS Safari : limite de taille de canvas documentée (4096×4096). */
export const IOS_SAFARI_MAX_CANVAS_PIXELS = 16_777_216;

/** Desktop/Android : valeur prudente, grande marge sous le GB de RAM moyen (RGBA 32bpp). */
export const DEFAULT_MAX_DECODED_PIXELS = 50_000_000;

/** Au-delà, le fichier est traité comme suspect (bombe de décompression) plutôt que réduit. */
export const ABSOLUTE_MAX_DECODE_PIXELS = 500_000_000;

function isIOSOrIPadOSSafari(nav: Pick<Navigator, "userAgent" | "maxTouchPoints" | "platform">): boolean {
  const ua = nav.userAgent;
  if (/iP(ad|hone|od)/.test(ua)) return true;
  // iPadOS 13+ se présente comme "Macintosh" mais expose un écran tactile.
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
}

export function getMaxDecodedPixels(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): number {
  if (!nav) return DEFAULT_MAX_DECODED_PIXELS;
  return isIOSOrIPadOSSafari(nav) ? IOS_SAFARI_MAX_CANVAS_PIXELS : DEFAULT_MAX_DECODED_PIXELS;
}

export interface Dimensions {
  width: number;
  height: number;
}

/** Réduit `width`×`height` pour tenir dans `maxPixels` en conservant le ratio, dimensions paires. */
export function fitWithinPixelBudget({ width, height }: Dimensions, maxPixels: number): Dimensions {
  const pixelCount = width * height;
  if (pixelCount <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / pixelCount);
  const fitted = {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
  return fitted;
}
