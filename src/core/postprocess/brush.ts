/**
 * Gomme / restauration du masque. Le masque est un canvas (canal alpha) à la résolution de travail
 * (voir cutout.ts) : effacer = peindre en "destination-out" (alpha → 0), restaurer = peindre opaque
 * en "source-over" (alpha → 255). Coordonnées et tailles : fonctions pures, testées.
 */

export type BrushMode = "erase" | "restore";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Zone réellement occupée par l'image dans un élément affiché en `object-fit: contain`
 * (l'élément peut être plus large ou plus haut que l'image : bandes vides).
 */
export function containedRect(element: Rect, imageWidth: number, imageHeight: number): Rect {
  const scale = Math.min(element.width / imageWidth, element.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: element.x + (element.width - width) / 2, y: element.y + (element.height - height) / 2, width, height };
}

/** Point écran → point du masque (`maskWidth`×`maskHeight`), ou `null` hors de l'image. */
export function toMaskPoint(clientX: number, clientY: number, image: Rect, maskWidth: number, maskHeight: number): { x: number; y: number } | null {
  const u = (clientX - image.x) / image.width;
  const v = (clientY - image.y) / image.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x: u * maskWidth, y: v * maskHeight };
}

/** Taille du pinceau : curseur 1–100 → rayon de 0,5 % à 10 % du plus grand côté du masque. */
export function brushRadius(size: number, maskWidth: number, maskHeight: number): number {
  const clamped = Math.min(100, Math.max(1, size));
  const fraction = 0.005 + ((clamped - 1) / 99) * 0.095;
  return Math.max(1, fraction * Math.max(maskWidth, maskHeight));
}

/** Peint un segment (ou un point si `from` = `to`) sur le masque. */
export function paintStroke(
  ctx: OffscreenCanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  mode: BrushMode,
): void {
  ctx.save();
  ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = radius * 2;
  ctx.beginPath();
  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Historique d'annulation : un instantané du masque avant chaque coup de pinceau. */
export class MaskHistory {
  private readonly snapshots: ImageBitmap[] = [];
  private readonly limit: number;

  constructor(limit = 20) {
    this.limit = limit;
  }

  get size(): number {
    return this.snapshots.length;
  }

  async push(mask: OffscreenCanvas): Promise<void> {
    this.snapshots.push(await createImageBitmap(mask));
    while (this.snapshots.length > this.limit) this.snapshots.shift()?.close();
  }

  /** Remet le masque dans l'état du dernier instantané. `false` s'il n'y a rien à annuler. */
  undo(mask: OffscreenCanvas): boolean {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return false;
    const ctx = mask.getContext("2d");
    if (!ctx) return false;
    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(snapshot, 0, 0);
    ctx.restore();
    snapshot.close();
    return true;
  }

  clear(): void {
    for (const s of this.snapshots) s.close();
    this.snapshots.length = 0;
  }
}
