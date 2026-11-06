import type { Dictionary, Locale } from "../../i18n/index.ts";
import { availableLocales } from "../../i18n/index.ts";
import { scissorsIconMarkup } from "./visuals.ts";
import { dropdownHtml, GLOBE_ICON, initDropdowns, MENU_ICON, type DropdownGroup } from "../menu/dropdown.ts";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  "pt-br": "Português (Brasil)",
  es: "Español",
  id: "Bahasa Indonesia",
};

const LOCALE_CODES: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  "pt-br": "PT",
  es: "ES",
  id: "ID",
};

export interface HeaderOptions {
  dict: Dictionary;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

interface NavLocale {
  tools: DropdownGroup[];
  home: string;
  hreflang: string;
  languageName: string;
}

/** Données des menus injectées par seo/build.mjs (production) ou par le serveur de dev (vite.config.ts). */
function readNav(): Partial<Record<Locale, NavLocale>> {
  try {
    const text = document.getElementById("cutova-nav")?.textContent;
    return text ? (JSON.parse(text) as Partial<Record<Locale, NavLocale>>) : {};
  } catch {
    return {};
  }
}

let cleanupMenus: (() => void) | null = null;

export function renderHeader({ dict, locale, onLocaleChange }: HeaderOptions): HTMLElement {
  cleanupMenus?.();
  const header = document.createElement("header");
  header.className = "home-header";

  const brand = document.createElement("div");
  brand.className = "home-brand";
  brand.innerHTML = `<span class="home-brand-icon">${scissorsIconMarkup()}</span><span class="home-brand-name">${dict.header.brand}</span>`;

  const nav = document.createElement("nav");
  nav.className = "home-nav";
  nav.setAttribute("aria-label", dict.header.toolsMenu);

  const data = readNav();
  const tools = data[locale]?.tools ?? [];
  const current = data[locale];
  // Même composant que les pages statiques (src/ui/menu/dropdown.ts) ; balisage de confiance (nos données).
  nav.innerHTML =
    (tools.length
      ? dropdownHtml({ id: "dd-tools", variant: "dd-nav", buttonText: dict.header.toolsMenu, buttonLabel: dict.header.toolsMenu, mobileIcon: MENU_ICON, groups: tools })
      : "") +
    dropdownHtml({
      id: "dd-lang",
      variant: "dd-lang",
      buttonText: LOCALE_CODES[locale],
      buttonLabel: `${dict.header.languageSelectorLabel}: ${current?.languageName ?? LOCALE_NAMES[locale]}`,
      icon: GLOBE_ICON,
      groups: [
        {
          links: availableLocales.map((code) => ({
            href: data[code]?.home ?? "/",
            label: data[code]?.languageName ?? LOCALE_NAMES[code],
            lang: data[code]?.hreflang ?? code,
            hreflang: data[code]?.hreflang ?? code,
            current: code === locale,
          })),
        },
      ],
    });

  // Accueil publié (`data-locale`) : les liens mènent à l'accueil de l'autre langue (URL hreflang). En dev
  // (pas de page par langue) : re-rendu sur place.
  nav.querySelector("#dd-lang-panel")?.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a.dd-item");
    if (!link) return;
    const code = availableLocales.find((c) => (data[c]?.hreflang ?? c) === link.hreflang);
    if (!code || document.documentElement.dataset.locale) return;
    event.preventDefault();
    onLocaleChange(code);
  });

  cleanupMenus = initDropdowns(nav);
  header.append(brand, nav);
  return header;
}
