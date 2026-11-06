/**
 * Préférences mémorisées dans CE navigateur (localStorage) : couleurs de fond récentes, format
 * d'export et format prédéfini favoris. Jamais envoyées nulle part. Toute lecture/écriture est
 * protégée (navigation privée, stockage désactivé ou plein → valeurs par défaut, jamais d'erreur).
 */
import type { ExportFormat } from "../export/export.ts";
import { findPreset, safeColor } from "./settings.ts";

export interface Preferences {
  recentColors: string[];
  exportFormat: ExportFormat;
  favoritePresets: string[];
}

const KEY = "cutova.prefs.v1";
const MAX_COLORS = 6;
const MAX_PRESETS = 4;

export function defaultPreferences(): Preferences {
  return { recentColors: [], exportFormat: "png", favoritePresets: [] };
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lit et valide (une valeur abîmée ou d'une autre version ne casse rien). */
export function loadPreferences(store: Pick<Storage, "getItem"> | null = storage()): Preferences {
  const prefs = defaultPreferences();
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return prefs;
    const data = JSON.parse(raw) as Partial<Preferences>;
    if (Array.isArray(data.recentColors)) {
      prefs.recentColors = data.recentColors.filter((c) => typeof c === "string" && safeColor(c, "") !== "").slice(0, MAX_COLORS);
    }
    if (data.exportFormat === "png" || data.exportFormat === "webp" || data.exportFormat === "jpg") prefs.exportFormat = data.exportFormat;
    if (Array.isArray(data.favoritePresets)) {
      prefs.favoritePresets = data.favoritePresets.filter((id) => typeof id === "string" && !!findPreset(id)).slice(0, MAX_PRESETS);
    }
  } catch {
    // valeur illisible : on garde les valeurs par défaut
  }
  return prefs;
}

export function savePreferences(prefs: Preferences, store: Pick<Storage, "setItem"> | null = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // stockage plein ou interdit : préférence simplement non mémorisée
  }
}

/** Ajoute en tête (sans doublon), borné. */
export function pushRecent<T>(list: T[], value: T, max: number): T[] {
  return [value, ...list.filter((v) => v !== value)].slice(0, max);
}

export function rememberColor(prefs: Preferences, color: string): Preferences {
  return { ...prefs, recentColors: pushRecent(prefs.recentColors, color.toLowerCase(), MAX_COLORS) };
}

export function rememberPreset(prefs: Preferences, presetId: string): Preferences {
  return { ...prefs, favoritePresets: pushRecent(prefs.favoritePresets, presetId, MAX_PRESETS) };
}
