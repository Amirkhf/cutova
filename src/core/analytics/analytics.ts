/**
 * Envoi des événements anonymes (navigateur) vers `/api/event`, même origine, par
 * `navigator.sendBeacon` (non bloquant, survit à la fermeture de l'onglet). Rien n'est envoyé si le
 * visiteur a activé "Do Not Track" ou "Global Privacy Control", si `sendBeacon` est absent, ou si
 * l'événement ne passe pas la liste blanche (schema.ts). Aucune file, aucun stockage, aucun cookie.
 */
import { pageOf, validateEvent, type AnalyticsEvent } from "./schema.ts";

export const EVENT_ENDPOINT = "/api/event";

interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/** Vrai si le visiteur demande à ne pas être suivi (DNT ou GPC) : on n'envoie alors rien. */
export function privacyOptOut(nav: PrivacySignals | undefined = typeof navigator === "undefined" ? undefined : (navigator as PrivacySignals), win: { doNotTrack?: string | null } | undefined = typeof window === "undefined" ? undefined : (window as { doNotTrack?: string | null })): boolean {
  if (!nav) return true;
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.doNotTrack === "yes" || win?.doNotTrack === "1";
}

/** Langue de la page publiée (`<html data-locale>` ou `lang`). */
export function currentLang(): string {
  if (typeof document === "undefined") return "en";
  return document.documentElement.dataset.locale ?? document.documentElement.lang ?? "en";
}

/**
 * Envoie un événement. Renvoie vrai s'il a été confié au navigateur. Les champs `lang` (et `page` pour
 * `page_view`) sont remplis ici ; tout champ non autorisé fait abandonner l'envoi.
 */
export function track(event: AnalyticsEvent): boolean {
  try {
    if (privacyOptOut()) return false;
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
    const complete: AnalyticsEvent = { ...event, lang: event.lang ?? currentLang() };
    if (event.type === "page_view") complete.page = event.page ?? pageOf(location.pathname);
    const valid = validateEvent(complete);
    if (!valid) return false;
    return navigator.sendBeacon(EVENT_ENDPOINT, new Blob([JSON.stringify(valid)], { type: "application/json" }));
  } catch {
    return false; // la mesure ne doit jamais gêner l'utilisation
  }
}
