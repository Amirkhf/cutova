/**
 * Menu déroulant unique du site (choix de langue, menu Outils) : même balisage pour l'application
 * (src/ui/home/header.ts) et pour les pages statiques (seo/render.mjs, sans dépendance au DOM ici).
 *
 * Modèle « disclosure » accessible : bouton avec aria-expanded / aria-controls, panneau de liens.
 * Clavier : Entrée/Espace ouvrent, ↓/↑ (et Début/Fin) parcourent les liens, Échap ferme et rend le focus
 * au bouton ; clic en dehors ou focus qui sort → fermeture. Un seul menu ouvert à la fois.
 */

export interface DropdownLink {
  href: string;
  label: string;
  /** Langue du libellé (nom de langue écrit dans sa propre langue). */
  lang?: string;
  hreflang?: string;
  current?: boolean;
}

export interface DropdownGroup {
  title?: string;
  links: DropdownLink[];
}

export interface DropdownOptions {
  id: string;
  /** Contenu visible du bouton (texte court, ex. « EN » ou « Outils »). */
  buttonText: string;
  /** Nom accessible complet du bouton (ex. « Langue : English »). */
  buttonLabel: string;
  /** Icône SVG (balisage de confiance, écrit par nous) placée avant le texte. */
  icon?: string;
  /** Icône affichée à la place du texte sur mobile (menu « hamburger »). */
  mobileIcon?: string;
  groups: DropdownGroup[];
  /** Classe supplémentaire sur la racine (ex. "dd-nav", "dd-lang"). */
  variant?: string;
}

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CHEVRON_ICON = `<svg class="dd-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
export const GLOBE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>`;
export const MENU_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

/** Balisage HTML du menu (chaîne) : utilisable côté Node (pages statiques) comme côté navigateur. */
export function dropdownHtml(o: DropdownOptions): string {
  const panelId = `${o.id}-panel`;
  const groups = o.groups
    .filter((g) => g.links.length)
    .map((g, i) => {
      const titleId = `${o.id}-g${i}`;
      const title = g.title ? `<p class="dd-group-title" id="${titleId}">${esc(g.title)}</p>` : "";
      const items = g.links
        .map((l) => {
          const attrs = [
            `class="dd-item"`,
            `href="${esc(l.href)}"`,
            l.lang ? `lang="${esc(l.lang)}"` : "",
            l.hreflang ? `hreflang="${esc(l.hreflang)}"` : "",
            l.current ? `aria-current="page"` : "",
          ].filter(Boolean);
          return `<li><a ${attrs.join(" ")}>${esc(l.label)}</a></li>`;
        })
        .join("");
      return `${title}<ul class="dd-list"${g.title ? ` aria-labelledby="${titleId}"` : ""}>${items}</ul>`;
    })
    .join("");
  const mobile = o.mobileIcon ? `<span class="dd-mobile-icon">${o.mobileIcon}</span>` : "";
  return `<div class="dd ${esc(o.variant ?? "")}" data-dropdown><button type="button" class="dd-trigger" aria-expanded="false" aria-controls="${panelId}"><span class="sr-only">${esc(o.buttonLabel)}</span>${o.icon ?? ""}<span class="dd-text" aria-hidden="true">${esc(o.buttonText)}</span>${mobile}${CHEVRON_ICON}</button><div class="dd-panel" id="${panelId}" hidden>${groups}</div></div>`;
}

const openMenus = new Set<() => void>();

/** Comportement (navigateur) d'un menu rendu par `dropdownHtml`. Renvoie une fonction de nettoyage. */
export function initDropdown(root: HTMLElement): () => void {
  const trigger = root.querySelector<HTMLButtonElement>(".dd-trigger");
  const panel = root.querySelector<HTMLElement>(".dd-panel");
  if (!trigger || !panel) return () => {};
  const items = () => [...panel.querySelectorAll<HTMLAnchorElement>("a.dd-item")];
  const isOpen = () => trigger.getAttribute("aria-expanded") === "true";

  const close = (focusTrigger = false) => {
    if (!isOpen()) return;
    trigger.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    root.classList.remove("is-open");
    openMenus.delete(closeHandle);
    if (focusTrigger) trigger.focus();
  };
  const closeHandle = () => close();
  const open = (focus: "first" | "last" | "none" = "none") => {
    for (const other of [...openMenus]) other();
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    root.classList.add("is-open");
    openMenus.add(closeHandle);
    const list = items();
    const target = focus === "first" ? list[0] : focus === "last" ? list.at(-1) : null;
    target?.focus();
  };

  const onTriggerClick = () => (isOpen() ? close() : open());
  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      open("last");
    } else if (event.key === "Escape") close(true);
  };
  const onPanelKey = (event: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: HTMLAnchorElement | undefined;
    if (event.key === "ArrowDown") next = list[(index + 1) % list.length];
    else if (event.key === "ArrowUp") next = list[(index - 1 + list.length) % list.length];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list.at(-1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    } else return;
    event.preventDefault();
    next?.focus();
  };
  const onDocPointer = (event: Event) => {
    if (isOpen() && !root.contains(event.target as Node)) close();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (isOpen() && event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) close();
  };

  trigger.addEventListener("click", onTriggerClick);
  trigger.addEventListener("keydown", onTriggerKey);
  panel.addEventListener("keydown", onPanelKey);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("pointerdown", onDocPointer);
  return () => {
    close();
    trigger.removeEventListener("click", onTriggerClick);
    trigger.removeEventListener("keydown", onTriggerKey);
    panel.removeEventListener("keydown", onPanelKey);
    root.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("pointerdown", onDocPointer);
  };
}

/** Initialise tous les menus d'un conteneur. */
export function initDropdowns(scope: ParentNode = document): () => void {
  const cleanups = [...scope.querySelectorAll<HTMLElement>("[data-dropdown]")].map(initDropdown);
  return () => cleanups.forEach((c) => c());
}
