import type { Dictionary, Locale } from "./types.ts";
import { en } from "./locales/en.ts";
import { fr } from "./locales/fr.ts";

/** Toutes les locales prévues pour le sélecteur de langue (voir context.md > Pages SEO). */
export const availableLocales: Locale[] = ["en", "fr", "pt-br", "es", "id"];

/** Locales ayant un dictionnaire complet. Les autres retombent sur l'anglais (`en`). */
const dictionaries: Partial<Record<Locale, Dictionary>> = { en, fr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return "en";
  const lower = input.toLowerCase();
  const match = availableLocales.find((locale) => lower === locale || lower.startsWith(`${locale}-`));
  if (match) return match;
  if (lower.startsWith("pt")) return "pt-br";
  return "en";
}

export type { Dictionary, Locale };
