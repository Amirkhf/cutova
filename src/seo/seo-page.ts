/**
 * Entrée Vite des pages statiques SEO (seo/build.mjs) : uniquement les styles partagés avec
 * l'application (jetons, polices, boutons) + les styles propres aux pages. Aucun JavaScript exécuté.
 */
import "../styles/base.css";
import "./seo.css";

// Mesure anonyme de la page vue (aucune donnée personnelle ; rien si Do Not Track / GPC).
import { track } from "../core/analytics/analytics.ts";
track({ type: "page_view" });
