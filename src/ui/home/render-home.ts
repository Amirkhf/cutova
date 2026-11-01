import { getDictionary, type Locale } from "../../i18n/index.ts";
import { renderHeader } from "./header.ts";
import { renderHero } from "./hero.ts";
import { renderBeforeAfterDemo } from "./before-after-demo.ts";
import { renderUploadCard, type UploadCardHandle } from "./upload-card.ts";
import { renderEditor, type EditorHandle } from "../editor/editor.ts";

/** Pages d'accueil publiées par langue (seo/build.mjs, content/site.json). */
const LOCALE_HOME_PATHS: Record<Locale, string> = { en: "/", fr: "/fr/", "pt-br": "/pt-br/", es: "/es/", id: "/id/" };

export function renderHome(root: HTMLElement, initialLocale: Locale): void {
  let locale = initialLocale;
  let selectedFile: File | null = null;
  let uploadCard: UploadCardHandle | null = null;
  let resultPanel: EditorHandle | null = null;

  function build(): void {
    uploadCard?.destroy();
    resultPanel?.destroy();
    root.innerHTML = "";
    document.documentElement.lang = locale;
    const dict = getDictionary(locale);

    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = "#home-main";
    skipLink.textContent = dict.common.skipToContent;

    const header = renderHeader({
      dict,
      locale,
      onLocaleChange: (next) => {
        // Sur une page publiée (`/`, `/fr/`), changer de langue = aller sur la page de cette langue
        // (URL indexable, hreflang). Sinon (dev, langue sans page), simple re-rendu sur place.
        const path = LOCALE_HOME_PATHS[next];
        if (document.documentElement.dataset.locale && path && path !== window.location.pathname) {
          window.location.assign(path);
          return;
        }
        locale = next;
        build();
      },
    });

    const main = document.createElement("main");
    main.id = "home-main";
    main.className = "home-main";

    uploadCard = renderUploadCard({
      dict,
      initialFile: selectedFile,
      onFileAccepted: (file) => {
        selectedFile = file;
      },
    });

    const copy = document.createElement("div");
    copy.className = "home-copy";
    copy.append(renderHero(dict), renderBeforeAfterDemo(dict));

    resultPanel = renderEditor({
      dict,
      onNewImage: () => {
        // Retour à l'accueil : carte d'envoi vide, focus sur le bouton principal.
        selectedFile = null;
        build();
        root.querySelector<HTMLElement>(".upload-card button")?.focus();
        root.querySelector(".upload-card")?.scrollIntoView({ block: "center" });
      },
    });

    main.append(uploadCard.element, resultPanel.element, copy);
    root.append(skipLink, header, main);
  }

  build();
}
