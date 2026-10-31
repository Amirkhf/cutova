import type { Dictionary } from "../../i18n/index.ts";
import { subjectCutoutMarkup, subjectOnBackgroundMarkup } from "./visuals.ts";

export function renderBeforeAfterDemo(dict: Dictionary): HTMLElement {
  const section = document.createElement("section");
  section.className = "home-demo";
  section.setAttribute("aria-labelledby", "home-demo-title");

  const title = document.createElement("h2");
  title.id = "home-demo-title";
  title.textContent = dict.demo.sectionTitle;

  const frame = document.createElement("div");
  frame.className = "home-demo-frame";

  const before = document.createElement("div");
  before.className = "home-demo-layer home-demo-before";
  before.innerHTML = subjectOnBackgroundMarkup("circle", "#ffb27a", "#5c3a1e");

  const after = document.createElement("div");
  after.className = "home-demo-layer home-demo-after checkerboard";
  after.innerHTML = subjectCutoutMarkup("circle", "#5c3a1e");

  const divider = document.createElement("div");
  divider.className = "home-demo-divider";

  frame.append(before, after, divider);

  const labels = document.createElement("div");
  labels.className = "home-demo-labels";
  const beforeLabel = document.createElement("span");
  beforeLabel.textContent = dict.demo.beforeLabel;
  const afterLabel = document.createElement("span");
  afterLabel.textContent = dict.demo.afterLabel;
  labels.append(beforeLabel, afterLabel);

  const sliderId = "home-demo-slider";
  const sliderLabel = document.createElement("label");
  sliderLabel.className = "sr-only";
  sliderLabel.htmlFor = sliderId;
  sliderLabel.textContent = dict.demo.sliderLabel;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = sliderId;
  slider.className = "home-demo-slider";
  slider.min = "0";
  slider.max = "100";
  slider.value = "50";
  slider.setAttribute("aria-valuetext", "50%");

  const applySplit = (value: number) => {
    frame.style.setProperty("--split", `${value}%`);
    slider.setAttribute("aria-valuetext", `${value}%`);
  };
  applySplit(50);

  slider.addEventListener("input", () => {
    applySplit(Number(slider.value));
  });

  section.append(title, frame, labels, sliderLabel, slider);
  return section;
}
