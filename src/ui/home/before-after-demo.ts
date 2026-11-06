import type { Dictionary } from "../../i18n/index.ts";
import { dragHandleIconMarkup } from "./visuals.ts";

/** Vraie photo (Pexels) détourée par notre modèle : public/showcase/, sources dans public/examples/SOURCES.md. */
function demoImage(src: string, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.width = 480;
  img.height = 720;
  img.decoding = "async";
  return img;
}

export function renderBeforeAfterDemo(dict: Dictionary): HTMLElement {
  const section = document.createElement("section");
  section.className = "home-demo";
  section.setAttribute("aria-labelledby", "home-demo-title");

  const title = document.createElement("h2");
  title.id = "home-demo-title";
  title.className = "home-demo-title";
  title.textContent = dict.demo.sectionTitle;

  const frame = document.createElement("div");
  frame.className = "home-demo-frame";

  const before = document.createElement("div");
  before.className = "home-demo-layer home-demo-before";
  before.append(demoImage("/showcase/demo-before.webp", dict.demo.beforeAlt));
  const beforeBadge = document.createElement("span");
  beforeBadge.className = "home-demo-badge home-demo-badge-before";
  beforeBadge.textContent = dict.demo.beforeLabel;
  before.append(beforeBadge);

  const after = document.createElement("div");
  after.className = "home-demo-layer home-demo-after checkerboard";
  after.append(demoImage("/showcase/demo-after.webp", dict.demo.afterAlt));
  const afterBadge = document.createElement("span");
  afterBadge.className = "home-demo-badge home-demo-badge-after";
  afterBadge.textContent = dict.demo.afterLabel;
  after.append(afterBadge);

  const divider = document.createElement("div");
  divider.className = "home-demo-divider";

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

  const handle = document.createElement("div");
  handle.className = "home-demo-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = dragHandleIconMarkup();

  frame.append(before, after, divider, slider, handle);

  const applySplit = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    frame.style.setProperty("--split", `${clamped}%`);
    slider.value = String(clamped);
    slider.setAttribute("aria-valuetext", `${clamped}%`);
  };
  applySplit(50);

  slider.addEventListener("input", () => {
    applySplit(Number(slider.value));
  });

  const percentFromClientX = (clientX: number): number => {
    const rect = frame.getBoundingClientRect();
    return Math.round(((clientX - rect.left) / rect.width) * 100);
  };

  let dragging = false;
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    frame.setPointerCapture(event.pointerId);
    applySplit(percentFromClientX(event.clientX));
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    applySplit(percentFromClientX(event.clientX));
  };
  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    if (frame.hasPointerCapture(event.pointerId)) {
      frame.releasePointerCapture(event.pointerId);
    }
  };

  frame.addEventListener("pointerdown", onPointerDown);
  frame.addEventListener("pointermove", onPointerMove);
  frame.addEventListener("pointerup", onPointerUp);
  frame.addEventListener("pointercancel", onPointerUp);

  section.append(title, frame, sliderLabel);
  return section;
}
