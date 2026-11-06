/**
 * Dimensions lues dans l'EN-TÊTE du fichier, sans décoder l'image (PNG, GIF, WebP, JPEG, AVIF).
 * But : refuser une "bombe de décompression" (petit fichier, énormes dimensions) AVANT que le
 * navigateur n'essaie d'allouer des gigaoctets pour la décoder. `null` si l'en-tête est illisible :
 * l'appelant retombe alors sur le décodage (qui échoue proprement pour un fichier abîmé).
 */
import type { ImageFormat } from "./validate-image.ts";

export interface HeaderDimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;

function valid(width: number, height: number): HeaderDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

export function pngDimensions(b: Uint8Array): HeaderDimensions | null {
  // Signature (8) + longueur (4) + "IHDR" (4) + largeur (4) + hauteur (4).
  if (b.length < 24 || String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== "IHDR") return null;
  return valid(u32be(b, 16), u32be(b, 20));
}

export function gifDimensions(b: Uint8Array): HeaderDimensions | null {
  return b.length < 10 ? null : valid(u16le(b, 6), u16le(b, 8));
}

export function webpDimensions(b: Uint8Array): HeaderDimensions | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (chunk === "VP8X") return valid(u24le(b, 24) + 1, u24le(b, 27) + 1);
  if (chunk === "VP8 ") return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (chunk === "VP8L") {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return null;
}

/** Parcourt les segments JPEG jusqu'au premier SOFn (hors DHT/JPG/DAC). */
export function jpegDimensions(b: Uint8Array): HeaderDimensions | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return valid(u16be(b, o + 7), u16be(b, o + 5));
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    o += 2 + u16be(b, o + 2);
  }
  return null;
}

/** AVIF : première boîte `ispe` (taille de l'image principale dans les fichiers usuels). */
export function avifDimensions(b: Uint8Array): HeaderDimensions | null {
  for (let o = 4; o + 16 <= b.length; o++) {
    if (b[o] === 0x69 && b[o + 1] === 0x73 && b[o + 2] === 0x70 && b[o + 3] === 0x65) {
      return valid(u32be(b, o + 8), u32be(b, o + 12));
    }
  }
  return null;
}

export function dimensionsFromHeader(format: ImageFormat, bytes: Uint8Array): HeaderDimensions | null {
  switch (format) {
    case "png":
      return pngDimensions(bytes);
    case "gif":
      return gifDimensions(bytes);
    case "webp":
      return webpDimensions(bytes);
    case "jpeg":
      return jpegDimensions(bytes);
    case "avif":
      return avifDimensions(bytes);
  }
}

/** Octets à lire pour trouver l'en-tête (les JPEG peuvent porter de longues données EXIF avant SOF). */
export const HEADER_SCAN_BYTES = 1024 * 1024;
