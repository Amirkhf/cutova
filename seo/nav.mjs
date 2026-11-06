/**
 * Données des menus (Outils, langues) : une seule source, lue dans content/*.json.
 * Utilisée par seo/build.mjs (en-tête des pages statiques + JSON injecté dans les accueils) et par le
 * serveur de dev Vite (même JSON injecté dans index.html), lue par src/ui/home/header.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadContent(contentDir) {
  const read = (f) => JSON.parse(readFileSync(path.join(contentDir, f), "utf8"));
  const site = read("site.json");
  const home = read("home.json");
  const pages = readdirSync(contentDir)
    .filter((f) => f.endsWith(".json") && f !== "site.json" && f !== "home.json")
    .sort()
    .map(read);
  return { site, home, pages };
}

/** Groupes du menu Outils pour une langue : outils (accueil + pages outils) puis guides how-to. */
export function toolsGroups({ site, pages }, locale) {
  const chrome = site.locales[locale];
  const linkOf = (p) => ({ href: p.locales[locale].path, label: p.locales[locale].navLabel ?? p.locales[locale].h1 });
  const tools = pages.filter((p) => p.tool && p.locales[locale]).map(linkOf);
  const guides = pages.filter((p) => p.type === "howto" && !p.tool && p.locales[locale]).map(linkOf);
  return [
    { title: chrome.footerTools, links: [{ href: chrome.home, label: chrome.footerToolRemove }, ...tools] },
    { title: chrome.footerGuides, links: guides },
  ];
}

/** JSON injecté dans les pages de l'application (toutes les langues : la langue peut changer sans recharger en dev). */
export function navJson(content) {
  const locales = Object.keys(content.site.locales);
  return JSON.stringify(
    Object.fromEntries(
      locales.map((l) => [
        l,
        {
          tools: toolsGroups(content, l),
          home: content.site.locales[l].home,
          hreflang: content.site.locales[l].hreflang,
          languageName: content.site.locales[l].languageName,
        },
      ]),
    ),
  ).replace(/</g, "\\u003c");
}

export const NAV_SCRIPT_ID = "cutova-nav";
export const navScriptTag = (content) => `<script type="application/json" id="${NAV_SCRIPT_ID}">${navJson(content)}</script>`;
