/** Message clair pour chaque erreur de validation (carte d'envoi et bouton "+" de l'éditeur). */
import type { Dictionary } from "../../i18n/index.ts";
import { MAX_FILE_SIZE_BYTES, type ValidationError } from "../../core/validate-image/validate-image.ts";
import { ABSOLUTE_MAX_DECODE_PIXELS } from "../../core/limits/device-limits.ts";

export function messageForError(error: ValidationError, dict: Dictionary): string {
  switch (error.code) {
    case "unsupported-format":
      return dict.errors.unsupportedFormat(error.format);
    case "file-too-large":
      return dict.errors.fileTooLarge(Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024)));
    case "dimensions-too-large":
      return dict.errors.dimensionsTooLarge(Math.round(ABSOLUTE_MAX_DECODE_PIXELS / 1_000_000));
    case "unreadable":
      return dict.errors.generic;
    case "empty":
      return dict.errors.emptyFile;
  }
}
