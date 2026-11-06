/**
 * Rendu final d'une image éditée (navigateur) : fond (transparent, couleur, photo, flou de l'image
 * d'origine), sujet détouré avec ajustements de couleur, contour "sticker" et ombre portée.
 * La même fonction sert à l'aperçu (géométrie réduite) et à l'export (géométrie pleine taille) :
 * l'aperçu montre exactement ce qui sera téléchargé.
 */
import { composeCutout } from "../postprocess/cutout.ts";
import { applyAdjustments } from "./adjust.ts";
import type { OutputGeometry } from "./geometry.ts";
import { isNeutralAdjust, safeColor, type EditSettings } from "./settings.ts";

export interface RenderInputs {
  image: ImageBitmap;
  mask: OffscreenCanvas;
  settings: EditSettings;
  /** Photo de fond déjà décodée (si `background.kind === "photo"`). */
  backgroundPhoto?: ImageBitmap | null;
}

function ctx2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D indisponible");
  return ctx;
}

/** Dessine `source` en "cover" (remplit tout le canevas, recadre ce qui dépasse). */
function drawCover(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, width: number, height: number): void {
  const scale = Math.max(width / sw, height / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
}

/**
 * Flou portable (sans `ctx.filter`, absent de certains navigateurs) : réduction puis agrandissement
 * lissé, deux passes. `amount` 1–100 → facteur de réduction 4 à 40.
 */
function blurredCover(image: ImageBitmap, region: OutputGeometry["source"], width: number, height: number, amount: number): OffscreenCanvas {
  const factor = 4 + (Math.max(1, Math.min(100, amount)) / 100) * 36;
  const smallW = Math.max(2, Math.round(width / factor));
  const smallH = Math.max(2, Math.round(height / factor));
  const small = new OffscreenCanvas(smallW, smallH);
  const sctx = ctx2d(small);
  sctx.imageSmoothingQuality = "high";
  const scale = Math.max(smallW / region.width, smallH / region.height);
  const w = region.width * scale;
  const h = region.height * scale;
  sctx.drawImage(image, region.x, region.y, region.width, region.height, (smallW - w) / 2, (smallH - h) / 2, w, h);
  const tiny = new OffscreenCanvas(Math.max(1, Math.round(smallW / 2)), Math.max(1, Math.round(smallH / 2)));
  const tctx = ctx2d(tiny);
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(small, 0, 0, tiny.width, tiny.height);
  const out = new OffscreenCanvas(width, height);
  const octx = ctx2d(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(tiny, 0, 0, width, height);
  return out;
}

/** Silhouette du sujet élargie de `width` px, remplie de `color` (contour "sticker"). */
function outlineLayer(subject: OffscreenCanvas, width: number, color: string, canvasW: number, canvasH: number, x: number, y: number): OffscreenCanvas {
  const layer = new OffscreenCanvas(canvasW, canvasH);
  const ctx = ctx2d(layer);
  const steps = Math.max(16, Math.min(48, Math.round(width * 2)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(subject, x + Math.cos(a) * width, y + Math.sin(a) * width);
  }
  ctx.drawImage(subject, x, y);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasW, canvasH);
  return layer;
}

export function renderComposite({ image, mask, settings, backgroundPhoto }: RenderInputs, geometry: OutputGeometry): OffscreenCanvas {
  const { canvasWidth: W, canvasHeight: H, dest, source } = geometry;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Fond.
  const bg = settings.background;
  if (bg.kind === "color") {
    ctx.fillStyle = safeColor(bg.color);
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "photo" && backgroundPhoto) {
    drawCover(ctx, backgroundPhoto, backgroundPhoto.width, backgroundPhoto.height, W, H);
  } else if (bg.kind === "blur") {
    ctx.drawImage(blurredCover(image, source, W, H, bg.amount), 0, 0);
  }

  // 2. Sujet détouré à sa taille finale, ajusté.
  const dw = Math.max(1, Math.round(dest.width));
  const dh = Math.max(1, Math.round(dest.height));
  const subject = composeCutout(image, mask, dw, dh, source);
  if (!isNeutralAdjust(settings.adjust)) {
    const sctx = ctx2d(subject);
    const data = sctx.getImageData(0, 0, dw, dh);
    applyAdjustments(data.data, settings.adjust);
    sctx.putImageData(data, 0, 0);
  }

  // Effets proportionnels à la taille du sujet (valeurs "pour 1000 px") : aperçu = export.
  const unit = Math.max(dw, dh) / 1000;
  const { shadow, outline } = settings.effects;
  const sticker = outline.enabled && outline.width > 0 ? outlineLayer(subject, outline.width * unit, safeColor(outline.color), W, H, dest.x, dest.y) : null;

  // 3. Ombre portée (de l'autocollant si contour, sinon du sujet), puis sujet.
  if (shadow.enabled) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${Math.max(0, Math.min(100, shadow.opacity)) / 100})`;
    ctx.shadowBlur = shadow.blur * unit;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadow.offset * unit;
    if (sticker) ctx.drawImage(sticker, 0, 0);
    else ctx.drawImage(subject, dest.x, dest.y);
    ctx.restore();
  }
  if (sticker) ctx.drawImage(sticker, 0, 0);
  ctx.drawImage(subject, dest.x, dest.y);
  return canvas;
}
