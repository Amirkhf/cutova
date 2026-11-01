/**
 * Une image du lot dans l'éditeur : fichier, état du traitement, image décodée, masque éditable,
 * réglages, historique annuler/rétablir (réglages + masque). Chaque image garde ses réglages.
 */
import { UndoHistory } from "../../core/editor/history.ts";
import { cloneSettings, defaultSettings, type EditSettings } from "../../core/editor/settings.ts";
import { scaleRegion, subjectBounds, type Region } from "../../core/postprocess/crop.ts";

export type DocStatus = "queued" | "processing" | "done" | "error";

interface DocState {
  settings: EditSettings;
  /** Instantané du masque (partagé entre états tant qu'il n'a pas changé). */
  mask: ImageBitmap;
}

let nextId = 1;

export class EditorDoc {
  readonly id = nextId++;
  readonly file: File;
  readonly resizeTo?: { width: number; height: number };
  status: DocStatus = "queued";
  errorMessage = "";
  engine = "";
  elapsedMs = 0;
  refineMs = 0;
  image: ImageBitmap | null = null;
  mask: OffscreenCanvas | null = null;
  settings: EditSettings = defaultSettings();
  thumbnailUrl = "";
  /** Largeur d'export demandée (null = taille naturelle). */
  requestedWidth: number | null = null;
  private maskSnapshot: ImageBitmap | null = null;
  private initialMask: ImageBitmap | null = null;
  private cachedSubject: Region | null | undefined;
  private readonly history: UndoHistory<DocState>;

  constructor(file: File, resizeTo?: { width: number; height: number }) {
    this.file = file;
    this.resizeTo = resizeTo;
    this.history = new UndoHistory<DocState>(30, (state) => this.releaseSnapshot(state.mask));
  }

  get name(): string {
    return this.file.name || "image";
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  async setResult(image: ImageBitmap, mask: OffscreenCanvas): Promise<void> {
    this.image = image;
    this.mask = mask;
    this.initialMask = await createImageBitmap(mask);
    this.maskSnapshot = this.initialMask;
    this.cachedSubject = undefined;
  }

  /** Boîte du sujet en pixels de l'image (recalculée seulement quand le masque change). */
  subject(): Region | null {
    if (this.cachedSubject !== undefined) return this.cachedSubject;
    if (!this.image || !this.mask) return null;
    const data = this.mask.getContext("2d")?.getImageData(0, 0, this.mask.width, this.mask.height).data;
    const bounds = data ? subjectBounds(data, this.mask.width, this.mask.height, { stride: 4, offset: 3 }) : null;
    this.cachedSubject = bounds ? scaleRegion(bounds, this.mask.width, this.mask.height, this.image.width, this.image.height) : null;
    return this.cachedSubject;
  }

  /** À appeler AVANT de modifier les réglages : rend la modification annulable. */
  beginSettingsChange(): void {
    if (!this.maskSnapshot) return;
    this.history.record({ settings: cloneSettings(this.settings), mask: this.maskSnapshot });
  }

  /** À appeler AVANT un coup de pinceau (instantané synchrone du masque courant). */
  async beginMaskChange(): Promise<void> {
    if (!this.maskSnapshot || !this.mask) return;
    this.history.record({ settings: cloneSettings(this.settings), mask: this.maskSnapshot });
    this.maskSnapshot = null; // sera recalculé à la fin du trait
  }

  /** Fin d'un coup de pinceau : nouvel instantané, boîte du sujet à recalculer. */
  async endMaskChange(): Promise<void> {
    if (!this.mask) return;
    this.maskSnapshot = await createImageBitmap(this.mask);
    this.cachedSubject = undefined;
  }

  undo(): boolean {
    return this.apply(this.history.undo(this.currentState()));
  }

  redo(): boolean {
    return this.apply(this.history.redo(this.currentState()));
  }

  /** Revient au masque d'origine (annulable). */
  resetMask(): void {
    if (!this.initialMask || !this.mask || !this.maskSnapshot) return;
    this.history.record({ settings: cloneSettings(this.settings), mask: this.maskSnapshot });
    this.drawMask(this.initialMask);
    this.maskSnapshot = this.initialMask;
  }

  dispose(): void {
    this.history.clear();
    for (const bitmap of [this.maskSnapshot, this.initialMask, this.image]) bitmap?.close();
    this.maskSnapshot = this.initialMask = this.image = null;
    if (this.thumbnailUrl) URL.revokeObjectURL(this.thumbnailUrl);
  }

  private currentState(): DocState {
    return { settings: cloneSettings(this.settings), mask: this.maskSnapshot! };
  }

  private apply(state: DocState | null): boolean {
    if (!state) return false;
    this.settings = state.settings;
    if (state.mask !== this.maskSnapshot) {
      this.drawMask(state.mask);
      this.maskSnapshot = state.mask;
    }
    return true;
  }

  private drawMask(bitmap: ImageBitmap): void {
    const ctx = this.mask?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(bitmap, 0, 0);
    ctx.restore();
    this.cachedSubject = undefined;
  }

  /** Ferme un instantané seulement s'il n'est plus utilisé nulle part. */
  private releaseSnapshot(bitmap: ImageBitmap): void {
    if (bitmap === this.maskSnapshot || bitmap === this.initialMask) return;
    if (this.history.holds((s) => s.mask === bitmap)) return;
    bitmap.close();
  }
}
