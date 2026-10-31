/**
 * Façade thread principal pour le worker d'inférence : file d'attente des `run()`,
 * préchargement idempotent, événements de progression, et cycle de vie du worker. L'UI n'importe
 * jamais le worker directement.
 *
 * Pourquoi remplacer le worker après un échec : transformers.js enchaîne toutes les exécutions
 * (et créations de session) d'un worker sur une promesse globale qui reste rejetée après une
 * erreur ; un worker qui a échoué une fois échoue ensuite à chaque appel, avec la même erreur
 * (constaté sur un vrai Mac et sur SwiftShader). On repart donc toujours d'un worker neuf.
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

/** `?webgpu=force` : tenter WebGPU même si les limites de l'adaptateur semblent insuffisantes. */
function forceWebGpuFromUrl(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("webgpu") === "force";
  } catch {
    return false;
  }
}

class InferenceEngine {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, { resolve: (r: InferenceResult) => void; reject: (e: Error) => void }>();
  private readyPromise: Promise<EngineKind> | null = null;
  private resolveReady: ((engine: EngineKind) => void) | null = null;
  private rejectReady: ((err: Error) => void) | null = null;
  private progressListeners = new Set<ProgressListener>();
  /** Devient vrai après un échec WebGPU : tous les workers suivants sont en WASM seul. */
  private forceWasm = false;
  private readonly forceWebGpu = forceWebGpuFromUrl();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => this.handleMessage(worker, event.data));
    worker.addEventListener("error", (event) => {
      if (worker !== this.worker) return;
      const error = new Error(event.message || "Worker error");
      this.rejectReady?.(error);
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      this.discardWorker();
    });
    this.worker = worker;
    return worker;
  }

  /** Abandonne le worker courant (état ORT/transformers.js inutilisable) ; le suivant sera neuf. */
  private discardWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
  }

  private send(message: MainToWorkerMessage, transfer?: Transferable[]): void {
    const worker = this.ensureWorker();
    if (transfer) worker.postMessage(message, transfer);
    else worker.postMessage(message);
  }

  private handleMessage(from: Worker, message: WorkerToMainMessage): void {
    if (from !== this.worker) return; // message tardif d'un worker déjà remplacé
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
      case "fallback": {
        // WebGPU a échoué : worker neuf en WASM forcé, même requête, même image.
        console.warn(`[cutova] WebGPU a échoué (${message.reason}) : nouveau worker en WASM.`);
        this.forceWasm = true;
        this.discardWorker();
        void this.preload();
        this.send({ type: "run", requestId: message.requestId, bitmap: message.bitmap }, [message.bitmap]);
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
        // Ce worker ne peut plus rien exécuter correctement : le prochain appel en recrée un.
        if (this.pending.size === 0) this.discardWorker();
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
      // Une promesse de préchargement rejetée sans écouteur ne doit pas remonter en erreur globale.
      this.readyPromise.catch(() => undefined);
      this.send({ type: "load", forceWasm: this.forceWasm, forceWebGpu: this.forceWebGpu });
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
