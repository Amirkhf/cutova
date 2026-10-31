import type { Dictionary } from "../../i18n/index.ts";
import { lockIconMarkup } from "./visuals.ts";

export function renderHero(dict: Dictionary): HTMLElement {
  const section = document.createElement("section");
  section.className = "home-hero";
  section.setAttribute("aria-labelledby", "home-hero-title");

  const title = document.createElement("h1");
  title.id = "home-hero-title";
  title.className = "home-hero-title";
  title.textContent = dict.hero.title;

  const reassurance = document.createElement("p");
  reassurance.className = "home-hero-reassurance";
  reassurance.innerHTML = `<span class="home-hero-reassurance-icon" aria-hidden="true">${lockIconMarkup()}</span><span>${dict.hero.reassurance}</span>`;

  const subtitle = document.createElement("p");
  subtitle.className = "home-hero-subtitle";
  subtitle.textContent = dict.hero.subtitle;

  section.append(title, reassurance, subtitle);
  return section;
}
