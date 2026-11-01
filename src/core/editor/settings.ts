/**
 * Réglages d'édition d'UNE image (chaque image du lot garde les siens). Données pures, sérialisables
 * (clonage pour l'historique annuler/rétablir), sans référence au DOM.
 */

export type BackgroundSetting =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "photo"; photoId: string }
  | { kind: "blur"; amount: number };

export interface EffectsSetting {
  shadow: { enabled: boolean; blur: number; offset: number; opacity: number };
  outline: { enabled: boolean; width: number; color: string };
}

/** Valeurs de -100 à 100 ; 0 = image d'origine. */
export interface AdjustSetting {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export type FramingSetting =
  | { kind: "original" }
  | { kind: "subject"; marginPercent: number }
  | { kind: "preset"; presetId: string; paddingPercent: number };

export interface EditSettings {
  background: BackgroundSetting;
  effects: EffectsSetting;
  adjust: AdjustSetting;
  framing: FramingSetting;
}

export function defaultSettings(): EditSettings {
  return {
    background: { kind: "transparent" },
    effects: {
      shadow: { enabled: false, blur: 30, offset: 20, opacity: 45 },
      outline: { enabled: false, width: 12, color: "#ffffff" },
    },
    adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
    framing: { kind: "original" },
  };
}

export function cloneSettings(s: EditSettings): EditSettings {
  return structuredClone(s);
}

export function sameSettings(a: EditSettings, b: EditSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isNeutralAdjust(a: AdjustSetting): boolean {
  return a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.temperature === 0;
}

/** Couleur CSS sûre (#rrggbb), sinon la valeur de repli. */
export function safeColor(value: string, fallback = "#ffffff"): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export interface FormatPreset {
  id: string;
  /** Groupe d'affichage. */
  group: "social" | "marketplace" | "generic";
  width: number;
  height: number;
  /** Fond conseillé (les places de marché demandent souvent du blanc). */
  suggestWhite?: boolean;
}

/**
 * Formats prêts à l'emploi. Les noms de plateformes ne servent qu'à décrire la taille (usage
 * descriptif) ; les règles de chaque plateforme évoluent : l'utilisateur reste responsable de les
 * vérifier (dit dans l'interface et les guides).
 */
export const FORMAT_PRESETS: readonly FormatPreset[] = [
  { id: "square-1080", group: "social", width: 1080, height: 1080 },
  { id: "portrait-1080x1350", group: "social", width: 1080, height: 1350 },
  { id: "story-1080x1920", group: "social", width: 1080, height: 1920 },
  { id: "landscape-1200x630", group: "social", width: 1200, height: 630 },
  { id: "video-1280x720", group: "social", width: 1280, height: 720 },
  { id: "marketplace-2000", group: "marketplace", width: 2000, height: 2000, suggestWhite: true },
  { id: "marketplace-1600", group: "marketplace", width: 1600, height: 1600, suggestWhite: true },
  { id: "marketplace-2000x1600", group: "marketplace", width: 2000, height: 1600, suggestWhite: true },
  { id: "passport-600", group: "generic", width: 600, height: 600, suggestWhite: true },
];

export function findPreset(id: string): FormatPreset | undefined {
  return FORMAT_PRESETS.find((p) => p.id === id);
}
