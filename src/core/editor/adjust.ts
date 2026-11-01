/**
 * Ajustements de couleur (luminosité, contraste, saturation, température) appliqués aux pixels RGBA.
 * Calcul en JavaScript (et non `ctx.filter`, absent de certains navigateurs) : rendu identique partout.
 * Une table de correspondance par canal rend l'opération rapide (≈ 3 lectures de table par pixel),
 * la saturation demande un mélange avec la luminance.
 */
import type { AdjustSetting } from "./settings.ts";

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Tables par canal (R, G, B) : luminosité + contraste + température. */
export function channelTables(adj: AdjustSetting): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const brightness = (adj.brightness / 100) * 80; // décalage jusqu'à ±80 niveaux
  const c = (adj.contrast / 100) * 0.9; // facteur de contraste entre 0,1 et 1,9
  const contrast = 1 + c;
  const warm = (adj.temperature / 100) * 40; // température : + rouge / − bleu (ou l'inverse)
  const tables: [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const shift = [warm, warm * 0.2, -warm];
  for (let ch = 0; ch < 3; ch++) {
    for (let v = 0; v < 256; v++) {
      const contrasted = (v - 128) * contrast + 128;
      tables[ch]![v] = clamp255(contrasted + brightness + shift[ch]!);
    }
  }
  return tables;
}

/** Modifie `data` (RGBA) sur place. Les pixels transparents sont ignorés. */
export function applyAdjustments(data: Uint8ClampedArray, adj: AdjustSetting): void {
  const [tr, tg, tb] = channelTables(adj);
  const sat = 1 + adj.saturation / 100; // 0 (gris) à 2 (couleurs doublées)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = tr[data[i]!]!;
    let g = tg[data[i + 1]!]!;
    let b = tb[data[i + 2]!]!;
    if (sat !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp255(lum + (r - lum) * sat);
      g = clamp255(lum + (g - lum) * sat);
      b = clamp255(lum + (b - lum) * sat);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
