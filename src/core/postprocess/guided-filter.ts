/**
 * Affinage des bords du masque par filtre guidé (He et al., "Guided Image Filtering", 2010) :
 * le masque basse résolution, une fois agrandi, est "recollé" aux contours réels de l'image
 * (cheveux, poils, bords nets) en utilisant la luminance de l'image comme guide.
 * Implémentation O(N) avec boîtes glissantes (sommes cumulées), en Float32, sans allocation
 * par pixel. Pur et testable sans navigateur.
 */

/** Moyenne sur une fenêtre (2r+1)², bords gérés en réduisant la fenêtre (pas de padding). */
export function boxMean(src: Float32Array, width: number, height: number, radius: number, out?: Float32Array): Float32Array {
  const dst = out ?? new Float32Array(width * height);
  const tmp = new Float32Array(width * height);
  // Passe horizontale : somme glissante par ligne.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) {
      sum += src[row + x]!;
      count++;
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / count;
      const add = x + radius + 1;
      const remove = x - radius;
      if (add < width) {
        sum += src[row + add]!;
        count++;
      }
      if (remove >= 0) {
        sum -= src[row + remove]!;
        count--;
      }
    }
  }
  // Passe verticale sur le résultat horizontal.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y++) {
      sum += tmp[y * width + x]!;
      count++;
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / count;
      const add = y + radius + 1;
      const remove = y - radius;
      if (add < height) {
        sum += tmp[add * width + x]!;
        count++;
      }
      if (remove >= 0) {
        sum -= tmp[remove * width + x]!;
        count--;
      }
    }
  }
  return dst;
}

/** Luminance [0,1] depuis des pixels RGBA (ImageData.data). */
export function luminance(rgba: Uint8ClampedArray | Uint8Array, pixelCount: number): Float32Array {
  const out = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const j = i * 4;
    out[i] = (0.299 * rgba[j]! + 0.587 * rgba[j + 1]! + 0.114 * rgba[j + 2]!) / 255;
  }
  return out;
}

export interface GuidedFilterOptions {
  /** Rayon de la fenêtre en pixels (à l'échelle de travail). */
  radius: number;
  /** Régularisation : plus grand = plus lisse, plus petit = colle davantage aux contours. */
  epsilon: number;
}

/**
 * Filtre guidé d'un masque `p` (valeurs 0..255) par le guide `guide` (luminance 0..1), même taille.
 * Renvoie le masque affiné (0..255).
 */
export function guidedFilter(
  guide: Float32Array,
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  { radius, epsilon }: GuidedFilterOptions,
): Uint8ClampedArray {
  const n = width * height;
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) p[i] = mask[i]! / 255;

  const meanI = boxMean(guide, width, height, radius);
  const meanP = boxMean(p, width, height, radius);
  const prod = new Float32Array(n);
  for (let i = 0; i < n; i++) prod[i] = guide[i]! * p[i]!;
  const meanIp = boxMean(prod, width, height, radius);
  for (let i = 0; i < n; i++) prod[i] = guide[i]! * guide[i]!;
  const meanII = boxMean(prod, width, height, radius);

  // a = cov(I,p) / (var(I) + eps) ; b = mean(p) - a * mean(I). Réutilise les tampons.
  const a = meanIp;
  const b = meanII;
  for (let i = 0; i < n; i++) {
    const cov = meanIp[i]! - meanI[i]! * meanP[i]!;
    const variance = meanII[i]! - meanI[i]! * meanI[i]!;
    const ai = cov / (variance + epsilon);
    a[i] = ai;
    b[i] = meanP[i]! - ai * meanI[i]!;
  }
  const meanA = boxMean(a, width, height, radius, meanI);
  const meanB = boxMean(b, width, height, radius, meanP);

  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = Math.round((meanA[i]! * guide[i]! + meanB[i]!) * 255);
  return out;
}
