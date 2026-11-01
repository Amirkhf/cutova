/**
 * Validation des fichiers image côté client. Le type est déterminé par la signature
 * binaire (magic bytes), jamais par le nom de fichier ou l'extension.
 */

import {
  ABSOLUTE_MAX_DECODE_PIXELS,
  fitWithinPixelBudget,
  getMaxDecodedPixels,
  type Dimensions,
} from "../limits/device-limits.ts";
import { dimensionsFromHeader, HEADER_SCAN_BYTES } from "./header-dimensions.ts";

export type ImageFormat = "png" | "jpeg" | "webp" | "avif" | "gif";
export type DetectedFormat = ImageFormat | "heic" | "unknown";

/** 50 Mo — limite raisonnable pour un traitement 100 % navigateur. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export type ValidationError =
  | { code: "unsupported-format"; format: DetectedFormat }
  | { code: "file-too-large"; sizeBytes: number }
  | { code: "dimensions-too-large"; width: number; height: number }
  | { code: "unreadable" }
  | { code: "empty" };

export type ValidationResult =
  | { ok: true; format: ImageFormat; resizeTo?: Dimensions }
  | { ok: false; error: ValidationError };

const HEAD_BYTES = 64;

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "heif", "mif1", "msf1"]);

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/** Lit la marque majeure et les marques compatibles d'une boîte ISOBMFF `ftyp`. */
function readIsoBmffBrands(bytes: Uint8Array): string[] {
  const brands: string[] = [];
  if (bytes.length >= 12) {
    brands.push(readAscii4(bytes, 8));
  }
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    brands.push(readAscii4(bytes, offset));
  }
  return brands;
}

function readAscii4(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

async function detectFormat(file: Blob): Promise<DetectedFormat> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());

  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (matchesAscii(head, 0, "GIF87a") || matchesAscii(head, 0, "GIF89a")) return "gif";
  if (matchesAscii(head, 0, "RIFF") && matchesAscii(head, 8, "WEBP")) return "webp";

  if (matchesAscii(head, 4, "ftyp")) {
    const brands = readIsoBmffBrands(head);
    if (brands.some((b) => b === "avif" || b === "avis")) return "avif";
    if (brands.some((b) => HEIC_BRANDS.has(b))) return "heic";
  }

  return "unknown";
}

/**
 * Dimensions réelles de l'image, quand le navigateur sait les décoder (non disponible
 * en environnement de test Node — retourne `null` dans ce cas, et la vérification est
 * simplement ignorée).
 */
export async function checkDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function validateImage(file: File | Blob): Promise<ValidationResult> {
  if (file.size === 0) return { ok: false, error: { code: "empty" } };
  const format = await detectFormat(file);
  if (format === "unknown" || format === "heic") {
    return { ok: false, error: { code: "unsupported-format", format } };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: { code: "file-too-large", sizeBytes: file.size } };
  }

  // 1. Dimensions lues dans l'en-tête, SANS décoder : une bombe de décompression est refusée ici,
  //    avant que le navigateur ne tente d'allouer des gigaoctets.
  const header = dimensionsFromHeader(format, new Uint8Array(await file.slice(0, HEADER_SCAN_BYTES).arrayBuffer()));
  if (header && header.width * header.height > ABSOLUTE_MAX_DECODE_PIXELS) {
    return { ok: false, error: { code: "dimensions-too-large", width: header.width, height: header.height } };
  }
  // Au-delà du budget de l'appareil : pas de décodage pleine taille ici (il sera fait réduit).
  if (header && header.width * header.height > getMaxDecodedPixels()) {
    return { ok: true, format, resizeTo: fitWithinPixelBudget(header, getMaxDecodedPixels()) };
  }

  // 2. Décodage réel : détecte les fichiers abîmés (en-tête valide, données corrompues).
  let dimensions: { width: number; height: number } | null;
  try {
    dimensions = await checkDimensions(file);
  } catch {
    return { ok: false, error: { code: "unreadable" } };
  }
  if (dimensions) {
    const pixelCount = dimensions.width * dimensions.height;
    if (pixelCount > ABSOLUTE_MAX_DECODE_PIXELS) {
      // Au-delà de toute limite raisonnable d'appareil : probable fichier corrompu ou
      // hostile (bombe de décompression) plutôt qu'une vraie photo à réduire.
      return {
        ok: false,
        error: { code: "dimensions-too-large", width: dimensions.width, height: dimensions.height },
      };
    }
    const maxPixels = getMaxDecodedPixels();
    if (pixelCount > maxPixels) {
      // Jamais de rejet silencieux : on signale une réduction automatique plutôt que d'échouer.
      return { ok: true, format, resizeTo: fitWithinPixelBudget(dimensions, maxPixels) };
    }
  }

  return { ok: true, format };
}
