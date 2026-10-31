import type { Dictionary, Locale } from "../../i18n/index.ts";
import { availableLocales } from "../../i18n/index.ts";
import { chevronDownIconMarkup, globeIconMarkup, scissorsIconMarkup } from "./visuals.ts";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  "pt-br": "Português (BR)",
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

export function renderHeader({ dict, locale, onLocaleChange }: HeaderOptions): HTMLElement {
  const header = document.createElement("header");
  header.className = "home-header";

  const brand = document.createElement("div");
  brand.className = "home-brand";
  brand.innerHTML = `<span class="home-brand-icon">${scissorsIconMarkup()}</span><span class="home-brand-name">${dict.header.brand}</span>`;

  const nav = document.createElement("nav");
  nav.className = "home-nav";
  nav.setAttribute("aria-label", dict.header.toolsMenu);

  const toolsWrapper = document.createElement("div");
  toolsWrapper.className = "home-tools";

  const toolsButton = document.createElement("button");
  toolsButton.type = "button";
  toolsButton.className = "home-tools-btn";
  toolsButton.innerHTML = `<span>${dict.header.toolsMenu}</span><span aria-hidden="true" class="home-tools-chevron">${chevronDownIconMarkup()}</span>`;
  toolsButton.setAttribute("aria-haspopup", "true");
  toolsButton.setAttribute("aria-expanded", "false");

  const toolsPanel = document.createElement("div");
  toolsPanel.className = "home-tools-panel";
  toolsPanel.hidden = true;
  toolsPanel.textContent = dict.header.toolsComingSoon;

  toolsButton.addEventListener("click", () => {
    const isOpen = !toolsPanel.hidden;
    toolsPanel.hidden = isOpen;
    toolsButton.setAttribute("aria-expanded", String(!isOpen));
  });

  toolsWrapper.append(toolsButton, toolsPanel);

  const langWrap = document.createElement("div");
  langWrap.className = "home-lang";

  const langIcon = document.createElement("span");
  langIcon.className = "home-lang-icon";
  langIcon.setAttribute("aria-hidden", "true");
  langIcon.innerHTML = globeIconMarkup();

  const langLabel = document.createElement("label");
  langLabel.className = "home-lang-label sr-only";
  langLabel.htmlFor = "home-lang-select";
  langLabel.textContent = dict.header.languageSelectorLabel;

  const langSelect = document.createElement("select");
  langSelect.id = "home-lang-select";
  langSelect.className = "home-lang-select";
  for (const code of availableLocales) {
    const option = document.createElement("option");
    option.value = code;
    option.lang = code;
    option.textContent = LOCALE_CODES[code];
    option.title = LOCALE_NAMES[code];
    option.selected = code === locale;
    langSelect.append(option);
  }
  langSelect.addEventListener("change", () => {
    onLocaleChange(langSelect.value as Locale);
  });

  langWrap.append(langIcon, langLabel, langSelect);
  nav.append(toolsWrapper, langWrap);
  header.append(brand, nav);
  return header;
}
