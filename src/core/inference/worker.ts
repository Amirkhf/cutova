/// <reference lib="webworker" />
/**
 * Web Worker d'inférence : charge le modèle (WebGPU si possible, repli WASM), prétraite
 * l'image reçue à 1024×1024, exécute une inférence à la fois (file d'attente), et renvoie
 * le masque en Transferable. Ne connaît rien de l'UI.
 */
import { AutoModel, AutoProcessor, env, RawImage } from "@huggingface/transformers";
import { MODEL_INPUT_SIZE, MODEL_REPO_ID } from "../model/model-source.ts";
import { createOpfsCache } from "../model/opfs-cache.ts";
import { getWebGpuSupport } from "./webgpu-support.ts";
import { getEngineLoadPlan, loadWithFallback, type EngineAttempt } from "./engine-selection.ts";
import type { EngineKind, MainToWorkerMessage, WorkerToMainMessage } from "./protocol.ts";

// Importés via le pipeline d'assets natif de Vite (`?url`) : fichiers servis même-origine,
// avec hash de contenu en prod, sans middleware ni copie manuelle. Zéro requête externe.
import asyncifyWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import asyncifyMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import plainWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import plainMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

type LoadedModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type LoadedProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

const workerSelf = self as DedicatedWorkerGlobalScope;

function post(message: WorkerToMainMessage, transfer?: Transferable[]): void {
  workerSelf.postMessage(message, transfer ? { transfer } : undefined);
}

env.allowRemoteModels = false;
env.allowLocalModels = true;
// transformers.js propose un chargement "en cache" du binaire WASM lui-même (distinct du
// cache OPFS du modèle ci-dessous) : il refait transiter le .mjs par un Blob avant de
// l'importer. Ce chemin suppose `window.chrome` présent (`apis.IS_CHROME_AVAILABLE`), absent
// du Chromium "pur" de Playwright (et possiblement d'autres Chromium sans la marque Chrome) —
// l'import du Blob y échoue silencieusement avec "no available backend found". On désactive
// cette optimisation et on laisse onnxruntime-web charger le WASM lui-même, nativement,
// directement depuis nos URLs bundlées (déjà same-origin, déjà mises en cache HTTP).
env.useWasmCache = false;
// `.asyncify` instrumente tout le module pour pouvoir suspendre/reprendre l'exécution WASM
// (nécessaire pour l'EP webgpu, qui doit pouvoir "attendre" le GPU) — mais ce surcoût
// alourdit sensiblement l'empreinte mémoire (confirmé ici : un `std::bad_alloc` dans
// OrtRun() sur ce modèle en EP wasm pur avec `.asyncify`, résolu en passant à la variante
// sans suffixe — voir context.md > Mesures). On ne charge donc `.asyncify` que si CE
// navigateur expose effectivement `navigator.gpu` (donc peut réellement en avoir besoin) ;
// sinon la variante sans suffixe, plus légère, suffit pour l'EP wasm seul.
const needsAsyncStackSwitching = typeof navigator !== "undefined" && !!navigator.gpu;
const wasmEnv = env.backends.onnx.wasm;
if (!wasmEnv) {
  throw new Error("onnxruntime-web wasm backend introuvable dans env.backends.onnx");
}
wasmEnv.wasmPaths = needsAsyncStackSwitching
  ? { mjs: asyncifyMjsUrl, wasm: asyncifyWasmUrl }
  : { mjs: plainMjsUrl, wasm: plainWasmUrl };
wasmEnv.numThreads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 4, 4) : 1;
if (!self.crossOriginIsolated) {
  console.warn("[cutova] crossOriginIsolated=false : repli sur le WASM mono-thread (plus lent).");
}

interface LoadedEngine {
  kind: EngineKind;
  model: LoadedModel;
  processor: LoadedProcessor;
}

let enginePromise: Promise<LoadedEngine> | null = null;

function reportProgress(info: unknown): void {
  const data = info as { status?: string; file?: string; loaded?: number; total?: number };
  if (data.status === "progress" && data.file && typeof data.loaded === "number" && typeof data.total === "number") {
    post({ type: "progress", file: data.file, loaded: data.loaded, total: data.total });
  }
}

async function loadEngine(attempt: EngineAttempt): Promise<LoadedEngine> {
  const model = await AutoModel.from_pretrained(MODEL_REPO_ID, {
    device: attempt.device,
    dtype: attempt.dtype,
    local_files_only: true,
    progress_callback: reportProgress,
    // Réduit la pression mémoire au prix de la vitesse — bon défaut général sur WASM, mais
    // ne suffit pas seul à faire tenir ce modèle sous la limite mémoire wasm32 à 1024×1024
    // (voir context.md > Mesures : std::bad_alloc reproduit même avec ce réglage, fp16,
    // mono-thread, et la variante wasm sans asyncify).
    session_options: attempt.device === "wasm" ? { enableCpuMemArena: false, enableMemPattern: false } : {},
  });
  const processor = await AutoProcessor.from_pretrained(MODEL_REPO_ID, { local_files_only: true });
  return { kind: attempt.kind, model, processor };
}

async function loadEngineWithFallback(): Promise<LoadedEngine> {
  const opfsCache = await createOpfsCache();
  if (opfsCache) {
    env.useCustomCache = true;
    env.customCache = opfsCache;
  }
  // Sinon : on laisse le comportement par défaut de transformers.js (Cache API navigateur,
  // sinon aucun cache) — jamais de plantage, voir src/core/model/opfs-cache.ts.

  const gpuSupport = await getWebGpuSupport();
  const plan = getEngineLoadPlan(gpuSupport);
  return loadWithFallback(plan, loadEngine, (failed, err) =>
    console.warn(`[cutova] Chargement ${failed.kind} échoué, tentative suivante.`, err),
  );
}

async function ensureEngine(): Promise<LoadedEngine> {
  enginePromise ??= loadEngineWithFallback();
  return enginePromise;
}

/** Abandonne l'engin courant (ex. échec à la première inférence) et force un repli WASM. */
function downgradeToWasm(): Promise<LoadedEngine> {
  enginePromise = loadEngine({ device: "wasm", dtype: "fp32", kind: "wasm" });
  return enginePromise;
}

async function runInference(engine: LoadedEngine, bitmap: ImageBitmap): Promise<{ mask: Uint8Array; engine: LoadedEngine }> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte OffscreenCanvas 2D indisponible");
  ctx.drawImage(bitmap, 0, 0);
  const image = RawImage.fromCanvas(canvas);

  const { pixel_values } = await engine.processor(image);
  const { output_image } = await engine.model({ input_image: pixel_values });
  const maskTensor = output_image[0].sigmoid().mul(255).to("uint8");
  const mask = new Uint8Array(maskTensor.data as Uint8Array);
  return { mask, engine };
}

// File d'attente : une seule inférence à la fois, les suivantes patientent.
const queue: RunRequestQueued[] = [];
let processing = false;

interface RunRequestQueued {
  requestId: number;
  bitmap: ImageBitmap;
}

function enqueueRun(requestId: number, bitmap: ImageBitmap): void {
  queue.push({ requestId, bitmap });
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    let job: RunRequestQueued | undefined;
    while ((job = queue.shift())) {
      await processJob(job);
    }
  } finally {
    processing = false;
  }
}

async function processJob(job: RunRequestQueued): Promise<void> {
  try {
    let engine = await ensureEngine();
    const started = performance.now();
    let outcome: { mask: Uint8Array };
    try {
      outcome = await runInference(engine, job.bitmap);
    } catch (err) {
      if (engine.kind === "wasm") throw err;
      // Échec à la première inférence (pas seulement au chargement) : repli WASM, un seul essai.
      console.warn(`[cutova] Inférence ${engine.kind} échouée, repli WASM.`, err);
      engine = await downgradeToWasm();
      outcome = await runInference(engine, job.bitmap);
    }
    const elapsedMs = performance.now() - started;
    post(
      {
        type: "result",
        requestId: job.requestId,
        mask: outcome.mask,
        width: MODEL_INPUT_SIZE,
        height: MODEL_INPUT_SIZE,
        engine: engine.kind,
        elapsedMs,
      },
      [outcome.mask.buffer],
    );
  } catch (err) {
    post({ type: "error", requestId: job.requestId, message: err instanceof Error ? err.message : String(err) });
  } finally {
    job.bitmap.close();
  }
}

self.addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  if (message.type === "load") {
    ensureEngine()
      .then((engine) => post({ type: "ready", engine: engine.kind }))
      .catch((err) => post({ type: "error", requestId: null, message: err instanceof Error ? err.message : String(err) }));
    return;
  }
  if (message.type === "run") {
    enqueueRun(message.requestId, message.bitmap);
  }
});
