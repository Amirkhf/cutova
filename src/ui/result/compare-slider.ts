/**
 * Curseur avant/après réutilisable : deux calques superposés, le calque "après" est découpé à
 * `--split`. Clavier : `<input type="range">` réel (invisible mais focalisable, flèches) ;
 * souris/tactile : glisser directement sur l'image (écouteurs pointer sur le cadre).
 */
import { dragHandleIconMarkup } from "../home/visuals.ts";

export interface CompareSliderOptions {
  id: string;
  label: string;
  beforeLabel: string;
  afterLabel: string;
  before: HTMLElement;
  after: HTMLElement;
}

export interface CompareSliderHandle {
  element: HTMLElement;
  /** Calque "après" (pour y changer le fond : damier, blanc, couleur). */
  afterLayer: HTMLElement;
  setSplit: (percent: number) => void;
}

export function createCompareSlider({ id, label, beforeLabel, afterLabel, before, after }: CompareSliderOptions): CompareSliderHandle {
  const frame = document.createElement("div");
  frame.className = "compare-frame";

  const beforeLayer = document.createElement("div");
  beforeLayer.className = "compare-layer compare-before";
  beforeLayer.append(before);

  const afterLayer = document.createElement("div");
  afterLayer.className = "compare-layer compare-after";
  afterLayer.append(after);

  const badgeBefore = document.createElement("span");
  badgeBefore.className = "compare-badge compare-badge-before";
  badgeBefore.textContent = beforeLabel;
  const badgeAfter = document.createElement("span");
  badgeAfter.className = "compare-badge compare-badge-after";
  badgeAfter.textContent = afterLabel;

  const divider = document.createElement("div");
  divider.className = "compare-divider";

  const sliderLabel = document.createElement("label");
  sliderLabel.className = "sr-only";
  sliderLabel.htmlFor = id;
  sliderLabel.textContent = label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = id;
  slider.className = "compare-slider";
  slider.min = "0";
  slider.max = "100";

  const handle = document.createElement("div");
  handle.className = "compare-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = dragHandleIconMarkup();

  frame.append(beforeLayer, afterLayer, badgeBefore, badgeAfter, divider, slider, handle, sliderLabel);

  const setSplit = (value: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)));
    frame.style.setProperty("--split", `${clamped}%`);
    slider.value = String(clamped);
    slider.setAttribute("aria-valuetext", `${clamped}%`);
  };
  setSplit(50);
  slider.addEventListener("input", () => setSplit(Number(slider.value)));

  const percentFromClientX = (clientX: number) => {
    const rect = frame.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };
  let dragging = false;
  frame.addEventListener("pointerdown", (event) => {
    dragging = true;
    frame.setPointerCapture(event.pointerId);
    setSplit(percentFromClientX(event.clientX));
    event.preventDefault();
  });
  frame.addEventListener("pointermove", (event) => {
    if (dragging) setSplit(percentFromClientX(event.clientX));
  });
  const stop = (event: PointerEvent) => {
    dragging = false;
    if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
  };
  frame.addEventListener("pointerup", stop);
  frame.addEventListener("pointercancel", stop);

  return { element: frame, afterLayer, setSplit };
}
