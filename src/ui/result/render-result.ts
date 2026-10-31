/**
 * Écran de résultat : détourage pleine résolution (masque agrandi + bords affinés), curseur
 * avant/après, choix du fond (transparent / blanc / couleur), export PNG/WebP/JPG, "Nouvelle image".
 * Découplé de l'accueil : s'abonne lui-même à `image:selected`.
 *
 * Résolutions : le modèle travaille en 1024×1024 ; l'aperçu affiché est plafonné à
 * `PREVIEW_MAX_SIDE` ; l'export se fait à la résolution d'origine (ou réduite au budget de pixels
 * de l'appareil, voir `src/core/limits/device-limits.ts`).
 */
import type { Dictionary } from "../../i18n/index.ts";
import { inferenceEngine } from "../../core/inference/engine-client.ts";
import { MODEL_INPUT_SIZE } from "../../core/model/model-source.ts";
import { buildCutout, composeCutout, workingSize } from "../../core/postprocess/cutout.ts";
import { brushRadius, containedRect, MaskHistory, paintStroke, toMaskPoint, type BrushMode } from "../../core/postprocess/brush.ts";
import { backgroundFill, exportCanvas, exportFileName, type Background, type ExportFormat } from "../../core/export/export.ts";
import { IMAGE_SELECTED_EVENT, type ImageSelectedDetail } from "../home/events.ts";
import { createCompareSlider } from "./compare-slider.ts";

/** Plus grand côté de l'aperçu à l'écran (l'export reste en pleine résolution). */
const PREVIEW_MAX_SIDE = 1600;

export interface ResultPanelOptions {
  dict: Dictionary;
  onNewImage: () => void;
}

export interface ResultPanelHandle {
  element: HTMLElement;
  destroy: () => void;
}

type BackgroundKind = Background["kind"];

function radioGroup<T extends string>(
  name: string,
  legend: string,
  options: { value: T; label: string }[],
  initial: T,
  onChange: (value: T) => void,
): { fieldset: HTMLFieldSetElement; extra: HTMLElement } {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "result-fieldset";
  const legendEl = document.createElement("legend");
  legendEl.textContent = legend;
  const list = document.createElement("div");
  list.className = "result-options";
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "result-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = option.value === initial;
    input.addEventListener("change", () => input.checked && onChange(option.value));
    const text = document.createElement("span");
    text.textContent = option.label;
    label.append(input, text);
    list.append(label);
  }
  fieldset.append(legendEl, list);
  return { fieldset, extra: list };
}

export function renderResultPanel({ dict, onNewImage }: ResultPanelOptions): ResultPanelHandle {
  const section = document.createElement("section");
  section.className = "result-panel";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "result-panel-title");

  const title = document.createElement("h2");
  title.id = "result-panel-title";
  title.className = "result-title";
  title.textContent = dict.result.title;

  const status = document.createElement("p");
  status.className = "result-status";
  status.setAttribute("role", "status");

  // Aperçu : avant = image d'origine ; après = sujet détouré (fond = damier / blanc / couleur).
  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.className = "result-before-canvas";
  const canvas = document.createElement("canvas");
  canvas.className = "result-canvas";
  const compare = createCompareSlider({
    id: "result-compare-slider",
    label: dict.result.compareLabel,
    beforeLabel: dict.result.beforeLabel,
    afterLabel: dict.result.afterLabel,
    before: beforeCanvas,
    after: canvas,
  });
  compare.element.classList.add("result-compare");

  // Réglages : fond + format + téléchargement.
  let background: Background = { kind: "transparent" };
  let format: ExportFormat = "png";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#5b4bff";
  colorInput.className = "result-color";
  colorInput.setAttribute("aria-label", dict.result.backgroundColorPicker);

  const jpgNote = document.createElement("p");
  jpgNote.className = "result-note";
  jpgNote.textContent = dict.result.formatJpgNote;

  const applyBackground = () => {
    const layer = compare.afterLayer;
    const fill = backgroundFill(background);
    layer.classList.toggle("checkerboard", fill === null);
    layer.style.background = fill ?? "";
    colorInput.disabled = background.kind !== "color";
    jpgNote.hidden = !(format === "jpg" && background.kind === "transparent");
    section.dataset.background = background.kind;
  };

  const backgroundGroup = radioGroup<BackgroundKind>(
    "result-background",
    dict.result.backgroundLegend,
    [
      { value: "transparent", label: dict.result.backgroundTransparent },
      { value: "white", label: dict.result.backgroundWhite },
      { value: "color", label: dict.result.backgroundColor },
    ],
    "transparent",
    (kind) => {
      background = kind === "color" ? { kind, color: colorInput.value } : { kind };
      applyBackground();
    },
  );
  backgroundGroup.extra.append(colorInput);
  colorInput.addEventListener("input", () => {
    if (background.kind === "color") {
      background = { kind: "color", color: colorInput.value };
      applyBackground();
    }
  });

  const formatGroup = radioGroup<ExportFormat>(
    "result-format",
    dict.result.formatLegend,
    [
      { value: "png", label: "PNG" },
      { value: "webp", label: "WebP" },
      { value: "jpg", label: "JPG" },
    ],
    "png",
    (value) => {
      format = value;
      applyBackground();
    },
  );

  // Retouche : gomme / restauration au pinceau sur le masque.
  type Tool = "compare" | BrushMode;
  let tool: Tool = "compare";
  const touchUpGroup = radioGroup<Tool>(
    "result-tool",
    dict.result.touchUpLegend,
    [
      { value: "compare", label: dict.result.toolCompare },
      { value: "erase", label: dict.result.toolErase },
      { value: "restore", label: dict.result.toolRestore },
    ],
    "compare",
    (value) => {
      tool = value;
      const editing = value !== "compare";
      compare.setSliderEnabled(!editing);
      // En retouche, le résultat occupe tout le cadre (curseur à 0 %).
      compare.setSplit(editing ? 0 : 50);
      section.dataset.tool = value;
    },
  );
  const brushLabel = document.createElement("label");
  brushLabel.className = "result-brush-size";
  const brushText = document.createElement("span");
  brushText.textContent = dict.result.brushSize;
  const brushInput = document.createElement("input");
  brushInput.type = "range";
  brushInput.min = "1";
  brushInput.max = "100";
  brushInput.value = "20";
  brushLabel.append(brushText, brushInput);
  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className = "btn btn-secondary";
  undoButton.textContent = dict.result.undo;
  undoButton.disabled = true;
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "btn btn-secondary";
  resetButton.textContent = dict.result.resetEdits;
  resetButton.disabled = true;
  const touchUpActions = document.createElement("div");
  touchUpActions.className = "result-touchup-actions";
  touchUpActions.append(undoButton, resetButton);
  touchUpGroup.fieldset.append(brushLabel, touchUpActions);

  const size = document.createElement("p");
  size.className = "result-size";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.className = "btn btn-primary result-download";
  downloadButton.textContent = dict.result.download;
  downloadButton.disabled = true;

  const newImageButton = document.createElement("button");
  newImageButton.type = "button";
  newImageButton.className = "btn btn-secondary result-new";
  newImageButton.textContent = dict.result.newImage;
  newImageButton.addEventListener("click", () => onNewImage());

  const actions = document.createElement("div");
  actions.className = "result-actions";
  actions.append(downloadButton, newImageButton);

  const controls = document.createElement("div");
  controls.className = "result-controls";
  controls.append(touchUpGroup.fieldset, backgroundGroup.fieldset, formatGroup.fieldset, jpgNote, size, actions);

  const viewer = document.createElement("div");
  viewer.className = "result-viewer";
  viewer.append(compare.element, controls);

  section.append(title, status, viewer);
  applyBackground();

  const unsubscribeProgress = inferenceEngine.onProgress(({ loaded, total }) => {
    if (section.dataset.state !== "running") return;
    status.textContent = total > 0 ? dict.result.loadingModel(Math.round((loaded / total) * 100)) : dict.result.preparingModel;
  });

  // Image d'origine (gardée ouverte tant que le résultat est affiché) + masque affiné éditable.
  let full: ImageBitmap | null = null;
  let mask: OffscreenCanvas | null = null;
  let initialMask: ImageBitmap | null = null;
  const history = new MaskHistory();
  let fileName = "image";
  let currentJob = 0;

  function releaseImage(): void {
    full?.close();
    initialMask?.close();
    full = null;
    initialMask = null;
    mask = null;
    history.clear();
    undoButton.disabled = true;
    resetButton.disabled = true;
  }

  /** Aperçu "après" = composition image + masque à la taille de l'aperçu. */
  function renderAfter(): void {
    if (!full || !mask) return;
    const preview = workingSize(full.width, full.height, PREVIEW_MAX_SIDE);
    drawPreview(canvas, composeCutout(full, mask, preview.width, preview.height), preview.width, preview.height);
  }

  // Pinceau : coordonnées écran → masque (l'aperçu est affiché en object-fit: contain).
  let stroke: { last: { x: number; y: number } } | null = null;
  function maskPointFor(event: PointerEvent): { x: number; y: number } | null {
    if (!mask) return null;
    const box = canvas.getBoundingClientRect();
    const image = containedRect({ x: box.left, y: box.top, width: box.width, height: box.height }, canvas.width, canvas.height);
    return toMaskPoint(event.clientX, event.clientY, image, mask.width, mask.height);
  }
  function paintTo(point: { x: number; y: number }, from: { x: number; y: number }): void {
    if (!mask || tool === "compare") return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    paintStroke(ctx, from, point, brushRadius(Number(brushInput.value), mask.width, mask.height), tool);
    renderAfter();
  }
  compare.element.addEventListener("pointerdown", (event) => {
    if (tool === "compare" || !mask || section.dataset.state !== "done") return;
    const point = maskPointFor(event);
    if (!point) return;
    event.preventDefault();
    compare.element.setPointerCapture(event.pointerId);
    // Instantané AVANT de peindre (annulation), sans bloquer le premier point.
    void history.push(mask).then(() => {
      undoButton.disabled = false;
    });
    resetButton.disabled = false;
    stroke = { last: point };
    paintTo(point, point);
  });
  compare.element.addEventListener("pointermove", (event) => {
    if (!stroke) return;
    const point = maskPointFor(event);
    if (!point) return;
    paintTo(point, stroke.last);
    stroke.last = point;
  });
  const endStroke = () => {
    if (stroke) section.dataset.edits = String(Number(section.dataset.edits ?? 0) + 1);
    stroke = null;
  };
  compare.element.addEventListener("pointerup", endStroke);
  compare.element.addEventListener("pointercancel", endStroke);

  undoButton.addEventListener("click", () => {
    if (mask && history.undo(mask)) renderAfter();
    undoButton.disabled = history.size === 0;
  });
  resetButton.addEventListener("click", () => {
    if (!mask || !initialMask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(initialMask, 0, 0);
    ctx.restore();
    history.clear();
    undoButton.disabled = true;
    resetButton.disabled = true;
    renderAfter();
  });

  downloadButton.addEventListener("click", async () => {
    if (!full || !mask) return;
    downloadButton.disabled = true;
    try {
      // Pleine résolution, masque retouché compris.
      const blob = await exportCanvas(composeCutout(full, mask, full.width, full.height), format, background);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(fileName, format);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      downloadButton.disabled = false;
    }
  });

  function drawPreview(target: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number): void {
    const preview = workingSize(width, height, PREVIEW_MAX_SIDE);
    target.width = preview.width;
    target.height = preview.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.drawImage(source, 0, 0, preview.width, preview.height);
  }

  async function showFile({ file, resizeTo }: ImageSelectedDetail): Promise<void> {
    const job = ++currentJob;
    const stale = () => job !== currentJob;
    section.hidden = false;
    section.dataset.state = "running";
    section.dataset.run = String(Number(section.dataset.run ?? 0) + 1);
    delete section.dataset.engine;
    delete section.dataset.elapsedMs;
    releaseImage();
    downloadButton.disabled = true;
    size.textContent = "";
    fileName = file.name || "image";
    status.textContent = dict.result.preparingModel;

    let image: ImageBitmap;
    let inferenceBitmap: ImageBitmap;
    try {
      // Image complète (réduite seulement si elle dépasse le budget de pixels de l'appareil) et
      // entrée du modèle (1024×1024 étirée, comme `preprocessor_config.json` le fait).
      [image, inferenceBitmap] = await Promise.all([
        createImageBitmap(file, resizeTo ? { resizeWidth: resizeTo.width, resizeHeight: resizeTo.height, resizeQuality: "high" } : {}),
        createImageBitmap(file, { resizeWidth: MODEL_INPUT_SIZE, resizeHeight: MODEL_INPUT_SIZE, resizeQuality: "high" }),
      ]);
    } catch {
      if (!stale()) {
        section.dataset.state = "error";
        status.textContent = dict.result.error;
      }
      return;
    }
    if (stale()) {
      image.close();
      inferenceBitmap.close();
      return;
    }

    drawPreview(beforeCanvas, image, image.width, image.height);
    drawPreview(canvas, image, image.width, image.height);
    compare.setSplit(50);
    status.textContent = dict.result.running;

    try {
      const result = await inferenceEngine.run(inferenceBitmap);
      if (stale()) return;
      status.textContent = dict.result.finishing;
      // Laisse le navigateur afficher le message avant le calcul pleine résolution (synchrone).
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (stale()) return;
      const built = buildCutout(image, result.mask, result.width, result.height);
      if (stale()) return;
      full = image;
      mask = built.mask;
      initialMask = await createImageBitmap(built.mask);
      if (stale()) return;
      renderAfter();
      size.textContent = dict.result.downloadSize(built.width, built.height);
      status.textContent = dict.result.processingTime(result.elapsedMs + built.refineMs);
      section.dataset.engine = result.engine;
      section.dataset.elapsedMs = String(Math.round(result.elapsedMs));
      section.dataset.refineMs = String(Math.round(built.refineMs));
      section.dataset.width = String(built.width);
      section.dataset.height = String(built.height);
      section.dataset.state = "done";
      downloadButton.disabled = false;
    } catch {
      if (stale()) return;
      section.dataset.state = "error";
      status.textContent = dict.result.error;
    } finally {
      // Gardée seulement si elle est devenue l'image affichée (retouche + export).
      if (full !== image) image.close();
    }
  }

  function onImageSelected(event: Event): void {
    void showFile((event as CustomEvent<ImageSelectedDetail>).detail);
  }
  window.addEventListener(IMAGE_SELECTED_EVENT, onImageSelected);

  function destroy(): void {
    currentJob++;
    releaseImage();
    window.removeEventListener(IMAGE_SELECTED_EVENT, onImageSelected);
    unsubscribeProgress();
  }

  return { element: section, destroy };
}
