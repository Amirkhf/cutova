/**
 * Éditeur (écran de résultat) : file d'images (bande de miniatures + "+"), détourage dans le worker
 * une image à la fois, puis édition non destructive par image : découpe (gomme/restaurer), arrière-plan
 * (transparent, couleur, photos libres, flou), effets (ombre, contour), ajustements, formats ;
 * comparer avant/après, annuler/rétablir, téléchargement (PNG/WebP/JPG, taille d'origine ou réduite)
 * et ZIP de toutes les images. Tout reste dans le navigateur.
 *
 * Conserve le conteneur `.result-panel` et ses attributs `data-*` (lus par les tests e2e).
 */
import type { Dictionary } from "../../i18n/index.ts";
import { inferenceEngine } from "../../core/inference/engine-client.ts";
import { MODEL_INPUT_SIZE } from "../../core/model/model-source.ts";
import { buildCutout } from "../../core/postprocess/cutout.ts";
import { brushRadius, containedRect, paintStroke, type BrushMode } from "../../core/postprocess/brush.ts";
import { computeGeometry, scaleGeometry, type OutputGeometry } from "../../core/editor/geometry.ts";
import { renderComposite } from "../../core/editor/render.ts";
import { FORMAT_PRESETS, findPreset, safeColor, type BackgroundSetting, type FormatPreset } from "../../core/editor/settings.ts";
import { loadPreferences, rememberColor, rememberPreset, savePreferences } from "../../core/editor/prefs.ts";
import { exportCanvas, exportFileName, type ExportFormat } from "../../core/export/export.ts";
import { createZip, uniqueNames } from "../../core/export/zip.ts";
import { validateImage } from "../../core/validate-image/validate-image.ts";
import { IMAGE_SELECTED_EVENT, type ImageSelectedDetail } from "../home/events.ts";
import { messageForError } from "../home/error-messages.ts";
import { createCompareSlider } from "../result/compare-slider.ts";
import { EditorDoc } from "./doc.ts";
import { track } from "../../core/analytics/analytics.ts";
import { sizeBucket, timeBucket, type TOOLS } from "../../core/analytics/schema.ts";
import { getModelForEngine } from "../../core/model/model-source.ts";
import { button, checkboxField, colorField, fieldset, radioGroup, rangeField, setRange } from "./controls.ts";

/** Plus grand côté de l'aperçu à l'écran (l'export reste en pleine résolution). */
const PREVIEW_MAX_SIDE = 1600;
const ACCEPTED_MIME = "image/png,image/jpeg,image/webp,image/avif,image/gif";
export const BACKGROUND_PHOTOS = ["sea", "bokeh", "field", "city", "dusk", "sky"] as const;

export interface EditorOptions {
  dict: Dictionary;
  onNewImage: () => void;
}

export interface EditorHandle {
  element: HTMLElement;
  destroy: () => void;
}

type Tool = "compare" | BrushMode;
type TabId = "cut" | "background" | "effects" | "adjust" | "formats";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function renderEditor({ dict, onNewImage }: EditorOptions): EditorHandle {
  const r = dict.result;
  let prefs = loadPreferences();
  const docs: EditorDoc[] = [];
  let current: EditorDoc | null = null;
  let tool: Tool = "compare";
  let exportFormat: ExportFormat = prefs.exportFormat;
  let destroyed = false;
  /** Mesure anonyme : chaque outil compté au plus une fois par image (pas de suivi geste par geste). */
  const usedTools = new Set<string>();
  function useTool(tool: (typeof TOOLS)[number]): void {
    const key = `${current?.id ?? 0}:${tool}`;
    if (usedTools.has(key)) return;
    usedTools.add(key);
    track({ type: "tool_used", tool });
  }

  // ---------- Structure ----------
  const section = document.createElement("section");
  section.className = "result-panel editor";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "result-panel-title");

  const head = document.createElement("div");
  head.className = "editor-head";
  const title = document.createElement("h2");
  title.id = "result-panel-title";
  title.className = "result-title";
  title.textContent = r.title;
  const status = document.createElement("p");
  status.className = "result-status";
  status.setAttribute("role", "status");
  const undoButton = button(r.undo);
  const redoButton = button(r.redo);
  undoButton.setAttribute("aria-keyshortcuts", "Control+Z");
  redoButton.setAttribute("aria-keyshortcuts", "Control+Shift+Z");
  const historyBar = document.createElement("div");
  historyBar.className = "editor-history";
  historyBar.append(undoButton, redoButton);
  head.append(title, status, historyBar);

  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.className = "result-before-canvas";
  const canvas = document.createElement("canvas");
  canvas.className = "result-canvas";
  const compare = createCompareSlider({
    id: "result-compare-slider",
    label: r.compareLabel,
    beforeLabel: r.beforeLabel,
    afterLabel: r.afterLabel,
    before: beforeCanvas,
    after: canvas,
  });
  compare.element.classList.add("result-compare");
  compare.afterLayer.classList.add("checkerboard");

  const stage = document.createElement("div");
  stage.className = "editor-stage";
  stage.append(compare.element);

  // ---------- Onglets d'outils ----------
  const tools = document.createElement("div");
  tools.className = "editor-tools";
  const tablist = document.createElement("div");
  tablist.className = "editor-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", r.toolsLabel);
  const tabDefs: { id: TabId; label: string }[] = [
    { id: "cut", label: r.tabCut },
    { id: "background", label: r.tabBackground },
    { id: "effects", label: r.tabEffects },
    { id: "adjust", label: r.tabAdjust },
    { id: "formats", label: r.tabFormats },
  ];
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const panels = new Map<TabId, HTMLElement>();
  for (const def of tabDefs) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "editor-tab";
    tab.id = `editor-tab-${def.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `editor-panel-${def.id}`);
    tab.textContent = def.label;
    tab.addEventListener("click", () => selectTab(def.id));
    tablist.append(tab);
    tabButtons.set(def.id, tab);
    const panel = document.createElement("div");
    panel.className = "editor-panel";
    panel.id = `editor-panel-${def.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    panels.set(def.id, panel);
  }
  tablist.addEventListener("keydown", (event) => {
    const ids = tabDefs.map((d) => d.id);
    const active = ids.findIndex((id) => tabButtons.get(id) === document.activeElement);
    if (active < 0) return;
    let next = -1;
    if (event.key === "ArrowRight") next = (active + 1) % ids.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(ids[next]!);
    tabButtons.get(ids[next]!)!.focus();
  });
  function selectTab(id: TabId): void {
    for (const [tid, tab] of tabButtons) {
      const selected = tid === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels.get(tid)!.hidden = !selected;
    }
    section.dataset.tab = id;
    // Quitter "Découper" repasse en mode comparaison (le pinceau n'agit que dans son onglet).
    if (id !== "cut" && tool !== "compare") setTool("compare");
  }

  // Gestes → historique + rendu.
  const edit = {
    start: () => current?.beginSettingsChange(),
    render: () => scheduleRender(),
  };
  function change(mutate: (d: EditorDoc) => void): void {
    if (!current || current.status !== "done") return;
    current.beginSettingsChange();
    mutate(current);
    afterEdit();
  }
  function live(mutate: (d: EditorDoc) => void): void {
    if (!current || current.status !== "done") return;
    mutate(current);
    scheduleRender();
  }
  function afterEdit(): void {
    scheduleRender();
    updateHistoryButtons();
  }

  // --- Découper ---
  const cutPanel = panels.get("cut")!;
  const toolGroup = radioGroup<Tool>(
    "result-tool",
    r.touchUpLegend,
    [
      { value: "compare", label: r.toolCompare },
      { value: "erase", label: r.toolErase },
      { value: "restore", label: r.toolRestore },
    ],
    "compare",
    (value) => setTool(value),
  );
  const brush = rangeField(r.brushSize, 1, 100, 20, { onInput: () => undefined });
  const brushHint = document.createElement("p");
  brushHint.className = "editor-note";
  brushHint.textContent = r.brushHint;
  const resetMaskButton = button(r.resetEdits);
  resetMaskButton.addEventListener("click", () => {
    if (!current?.mask) return;
    current.resetMask();
    useTool("reset_mask");
    afterEdit();
  });
  toolGroup.fieldset.append(brush.root, brushHint, resetMaskButton);
  cutPanel.append(toolGroup.fieldset);

  function setTool(value: Tool): void {
    tool = value;
    toolGroup.set(value);
    const editing = value !== "compare";
    compare.setSliderEnabled(!editing);
    compare.setSplit(editing ? 0 : 50);
    section.dataset.tool = value;
  }

  // --- Arrière-plan ---
  const bgPanel = panels.get("background")!;
  const bgGroup = radioGroup<BackgroundSetting["kind"]>(
    "result-background",
    r.backgroundLegend,
    [
      { value: "transparent", label: r.backgroundTransparent },
      { value: "color", label: r.backgroundColor },
      { value: "photo", label: r.bgPhoto },
      { value: "blur", label: r.bgBlur },
    ],
    "transparent",
    (kind) => {
      change((d) => (d.settings.background = backgroundOfKind(kind)));
      useTool(kind === "photo" ? "background_photo" : kind === "blur" ? "background_blur" : "background");
    },
  );
  const color = colorField(r.backgroundColorPicker, prefs.recentColors[0] ?? "#5b4bff", {
    onStart: edit.start,
    onInput: (value) => live((d) => (d.settings.background = { kind: "color", color: value })),
    onCommit: (value) => {
      rememberColorPref(value);
      updateHistoryButtons();
    },
  });
  const whiteButton = button(r.backgroundWhite, "editor-swatch editor-swatch-white");
  whiteButton.addEventListener("click", () => change((d) => (d.settings.background = { kind: "color", color: "#ffffff" })));
  const swatches = document.createElement("div");
  swatches.className = "editor-swatches";
  swatches.setAttribute("aria-label", r.recentColors);
  swatches.setAttribute("role", "group");
  const colorRow = document.createElement("div");
  colorRow.className = "editor-row";
  colorRow.append(color.root, whiteButton, swatches);
  const photos = fieldset(r.photosLabel);
  const photoGrid = document.createElement("div");
  photoGrid.className = "editor-photos";
  const photoButtons = new Map<string, HTMLButtonElement>();
  for (const id of BACKGROUND_PHOTOS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "editor-photo";
    b.setAttribute("aria-pressed", "false");
    const img = document.createElement("img");
    img.src = `/backgrounds/${id}-thumb.webp`;
    img.alt = r.photoName(id);
    img.loading = "lazy";
    img.width = 160;
    img.height = 100;
    b.append(img);
    b.addEventListener("click", () => {
      change((d) => (d.settings.background = { kind: "photo", photoId: id }));
      useTool("background_photo");
    });
    photoGrid.append(b);
    photoButtons.set(id, b);
  }
  photos.append(photoGrid);
  const blur = rangeField(r.blurAmount, 1, 100, 40, {
    onStart: edit.start,
    onInput: (value) => live((d) => (d.settings.background = { kind: "blur", amount: value })),
    onCommit: () => updateHistoryButtons(),
  });
  bgGroup.fieldset.append(colorRow, blur.root);
  bgPanel.append(bgGroup.fieldset, photos);

  function backgroundOfKind(kind: BackgroundSetting["kind"]): BackgroundSetting {
    switch (kind) {
      case "transparent":
        return { kind };
      case "color":
        return { kind, color: safeColor(color.input.value, "#5b4bff") };
      case "photo":
        return { kind, photoId: BACKGROUND_PHOTOS[0] };
      case "blur":
        return { kind, amount: Number(blur.input.value) };
    }
  }
  function rememberColorPref(value: string): void {
    prefs = rememberColor(prefs, value);
    savePreferences(prefs);
    renderSwatches();
  }
  function renderSwatches(): void {
    swatches.replaceChildren(
      ...prefs.recentColors.map((c) => {
        const b = button("", "editor-swatch");
        b.style.backgroundColor = c;
        b.setAttribute("aria-label", r.useColor(c));
        b.addEventListener("click", () => change((d) => (d.settings.background = { kind: "color", color: c })));
        return b;
      }),
    );
  }
  renderSwatches();

  // --- Effets ---
  const fxPanel = panels.get("effects")!;
  const shadowSet = fieldset(r.shadow);
  const shadowOn = checkboxField(r.shadow, false, (on) => {
    change((d) => (d.settings.effects.shadow.enabled = on));
    if (on) useTool("shadow");
  });
  const shadowBlur = rangeField(r.shadowBlur, 0, 100, 30, { onStart: edit.start, onInput: (v) => live((d) => (d.settings.effects.shadow.blur = v)), onCommit: () => updateHistoryButtons() });
  const shadowOffset = rangeField(r.shadowOffset, 0, 100, 20, { onStart: edit.start, onInput: (v) => live((d) => (d.settings.effects.shadow.offset = v)), onCommit: () => updateHistoryButtons() });
  const shadowOpacity = rangeField(r.shadowOpacity, 0, 100, 45, { onStart: edit.start, onInput: (v) => live((d) => (d.settings.effects.shadow.opacity = v)), onCommit: () => updateHistoryButtons() });
  shadowSet.append(shadowOn.root, shadowBlur.root, shadowOffset.root, shadowOpacity.root);
  const outlineSet = fieldset(r.outline);
  const outlineOn = checkboxField(r.outline, false, (on) => {
    change((d) => (d.settings.effects.outline.enabled = on));
    if (on) useTool("outline");
  });
  const outlineWidth = rangeField(r.outlineWidth, 1, 60, 12, { onStart: edit.start, onInput: (v) => live((d) => (d.settings.effects.outline.width = v)), onCommit: () => updateHistoryButtons() });
  const outlineColor = colorField(r.outlineColor, "#ffffff", { onStart: edit.start, onInput: (v) => live((d) => (d.settings.effects.outline.color = v)), onCommit: () => updateHistoryButtons() });
  outlineSet.append(outlineOn.root, outlineWidth.root, outlineColor.root);
  fxPanel.append(shadowSet, outlineSet);

  // --- Ajuster ---
  const adjustPanel = panels.get("adjust")!;
  const adjustSet = fieldset(r.tabAdjust);
  const adjustKeys = ["brightness", "contrast", "saturation", "temperature"] as const;
  const adjustInputs = new Map<(typeof adjustKeys)[number], HTMLInputElement>();
  for (const key of adjustKeys) {
    const f = rangeField(r[key], -100, 100, 0, {
      onStart: edit.start,
      onInput: (v) => live((d) => (d.settings.adjust[key] = v)),
      onCommit: () => {
        updateHistoryButtons();
        useTool("adjust");
      },
    });
    adjustInputs.set(key, f.input);
    adjustSet.append(f.root);
  }
  const resetAdjust = button(r.resetAdjust);
  resetAdjust.addEventListener("click", () => change((d) => (d.settings.adjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 })));
  adjustSet.append(resetAdjust);
  adjustPanel.append(adjustSet);

  // --- Formats ---
  const formatsPanel = panels.get("formats")!;
  const framingGroup = radioGroup<"original" | "subject" | "preset">(
    "result-crop",
    r.sizeLegend,
    [
      { value: "original", label: r.cropOriginal },
      { value: "subject", label: r.cropSubject },
      { value: "preset", label: r.framingPreset },
    ],
    "original",
    (kind) =>
      change((d) => {
        if (kind === "original") d.settings.framing = { kind };
        else if (kind === "subject") {
          d.settings.framing = { kind, marginPercent: Number(margin.input.value) };
          useTool("crop");
        }
        else d.settings.framing = { kind, presetId: presetSelect.value, paddingPercent: Number(padding.input.value) };
      }),
  );
  const margin = rangeField(r.cropMargin, 0, 30, 5, {
    onStart: edit.start,
    onInput: (v) => live((d) => d.settings.framing.kind === "subject" && (d.settings.framing.marginPercent = v)),
    onCommit: () => updateHistoryButtons(),
  });
  const presetLabel = document.createElement("label");
  presetLabel.className = "editor-select";
  const presetText = document.createElement("span");
  presetText.textContent = r.presetChoice;
  const presetSelect = document.createElement("select");
  const groups = new Map<FormatPreset["group"], HTMLOptGroupElement>();
  for (const preset of FORMAT_PRESETS) {
    let group = groups.get(preset.group);
    if (!group) {
      group = document.createElement("optgroup");
      group.label = r.presetGroup(preset.group);
      groups.set(preset.group, group);
      presetSelect.append(group);
    }
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = r.presetName(preset.id, preset.width, preset.height);
    group.append(option);
  }
  presetSelect.value = prefs.favoritePresets[0] ?? FORMAT_PRESETS[0]!.id;
  presetSelect.addEventListener("change", () => {
    useTool("format_preset");
    prefs = rememberPreset(prefs, presetSelect.value);
    savePreferences(prefs);
    change((d) => (d.settings.framing = { kind: "preset", presetId: presetSelect.value, paddingPercent: Number(padding.input.value) }));
    framingGroup.set("preset");
    const preset = findPreset(presetSelect.value);
    // Places de marché : fond blanc proposé d'office si le fond est transparent.
    if (preset?.suggestWhite && current?.settings.background.kind === "transparent") {
      current.settings.background = { kind: "color", color: "#ffffff" };
      scheduleRender();
    }
  });
  presetLabel.append(presetText, presetSelect);
  const padding = rangeField(r.padding, 0, 40, 8, {
    onStart: edit.start,
    onInput: (v) => live((d) => d.settings.framing.kind === "preset" && (d.settings.framing.paddingPercent = v)),
    onCommit: () => updateHistoryButtons(),
  });
  const presetNote = document.createElement("p");
  presetNote.className = "editor-note";
  presetNote.textContent = r.presetNote;
  framingGroup.fieldset.append(margin.root, presetLabel, padding.root, presetNote);
  formatsPanel.append(framingGroup.fieldset);

  for (const def of tabDefs) tools.append(panels.get(def.id)!);
  tools.prepend(tablist);

  // ---------- Téléchargement ----------
  const downloadBar = document.createElement("div");
  downloadBar.className = "editor-download";
  const downloadButton = button(r.download, "btn btn-primary result-download");
  downloadButton.disabled = true;
  const optionsButton = button(r.downloadOptions, "btn btn-secondary editor-download-toggle");
  optionsButton.setAttribute("aria-expanded", "false");
  optionsButton.setAttribute("aria-controls", "editor-download-menu");
  const menu = document.createElement("div");
  menu.id = "editor-download-menu";
  menu.className = "editor-download-menu";
  menu.hidden = true;
  const formatGroup = radioGroup<ExportFormat>(
    "result-format",
    r.formatLegend,
    [
      { value: "png", label: r.formatPng },
      { value: "webp", label: r.formatWebp },
      { value: "jpg", label: r.formatJpg },
    ],
    exportFormat,
    (value) => {
      exportFormat = value;
      prefs = { ...prefs, exportFormat: value };
      savePreferences(prefs);
      updateSize();
    },
  );
  const sizeGroup = radioGroup<"original" | "reduced">(
    "result-size",
    r.sizeLegend,
    [
      { value: "original", label: r.sizeOriginal },
      { value: "reduced", label: r.sizeReduced },
    ],
    "original",
    (value) => {
      widthInput.disabled = value === "original";
      if (current) current.requestedWidth = value === "original" ? null : readWidth();
      if (value === "reduced") widthInput.focus();
      updateSize();
    },
  );
  const widthLabel = document.createElement("label");
  widthLabel.className = "result-width";
  const widthText = document.createElement("span");
  widthText.textContent = r.outputWidth;
  const widthInput = document.createElement("input");
  widthInput.type = "number";
  widthInput.min = "16";
  widthInput.step = "1";
  widthInput.inputMode = "numeric";
  widthInput.disabled = true;
  widthLabel.append(widthText, widthInput);
  widthInput.addEventListener("input", () => {
    if (current) current.requestedWidth = readWidth();
    updateSize();
  });
  function readWidth(): number | null {
    const v = widthInput.value.trim();
    return v === "" ? null : Number(v);
  }
  sizeGroup.fieldset.append(widthLabel);
  const zipButton = button(r.downloadAll(0), "btn btn-secondary editor-zip");
  zipButton.hidden = true;
  menu.append(formatGroup.fieldset, sizeGroup.fieldset, zipButton);
  optionsButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    optionsButton.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.hidden = true;
      optionsButton.setAttribute("aria-expanded", "false");
      optionsButton.focus();
    }
  });
  const size = document.createElement("p");
  size.className = "result-size";
  const newImageButton = button(r.newImage, "btn btn-secondary result-new");
  newImageButton.addEventListener("click", () => onNewImage());
  const actions = document.createElement("div");
  actions.className = "result-actions";
  actions.append(downloadButton, optionsButton, newImageButton);
  downloadBar.append(size, actions, menu);
  tools.append(downloadBar);

  // ---------- Bande de miniatures ----------
  const strip = document.createElement("div");
  strip.className = "editor-strip";
  const stripTitle = document.createElement("h3");
  stripTitle.className = "sr-only";
  stripTitle.textContent = r.imagesLabel;
  const stripList = document.createElement("ul");
  stripList.className = "editor-strip-list";
  stripList.setAttribute("aria-label", r.imagesLabel);
  const addInput = document.createElement("input");
  addInput.type = "file";
  addInput.accept = ACCEPTED_MIME;
  addInput.multiple = true;
  addInput.className = "sr-only";
  addInput.tabIndex = -1;
  addInput.setAttribute("aria-hidden", "true");
  addInput.setAttribute("data-testid", "editor-add-input");
  const addButton = button("+", "editor-add");
  addButton.setAttribute("aria-label", r.addImages);
  addButton.title = r.addImages;
  addButton.addEventListener("click", () => addInput.click());
  addInput.addEventListener("change", () => {
    const files = Array.from(addInput.files ?? []);
    addInput.value = "";
    void addFiles(files);
  });
  strip.append(stripTitle, stripList, addButton, addInput);

  const hint = document.createElement("p");
  hint.className = "editor-note editor-shortcuts";
  hint.textContent = r.shortcutsHint;

  const body = document.createElement("div");
  body.className = "editor-body";
  body.append(stage, tools);
  section.append(head, body, strip, hint);
  selectTab("cut");

  // ---------- Rendu ----------
  const photoCache = new Map<string, Promise<ImageBitmap | null>>();
  function loadPhoto(id: string): Promise<ImageBitmap | null> {
    let p = photoCache.get(id);
    if (!p) {
      p = fetch(`/backgrounds/${id}.webp`)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then((blob) => createImageBitmap(blob))
        .catch(() => null);
      photoCache.set(id, p);
    }
    return p;
  }

  function geometryFor(doc: EditorDoc, requestedWidth: number | null): OutputGeometry | null {
    if (!doc.image) return null;
    return computeGeometry(doc.image.width, doc.image.height, doc.settings.framing, doc.subject(), requestedWidth);
  }

  let renderQueued = false;
  function scheduleRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      void renderPreview();
    });
  }

  let previewGeometry: OutputGeometry | null = null;
  async function renderPreview(): Promise<void> {
    const doc = current;
    if (!doc?.image || !doc.mask || doc.status !== "done") return;
    const full = geometryFor(doc, null)!;
    const factor = Math.min(1, PREVIEW_MAX_SIDE / Math.max(full.canvasWidth, full.canvasHeight));
    const g = scaleGeometry(full, factor);
    const bg = doc.settings.background;
    const photo = bg.kind === "photo" ? await loadPhoto(bg.photoId) : null;
    if (doc !== current) return;
    const composite = renderComposite({ image: doc.image, mask: doc.mask, settings: doc.settings, backgroundPhoto: photo }, g);
    previewGeometry = g;
    draw(canvas, composite, g.canvasWidth, g.canvasHeight);
    // "Avant" : même cadrage, image d'origine (comparaison alignée).
    const before = new OffscreenCanvas(g.canvasWidth, g.canvasHeight);
    const bctx = before.getContext("2d")!;
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, g.canvasWidth, g.canvasHeight);
    bctx.drawImage(doc.image, g.source.x, g.source.y, g.source.width, g.source.height, g.dest.x, g.dest.y, g.dest.width, g.dest.height);
    draw(beforeCanvas, before, g.canvasWidth, g.canvasHeight);
    compare.afterLayer.classList.toggle("checkerboard", bg.kind === "transparent");
    section.dataset.background = bg.kind;
    syncControls(doc);
    updateSize();
    section.dataset.state = "done";
  }

  function draw(target: HTMLCanvasElement, source: CanvasImageSource, w: number, h: number): void {
    if (target.width !== w) target.width = w;
    if (target.height !== h) target.height = h;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
  }

  function updateSize(): void {
    const doc = current;
    if (!doc?.image || doc.status !== "done") return;
    const g = geometryFor(doc, doc.settings.framing.kind === "preset" ? null : doc.requestedWidth)!;
    widthInput.max = String(g.source.width);
    widthInput.placeholder = String(geometryFor(doc, null)!.canvasWidth);
    const isOriginal = g.canvasWidth === doc.image.width && g.canvasHeight === doc.image.height;
    size.textContent = isOriginal ? r.downloadSize(g.canvasWidth, g.canvasHeight) : r.outputSize(g.canvasWidth, g.canvasHeight);
    section.dataset.outWidth = String(g.canvasWidth);
    section.dataset.outHeight = String(g.canvasHeight);
    sizeGroup.fieldset.disabled = doc.settings.framing.kind === "preset";
  }

  /** Remet les contrôles dans l'état des réglages de l'image affichée. */
  function syncControls(doc: EditorDoc): void {
    const s = doc.settings;
    bgGroup.set(s.background.kind);
    if (s.background.kind === "color") color.input.value = s.background.color;
    if (s.background.kind === "blur") setRange(blur.input, s.background.amount);
    for (const [id, b] of photoButtons) b.setAttribute("aria-pressed", String(s.background.kind === "photo" && s.background.photoId === id));
    shadowOn.input.checked = s.effects.shadow.enabled;
    setRange(shadowBlur.input, s.effects.shadow.blur);
    setRange(shadowOffset.input, s.effects.shadow.offset);
    setRange(shadowOpacity.input, s.effects.shadow.opacity);
    outlineOn.input.checked = s.effects.outline.enabled;
    setRange(outlineWidth.input, s.effects.outline.width);
    outlineColor.input.value = s.effects.outline.color;
    for (const key of adjustKeys) setRange(adjustInputs.get(key)!, s.adjust[key]);
    framingGroup.set(s.framing.kind);
    margin.input.disabled = s.framing.kind !== "subject";
    // Le choix de format reste actif : choisir un format bascule le cadrage en "prêt à l'emploi".
    padding.input.disabled = s.framing.kind !== "preset";
    if (s.framing.kind === "subject") setRange(margin.input, s.framing.marginPercent);
    if (s.framing.kind === "preset") {
      presetSelect.value = s.framing.presetId;
      setRange(padding.input, s.framing.paddingPercent);
    }
    sizeGroup.set(doc.requestedWidth === null ? "original" : "reduced");
    widthInput.disabled = doc.requestedWidth === null;
    widthInput.value = doc.requestedWidth === null ? "" : String(doc.requestedWidth);
    updateHistoryButtons();
  }

  function updateHistoryButtons(): void {
    undoButton.disabled = !current?.canUndo;
    redoButton.disabled = !current?.canRedo;
  }

  undoButton.addEventListener("click", () => {
    if (current?.undo()) {
      afterEdit();
      useTool("undo");
    }
  });
  redoButton.addEventListener("click", () => {
    if (current?.redo()) {
      afterEdit();
      useTool("redo");
    }
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (section.hidden || !(event.ctrlKey || event.metaKey)) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" && (target as HTMLInputElement).type === "number")) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undoButton.click();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      redoButton.click();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  // ---------- Pinceau (gomme / restaurer) ----------
  let stroke: { last: { x: number; y: number } } | null = null;
  function maskPointFor(event: PointerEvent): { x: number; y: number } | null {
    const doc = current;
    const g = previewGeometry;
    if (!doc?.mask || !doc.image || !g) return null;
    const box = canvas.getBoundingClientRect();
    const shown = containedRect({ x: box.left, y: box.top, width: box.width, height: box.height }, canvas.width, canvas.height);
    const cx = ((event.clientX - shown.x) / shown.width) * g.canvasWidth;
    const cy = ((event.clientY - shown.y) / shown.height) * g.canvasHeight;
    const u = (cx - g.dest.x) / g.dest.width;
    const v = (cy - g.dest.y) / g.dest.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const ix = g.source.x + u * g.source.width;
    const iy = g.source.y + v * g.source.height;
    return { x: (ix / doc.image.width) * doc.mask.width, y: (iy / doc.image.height) * doc.mask.height };
  }
  function paintTo(point: { x: number; y: number }, from: { x: number; y: number }): void {
    const doc = current;
    if (!doc?.mask || tool === "compare") return;
    const ctx = doc.mask.getContext("2d");
    if (!ctx) return;
    paintStroke(ctx, from, point, brushRadius(Number(brush.input.value), doc.mask.width, doc.mask.height), tool);
    scheduleRender();
  }
  compare.element.addEventListener("pointerdown", (event) => {
    if (tool === "compare" || current?.status !== "done") return;
    const point = maskPointFor(event);
    if (!point) return;
    event.preventDefault();
    compare.element.setPointerCapture(event.pointerId);
    void current.beginMaskChange();
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
    if (!stroke || !current) return;
    stroke = null;
    const doc = current;
    void doc.endMaskChange().then(() => {
      section.dataset.edits = String(Number(section.dataset.edits ?? 0) + 1);
      if (tool !== "compare") useTool(tool);
      if (doc === current) afterEdit();
    });
  };
  compare.element.addEventListener("pointerup", endStroke);
  compare.element.addEventListener("pointercancel", endStroke);

  // ---------- Export ----------
  async function exportDoc(doc: EditorDoc, format: ExportFormat): Promise<Blob> {
    const g = geometryFor(doc, doc.settings.framing.kind === "preset" ? null : doc.requestedWidth)!;
    const bg = doc.settings.background;
    const photo = bg.kind === "photo" ? await loadPhoto(bg.photoId) : null;
    const composite = renderComposite({ image: doc.image!, mask: doc.mask!, settings: doc.settings, backgroundPhoto: photo }, g);
    return exportCanvas(composite, format, { kind: "transparent" });
  }
  function save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  downloadButton.addEventListener("click", async () => {
    const doc = current;
    if (!doc || doc.status !== "done") return;
    downloadButton.disabled = true;
    try {
      save(await exportDoc(doc, exportFormat), exportFileName(doc.name, exportFormat));
      const out = geometryFor(doc, doc.settings.framing.kind === "preset" ? null : doc.requestedWidth)!;
      track({ type: "download", format: exportFormat, size: sizeBucket(out.canvasWidth, out.canvasHeight) });
    } finally {
      downloadButton.disabled = false;
    }
  });
  zipButton.addEventListener("click", async () => {
    const ready = docs.filter((d) => d.status === "done");
    if (ready.length === 0) return;
    zipButton.disabled = true;
    try {
      const names = uniqueNames(ready.map((d) => exportFileName(d.name, exportFormat)));
      const entries = [];
      for (const [i, doc] of ready.entries()) {
        entries.push({ name: names[i]!, data: new Uint8Array(await (await exportDoc(doc, exportFormat)).arrayBuffer()) });
      }
      save(new Blob([createZip(entries)], { type: "application/zip" }), "cutova-images.zip");
      track({ type: "batch_zip", format: exportFormat });
      status.textContent = r.zipReady(ready.length);
    } finally {
      zipButton.disabled = false;
    }
  });

  // ---------- Lot d'images ----------
  function renderStrip(): void {
    stripList.replaceChildren(
      ...docs.map((doc) => {
        const li = document.createElement("li");
        li.className = "editor-thumb";
        li.dataset.status = doc.status;
        if (doc === current) li.classList.add("is-current");
        const open = document.createElement("button");
        open.type = "button";
        open.className = "editor-thumb-open";
        open.setAttribute("aria-label", r.openImage(doc.name));
        if (doc === current) open.setAttribute("aria-current", "true");
        const img = document.createElement("img");
        img.src = doc.thumbnailUrl;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        open.append(img);
        open.addEventListener("click", () => show(doc));
        const remove = button("×", "editor-thumb-remove");
        remove.setAttribute("aria-label", r.removeImage(doc.name));
        remove.addEventListener("click", () => removeDoc(doc));
        li.append(open, remove);
        return li;
      }),
    );
    const ready = docs.filter((d) => d.status === "done").length;
    zipButton.hidden = docs.length < 2;
    zipButton.textContent = r.downloadAll(ready);
    zipButton.disabled = ready === 0;
  }

  function show(doc: EditorDoc): void {
    current = doc;
    // "done" n'est posé qu'une fois l'aperçu réellement dessiné (renderPreview) : les tests et
    // outils qui lisent le canevas ne voient jamais l'original encore affiché.
    section.dataset.state = doc.status === "queued" || doc.status === "processing" ? "running" : doc.status === "done" ? "rendering" : doc.status;
    if (doc.status === "done") {
      section.dataset.engine = doc.engine;
      section.dataset.elapsedMs = String(Math.round(doc.elapsedMs));
      section.dataset.refineMs = String(Math.round(doc.refineMs));
      section.dataset.width = String(doc.image!.width);
      section.dataset.height = String(doc.image!.height);
      status.textContent = r.processingTime(doc.elapsedMs + doc.refineMs);
      downloadButton.disabled = false;
      scheduleRender();
    } else {
      for (const k of ["engine", "elapsedMs", "refineMs", "width", "height", "outWidth", "outHeight"]) delete section.dataset[k];
      downloadButton.disabled = true;
      status.textContent = doc.status === "error" ? doc.errorMessage || r.error : doc.status === "queued" ? r.queued : r.running;
      void showOriginal(doc);
    }
    updateHistoryButtons();
    renderStrip();
  }

  /** Pendant le traitement : l'original des deux côtés. */
  async function showOriginal(doc: EditorDoc): Promise<void> {
    try {
      const bitmap = await createImageBitmap(doc.file, { resizeWidth: 800, resizeQuality: "medium" });
      if (doc !== current) return bitmap.close();
      const h = Math.round((bitmap.height / bitmap.width) * 800);
      draw(beforeCanvas, bitmap, 800, h);
      draw(canvas, bitmap, 800, h);
      bitmap.close();
    } catch {
      // aperçu impossible : le message d'état suffit
    }
  }

  function removeDoc(doc: EditorDoc): void {
    const index = docs.indexOf(doc);
    if (index < 0) return;
    docs.splice(index, 1);
    doc.dispose();
    if (docs.length === 0) {
      onNewImage();
      return;
    }
    if (doc === current) show(docs[Math.min(index, docs.length - 1)]!);
    else renderStrip();
  }

  function addDoc(file: File, resizeTo?: { width: number; height: number }): void {
    const doc = new EditorDoc(file, resizeTo);
    doc.thumbnailUrl = URL.createObjectURL(file);
    docs.push(doc);
    section.hidden = false;
    section.dataset.run = String(Number(section.dataset.run ?? 0) + 1);
    show(doc);
    if (docs.length === 1) section.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    void processQueue();
  }

  async function addFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const result = await validateImage(file);
      if (!result.ok) {
        status.textContent = messageForError(result.error, dict);
        continue;
      }
      addDoc(file, result.resizeTo);
    }
  }

  // ---------- File de traitement (une image à la fois, dans le worker) ----------
  let processing = false;
  const unsubscribeProgress = inferenceEngine.onProgress(({ loaded, total }) => {
    if (current?.status !== "processing") return;
    status.textContent = total > 0 ? r.loadingModel(Math.round((loaded / total) * 100)) : r.preparingModel;
  });

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
      let doc: EditorDoc | undefined;
      while (!destroyed && (doc = docs.find((d) => d.status === "queued"))) await processDoc(doc);
    } finally {
      processing = false;
    }
  }

  async function processDoc(doc: EditorDoc): Promise<void> {
    doc.status = "processing";
    if (doc === current) show(doc);
    let image: ImageBitmap | null = null;
    try {
      const resize = doc.resizeTo ? { resizeWidth: doc.resizeTo.width, resizeHeight: doc.resizeTo.height, resizeQuality: "high" as const } : {};
      const [full, input] = await Promise.all([
        createImageBitmap(doc.file, resize),
        createImageBitmap(doc.file, { resizeWidth: MODEL_INPUT_SIZE, resizeHeight: MODEL_INPUT_SIZE, resizeQuality: "high" }),
      ]);
      image = full;
      if (doc === current) status.textContent = r.running;
      const result = await inferenceEngine.run(input);
      if (doc === current) status.textContent = r.finishing;
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const built = buildCutout(full, result.mask, result.width, result.height);
      if (!docs.includes(doc)) return full.close();
      await doc.setResult(full, built.mask);
      image = null;
      doc.engine = result.engine;
      doc.elapsedMs = result.elapsedMs;
      doc.refineMs = built.refineMs;
      doc.status = "done";
      const family = result.engine.startsWith("webgpu") ? "webgpu" : "wasm";
      track({
        type: "cutout_done",
        engine: family,
        model: getModelForEngine(family).id,
        time: timeBucket(result.elapsedMs + built.refineMs),
        size: sizeBucket(full.width, full.height),
      });
      if (doc === current) {
        show(doc);
        reveal();
      } else renderStrip();
    } catch (err) {
      track({ type: "cutout_failed", ...(image ? { size: sizeBucket(image.width, image.height) } : {}) });
      image?.close();
      doc.status = "error";
      doc.errorMessage = r.error;
      console.warn("[cutova] Détourage échoué", err);
      if (doc === current) show(doc);
      else renderStrip();
    }
  }

  /** Révélation animée du détourage (désactivée si "réduire les animations"). */
  function reveal(): void {
    if (prefersReducedMotion() || tool !== "compare") return;
    const start = performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      compare.setSplit(100 - 50 * eased);
      if (t < 1 && !destroyed) requestAnimationFrame(step);
    };
    compare.setSplit(100);
    requestAnimationFrame(step);
  }

  function onImageSelected(event: Event): void {
    const detail = (event as CustomEvent<ImageSelectedDetail>).detail;
    addDoc(detail.file, detail.resizeTo);
  }
  window.addEventListener(IMAGE_SELECTED_EVENT, onImageSelected);

  function destroy(): void {
    destroyed = true;
    window.removeEventListener(IMAGE_SELECTED_EVENT, onImageSelected);
    document.removeEventListener("keydown", onKeyDown);
    unsubscribeProgress();
    for (const doc of docs) doc.dispose();
    docs.length = 0;
  }

  return { element: section, destroy };
}
