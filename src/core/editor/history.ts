/**
 * Historique annuler / rétablir générique : une pile d'états passés et une pile d'états annulés.
 * Chaque état est opaque (réglages + instantané du masque, voir editor-doc.ts). `onDrop` est appelé
 * pour libérer un état sorti définitivement de l'historique (ex. fermer un ImageBitmap), seulement
 * s'il n'est plus référencé ailleurs (`isReferenced`).
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private readonly limit: number;
  private readonly onDrop: (state: T) => void;

  constructor(limit = 30, onDrop: (state: T) => void = () => undefined) {
    this.limit = limit;
    this.onDrop = onDrop;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Enregistre `previous` (l'état AVANT une modification) ; efface ce qui pouvait être rétabli. */
  record(previous: T): void {
    this.past.push(previous);
    for (const s of this.future) this.release(s);
    this.future = [];
    while (this.past.length > this.limit) this.release(this.past.shift()!);
  }

  /** Annule : reçoit l'état courant, renvoie l'état à restaurer (ou null). */
  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(current);
    return previous;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    for (const s of [...this.past, ...this.future]) this.release(s);
    this.past = [];
    this.future = [];
  }

  /** Vrai si `state` est encore dans l'une des piles. */
  holds(predicate: (state: T) => boolean): boolean {
    return this.past.some(predicate) || this.future.some(predicate);
  }

  private release(state: T): void {
    this.onDrop(state);
  }
}
