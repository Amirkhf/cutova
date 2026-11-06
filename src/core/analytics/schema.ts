/**
 * Schéma de la mesure d'utilisation ANONYME, partagé par le navigateur (envoi) et la fonction
 * Cloudflare `/api/event` (validation). Liste blanche stricte : un événement ne peut contenir QUE
 * les champs autorisés pour son type, avec des valeurs prises dans des listes fermées (sauf `page`,
 * contrainte par un motif). Jamais d'image, de nom de fichier, d'identifiant, d'IP, de user-agent ni
 * d'URL de provenance : ces informations n'ont tout simplement aucun champ où aller.
 */

export const EVENT_TYPES = ["page_view", "cutout_done", "cutout_failed", "engine_fallback", "download", "tool_used", "batch_zip"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const LANGS = ["en", "fr", "pt-br", "es", "id"] as const;
export const ENGINES = ["webgpu", "wasm"] as const;
export const MODELS = ["birefnet-lite", "ormbg", "isnet"] as const;
export const TOOLS = ["erase", "restore", "reset_mask", "background", "background_photo", "background_blur", "shadow", "outline", "adjust", "crop", "format_preset", "undo", "redo"] as const;
export const FORMATS = ["png", "webp", "jpg"] as const;
export const TIME_BUCKETS = ["lt1s", "1-2s", "2-5s", "5-10s", "gt10s"] as const;
export const SIZE_BUCKETS = ["lt1mp", "1-4mp", "4-12mp", "12-24mp", "gt24mp"] as const;

export type Field = "type" | "page" | "lang" | "engine" | "model" | "tool" | "format" | "time" | "size";

/** Champs autorisés par type (en plus de `type`). */
export const FIELDS_BY_TYPE: Record<EventType, readonly Field[]> = {
  page_view: ["page", "lang"],
  cutout_done: ["lang", "engine", "model", "time", "size"],
  cutout_failed: ["lang", "engine", "model", "size"],
  engine_fallback: ["lang", "engine", "model"],
  download: ["lang", "format", "size"],
  tool_used: ["lang", "tool"],
  batch_zip: ["lang", "format"],
};

const VALUES: Partial<Record<Field, readonly string[]>> = {
  lang: LANGS,
  engine: ENGINES,
  model: MODELS,
  tool: TOOLS,
  format: FORMATS,
  time: TIME_BUCKETS,
  size: SIZE_BUCKETS,
};

/** Chemin de page du site : minuscules, chiffres, tirets, au plus 4 segments, sans requête ni ancre. */
export const PAGE_PATTERN = /^\/(?:[a-z0-9-]{1,40}\/){0,4}$/;

/** Taille maximale acceptée d'un corps de requête (un événement fait < 150 octets). */
export const MAX_BODY_BYTES = 512;

export type AnalyticsEvent = { type: EventType } & Partial<Record<Exclude<Field, "type">, string>>;

/**
 * Valide un objet reçu : renvoie l'événement normalisé, ou `null` au moindre écart (type inconnu,
 * champ en trop ou non autorisé pour ce type, valeur hors liste, mauvais type JS).
 */
export function validateEvent(input: unknown): AnalyticsEvent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) return null;
  const allowed = FIELDS_BY_TYPE[type as EventType];
  const event: AnalyticsEvent = { type: type as EventType };
  for (const [key, value] of Object.entries(record)) {
    if (key === "type") continue;
    if (!(allowed as readonly string[]).includes(key) || typeof value !== "string") return null;
    const field = key as Exclude<Field, "type">;
    if (field === "page") {
      if (!PAGE_PATTERN.test(value)) return null;
    } else if (!VALUES[field]?.includes(value)) {
      return null;
    }
    event[field] = value;
  }
  return event;
}

/** Tranche de temps de traitement (jamais la valeur exacte). */
export function timeBucket(ms: number): (typeof TIME_BUCKETS)[number] {
  if (ms < 1000) return "lt1s";
  if (ms < 2000) return "1-2s";
  if (ms < 5000) return "2-5s";
  if (ms < 10_000) return "5-10s";
  return "gt10s";
}

/** Tranche de taille d'image en mégapixels (jamais les dimensions exactes). */
export function sizeBucket(width: number, height: number): (typeof SIZE_BUCKETS)[number] {
  const mp = (width * height) / 1_000_000;
  if (mp < 1) return "lt1mp";
  if (mp < 4) return "1-4mp";
  if (mp < 12) return "4-12mp";
  if (mp < 24) return "12-24mp";
  return "gt24mp";
}

/** Chemin de page publiable : sans requête/ancre, avec "/" final, sinon "/" (jamais l'URL complète). */
export function pageOf(pathname: string): string {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return PAGE_PATTERN.test(path) ? path : "/";
}
