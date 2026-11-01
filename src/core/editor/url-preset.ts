/**
 * Réglage d'arrière-plan présélectionné par l'URL de l'accueil, pour les liens des pages guides :
 * `?bg=white` → fond blanc pur ; `?bg=photo` (option `&photo=<id>`) → fond photo. Toute autre valeur
 * est ignorée (aucune donnée de l'URL n'est utilisée telle quelle).
 */
import type { BackgroundSetting } from "./settings.ts";

export function backgroundFromQuery(search: string, photoIds: readonly string[]): BackgroundSetting | null {
  const params = new URLSearchParams(search);
  const bg = params.get("bg");
  if (bg === "white") return { kind: "color", color: "#ffffff" };
  if (bg === "photo" && photoIds.length > 0) {
    const wanted = params.get("photo");
    return { kind: "photo", photoId: wanted && photoIds.includes(wanted) ? wanted : photoIds[0]! };
  }
  return null;
}
