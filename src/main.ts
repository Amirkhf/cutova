import "./styles/base.css";
import "./ui/home/home.css";
import "./ui/result/result.css";
import { resolveLocale } from "./i18n/index.ts";
import { renderHome } from "./ui/home/render-home.ts";

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("#app root element not found");
}

renderHome(app, resolveLocale(navigator.language));
