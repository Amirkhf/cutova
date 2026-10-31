/**
 * Façade thread principal pour le worker d'inférence : file d'attente des `run()`,
 * préchargement idempotent, événements de progression. L'UI n'importe jamais le worker
 * directement.
 */
import type { EngineKind, MainToWorkerMessage, WorkerToMainMessage } from "./protocol.ts";

export interface InferenceResult {
  mask: Uint8Array;
  width: number;
  height: number;
  engine: EngineKind;
  elapsedMs: number;
}

export interface ProgressEvent {
  file: string;
  loaded: number;
  total: number;
}

type ProgressListener = (event: ProgressEvent) => void;

class InferenceEngine {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, { resolve: (r: InferenceResult) => void; reject: (e: Error) => void }>();
  private readyPromise: Promise<EngineKind> | null = null;
  private resolveReady: ((engine: EngineKind) => void) | null = null;
  private rejectReady: ((err: Error) => void) | null = null;
  private progressListeners = new Set<ProgressListener>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => this.handleMessage(event.data));
    worker.addEventListener("error", (event) => {
      this.rejectReady?.(new Error(event.message || "Worker error"));
      for (const { reject } of this.pending.values()) reject(new Error(event.message || "Worker error"));
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }

  private send(message: MainToWorkerMessage, transfer?: Transferable[]): void {
    const worker = this.ensureWorker();
    if (transfer) worker.postMessage(message, transfer);
    else worker.postMessage(message);
  }

  private handleMessage(message: WorkerToMainMessage): void {
    switch (message.type) {
      case "progress":
        for (const listener of this.progressListeners) listener(message);
        break;
      case "ready":
        this.resolveReady?.(message.engine);
        break;
      case "result": {
        const job = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        job?.resolve({
          mask: message.mask,
          width: message.width,
          height: message.height,
          engine: message.engine,
          elapsedMs: message.elapsedMs,
        });
        break;
      }
      case "error": {
        const error = new Error(message.message);
        if (message.requestId === null) {
          this.rejectReady?.(error);
        } else {
          const job = this.pending.get(message.requestId);
          this.pending.delete(message.requestId);
          job?.reject(error);
        }
        break;
      }
    }
  }

  /** Démarre le chargement du modèle sans attendre de résultat. Idempotent. */
  preload(): Promise<EngineKind> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise<EngineKind>((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
      this.send({ type: "load" });
    }
    return this.readyPromise;
  }

  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /** File d'attente côté worker : les appels concurrents sont traités un par un. */
  run(bitmap: ImageBitmap): Promise<InferenceResult> {
    void this.preload();
    const requestId = this.nextRequestId++;
    return new Promise<InferenceResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.send({ type: "run", requestId, bitmap }, [bitmap]);
    });
  }
}

export const inferenceEngine = new InferenceEngine();
