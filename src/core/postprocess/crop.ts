/**
 * Recadrage et redimensionnement de l'export. Fonctions pures (testées) : boîte englobante du sujet
 * dans le masque, marge, passage des coordonnées du masque à celles de l'image, taille de sortie.
 */

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Boîte englobante des pixels du masque dont l'alpha dépasse `threshold` (`alpha` = un octet par
 * pixel, ou RGBA avec `stride` = 4 et `offset` = 3). `null` si le masque est vide.
 */
export function subjectBounds(alpha: ArrayLike<number>, width: number, height: number, { threshold = 16, stride = 1, offset = 0 } = {}): Region | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[(row + x) * stride + offset]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Agrandit `region` d'une marge (fraction du plus grand côté du sujet), bornée à l'image. */
export function withMargin(region: Region, marginFraction: number, imageWidth: number, imageHeight: number): Region {
  const margin = Math.max(0, marginFraction) * Math.max(region.width, region.height);
  const x0 = Math.max(0, region.x - margin);
  const y0 = Math.max(0, region.y - margin);
  const x1 = Math.min(imageWidth, region.x + region.width + margin);
  const y1 = Math.min(imageHeight, region.y + region.height + margin);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Région en coordonnées du masque → région entière en pixels de l'image (arrondie vers l'extérieur). */
export function scaleRegion(region: Region, fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): Region {
  const sx = toWidth / fromWidth;
  const sy = toHeight / fromHeight;
  const x0 = Math.max(0, Math.floor(region.x * sx));
  const y0 = Math.max(0, Math.floor(region.y * sy));
  const x1 = Math.min(toWidth, Math.ceil((region.x + region.width) * sx));
  const y1 = Math.min(toHeight, Math.ceil((region.y + region.height) * sy));
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/**
 * Taille de sortie : largeur demandée (rapport conservé), jamais plus grande que la région (pas
 * d'agrandissement : il n'ajouterait aucun détail), au moins 1 px. `null`/NaN = taille de la région.
 */
export function outputSize(regionWidth: number, regionHeight: number, requestedWidth: number | null): { width: number; height: number } {
  if (requestedWidth === null || !Number.isFinite(requestedWidth) || requestedWidth >= regionWidth) {
    return { width: regionWidth, height: regionHeight };
  }
  const width = Math.max(1, Math.round(requestedWidth));
  return { width, height: Math.max(1, Math.round((regionHeight * width) / regionWidth)) };
}
