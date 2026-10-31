import { getDictionary, type Locale } from "../../i18n/index.ts";
import { renderHeader } from "./header.ts";
import { renderHero } from "./hero.ts";
import { renderBeforeAfterDemo } from "./before-after-demo.ts";
import { renderUploadCard, type UploadCardHandle } from "./upload-card.ts";
import { renderResultPanel, type ResultPanelHandle } from "../result/render-result.ts";

export function renderHome(root: HTMLElement, initialLocale: Locale): void {
  let locale = initialLocale;
  let selectedFile: File | null = null;
  let uploadCard: UploadCardHandle | null = null;
  let resultPanel: ResultPanelHandle | null = null;

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

    resultPanel = renderResultPanel(dict);

    main.append(uploadCard.element, resultPanel.element, copy);
    root.append(skipLink, header, main);
  }

  build();
}
