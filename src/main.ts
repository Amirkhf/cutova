import "./styles/base.css";
import "./ui/home/home.css";
import "./ui/result/result.css";
import "./seo/seo.css";
import { resolveLocale } from "./i18n/index.ts";
import { renderHome } from "./ui/home/render-home.ts";

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("#app root element not found");
}

// Les pages statiques fixent la langue (`/` = en, `/fr/` = fr, voir seo/build.mjs) ; en dev, la
// langue du navigateur.
renderHome(app, resolveLocale(document.documentElement.dataset.locale ?? navigator.language));
