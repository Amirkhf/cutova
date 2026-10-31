/**
 * Panneau de résultat TEMPORAIRE : composite le masque sur un aperçu 1024×1024 (la même
 * résolution que le modèle), affiché sur damier. L'étape suivante remplacera cet aperçu
 * par le pipeline pleine résolution + exports (voir context.md > Prochaine étape).
 * Entièrement découplé de l'accueil : s'abonne lui-même à `image:selected`.
 */
import type { Dictionary } from "../../i18n/index.ts";
import { inferenceEngine } from "../../core/inference/engine-client.ts";
import { MODEL_INPUT_SIZE } from "../../core/model/model-source.ts";
import { IMAGE_SELECTED_EVENT, type ImageSelectedDetail } from "../home/events.ts";

export interface ResultPanelHandle {
  element: HTMLElement;
  destroy: () => void;
}

export function renderResultPanel(dict: Dictionary): ResultPanelHandle {
  const section = document.createElement("section");
  section.className = "result-panel";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "result-panel-title");

  const title = document.createElement("h2");
  title.id = "result-panel-title";
  title.className = "sr-only";
  title.textContent = dict.result.provisionalBadge;

  const badge = document.createElement("p");
  badge.className = "result-badge";
  badge.textContent = dict.result.provisionalBadge;

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "result-canvas-wrap checkerboard";

  const canvas = document.createElement("canvas");
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  canvas.className = "result-canvas";

  const status = document.createElement("p");
  status.className = "result-status";
  status.setAttribute("role", "status");

  canvasWrap.append(canvas);
  section.append(title, badge, canvasWrap, status);

  const unsubscribeProgress = inferenceEngine.onProgress(({ loaded, total }) => {
    status.textContent = total > 0 ? dict.result.loadingModel(Math.round((loaded / total) * 100)) : dict.result.preparingModel;
  });

  function applyMask(ctx: CanvasRenderingContext2D, mask: Uint8Array, width: number, height: number): void {
    const maskImageData = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      maskImageData.data[i * 4 + 3] = mask[i]!;
    }
    const maskCanvas = new OffscreenCanvas(width, height);
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.putImageData(maskImageData, 0, 0);

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  async function showFile(file: File): Promise<void> {
    section.hidden = false;
    status.textContent = dict.result.preparingModel;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let previewBitmap: ImageBitmap;
    let inferenceBitmap: ImageBitmap;
    try {
      // Même résolution que le modèle (1024×1024, étirée comme `preprocessor_config.json`
      // le fait) : décodage sûr quelle que soit la résolution d'origine, sans jamais
      // matérialiser un bitmap pleine taille pour ce simple aperçu provisoire.
      const resizeOptions: ImageBitmapOptions = {
        resizeWidth: MODEL_INPUT_SIZE,
        resizeHeight: MODEL_INPUT_SIZE,
        resizeQuality: "high",
      };
      [previewBitmap, inferenceBitmap] = await Promise.all([
        createImageBitmap(file, resizeOptions),
        createImageBitmap(file, resizeOptions),
      ]);
    } catch {
      status.textContent = dict.result.error;
      return;
    }

    ctx.clearRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    ctx.drawImage(previewBitmap, 0, 0);
    previewBitmap.close();

    status.textContent = dict.result.running;
    try {
      const result = await inferenceEngine.run(inferenceBitmap);
      applyMask(ctx, result.mask, result.width, result.height);
      status.textContent = dict.result.processingTime(result.elapsedMs);
    } catch {
      status.textContent = dict.result.error;
    }
  }

  function onImageSelected(event: Event): void {
    const detail = (event as CustomEvent<ImageSelectedDetail>).detail;
    void showFile(detail.file);
  }
  window.addEventListener(IMAGE_SELECTED_EVENT, onImageSelected);

  function destroy(): void {
    window.removeEventListener(IMAGE_SELECTED_EVENT, onImageSelected);
    unsubscribeProgress();
  }

  return { element: section, destroy };
}
