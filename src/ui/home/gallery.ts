/**
 * Onglets de la galerie statique de l'accueil (HTML produit par seo/build.mjs, hors de #app) :
 * clic et clavier (flèches, Début, Fin) selon le motif "tabs" de l'ARIA APG. Sans JavaScript, le
 * premier onglet reste visible.
 */
export function initGallery(root: ParentNode = document): void {
  const list = root.querySelector<HTMLElement>(".gallery-tabs");
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const select = (index: number, focus: boolean) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !selected;
    });
    if (focus) tabs[index]?.focus();
  };
  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i, false)));
  list.addEventListener("keydown", (event) => {
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const next =
      event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    select(next, true);
  });
}
