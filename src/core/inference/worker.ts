/// <reference lib="webworker" />
/**
 * Web Worker d'inférence : charge le modèle (WebGPU si possible, repli WASM), prétraite
 * l'image reçue à 1024×1024, exécute une inférence à la fois (file d'attente), et renvoie
 * le masque en Transferable. Ne connaît rien de l'UI.
 */
import { AutoModel, AutoProcessor, env, RawImage } from "@huggingface/transformers";
import { getModelForEngine } from "../model/model-source.ts";
import { MODEL_BASE_URL, REMOTE_PATH_TEMPLATE, remoteOrtDir } from "../model/remote.ts";
import { createOpfsCache } from "../model/opfs-cache.ts";
import { getWebGpuSupport } from "./webgpu-support.ts";
import { getEngineLoadPlan, loadWithFallback, type EngineAttempt } from "./engine-selection.ts";
import type { EngineKind, MainToWorkerMessage, WorkerToMainMessage } from "./protocol.ts";

type LoadedModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type LoadedProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

const workerSelf = self as DedicatedWorkerGlobalScope;

function post(message: WorkerToMainMessage, transfer?: Transferable[]): void {
  workerSelf.postMessage(message, transfer ? { transfer } : undefined);
}

if (MODEL_BASE_URL) {
  // Production : modèles sur le stockage externe (R2), même disposition que Hugging Face.
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.remoteHost = `${MODEL_BASE_URL}/`;
  env.remotePathTemplate = REMOTE_PATH_TEMPLATE;
} else {
  // Local : `/models/` servi par le site, jamais de repli vers le Hugging Face Hub.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
}
// transformers.js propose un chargement "en cache" du binaire WASM lui-même (distinct du
// cache OPFS du modèle ci-dessous) : il refait transiter le .mjs par un Blob avant de
// l'importer. Ce chemin suppose `window.chrome` présent (`apis.IS_CHROME_AVAILABLE`), absent
// du Chromium "pur" de Playwright (et possiblement d'autres Chromium sans la marque Chrome) —
// l'import du Blob y échoue silencieusement avec "no available backend found". On désactive
// cette optimisation et on laisse onnxruntime-web charger le WASM lui-même, nativement.
env.useWasmCache = false;
// `.asyncify` instrumente tout le module pour pouvoir suspendre/reprendre l'exécution WASM
// (nécessaire pour l'EP webgpu) mais alourdit la mémoire : on ne le charge que si CE navigateur
// expose `navigator.gpu` ; sinon la variante sans suffixe, plus légère, suffit pour l'EP wasm.
const needsAsyncStackSwitching = typeof navigator !== "undefined" && !!navigator.gpu;
const wasmEnv = env.backends.onnx.wasm;
if (!wasmEnv) {
  throw new Error("onnxruntime-web wasm backend introuvable dans env.backends.onnx");
}
wasmEnv.numThreads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 4, 4) : 1;
if (!self.crossOriginIsolated) {
  console.warn("[cutova] crossOriginIsolated=false : repli sur le WASM mono-thread (plus lent).");
}

/**
 * Binaires onnxruntime-web. Le module `.mjs` (petit, du JavaScript) est toujours servi par le site
 * (asset Vite `?url`, même origine) : un `.mjs` d'une autre origine serait importé par onnxruntime-web
 * via une URL `blob:`, que notre CSP refuse. Le `.wasm` (jusqu'à 25,6 Mio, au-dessus de la limite de
 * Cloudflare Pages) vient du stockage externe en production, sinon du site. Il n'est que téléchargé
 * (fetch → `connect-src`), jamais exécuté comme script.
 */
async function wasmPaths(): Promise<{ mjs: string; wasm: string }> {
  const remoteDir = remoteOrtDir();
  if (needsAsyncStackSwitching) {
    const mjs = (await import("onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url")).default;
    const wasm = remoteDir ? `${remoteDir}ort-wasm-simd-threaded.asyncify.wasm` : (await import("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url")).default;
    return { mjs, wasm };
  }
  const mjs = (await import("onnxruntime-web/ort-wasm-simd-threaded.mjs?url")).default;
  const wasm = remoteDir ? `${remoteDir}ort-wasm-simd-threaded.wasm` : (await import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url")).default;
  return { mjs, wasm };
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
  // Modèle choisi par moteur dans models.json (WebGPU : BiRefNet_lite ; WASM : modèle plus léger
  // qui tient sous le plafond mémoire wasm32 de 4 Go — voir context.md > Décisions).
  const { repoId, revision } = getModelForEngine(attempt.device);
  const model = await AutoModel.from_pretrained(repoId, {
    revision,
    device: attempt.device,
    dtype: attempt.dtype,
    local_files_only: !MODEL_BASE_URL,
    progress_callback: reportProgress,
    // Réduit la pression mémoire au prix de la vitesse — bon défaut général sur WASM, mais
    // ne suffit pas seul à faire tenir ce modèle sous la limite mémoire wasm32 à 1024×1024
    // (voir context.md > Mesures : std::bad_alloc reproduit même avec ce réglage, fp16,
    // mono-thread, et la variante wasm sans asyncify).
    session_options: attempt.device === "wasm" ? { enableCpuMemArena: false, enableMemPattern: false } : {},
  });
  const processor = await AutoProcessor.from_pretrained(repoId, { revision, local_files_only: !MODEL_BASE_URL });
  return { kind: attempt.kind, model, processor };
}

async function loadEngineWithFallback(): Promise<LoadedEngine> {
  wasmEnv!.wasmPaths = await wasmPaths();
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

interface InferenceOutcome {
  mask: Uint8Array;
  width: number;
  height: number;
}

/**
 * Sortie brute du modèle → masque uint8. BiRefNet sort des logits (sigmoid nécessaire) ; ormbg /
 * IS-Net sortent déjà une probabilité dans [0,1]. On détecte au lieu de configurer par modèle.
 */
function toMask(values: Float32Array): Uint8Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const isLogits = min < -1e-3 || max > 1 + 1e-3;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const p = isLogits ? 1 / (1 + Math.exp(-values[i]!)) : values[i]!;
    out[i] = Math.round(255 * p);
  }
  return out;
}

async function runInference(engine: LoadedEngine, bitmap: ImageBitmap): Promise<InferenceOutcome> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte OffscreenCanvas 2D indisponible");
  ctx.drawImage(bitmap, 0, 0);
  const image = RawImage.fromCanvas(canvas);

  const { pixel_values } = await engine.processor(image);
  // Nom d'entrée/sortie propre à chaque modèle : on prend la première entrée de la session, et la
  // sortie `output_image` si elle existe (BiRefNet, IS-Net composite), sinon la première.
  const session = (engine.model as unknown as { sessions: Record<string, { inputNames: string[]; outputNames: string[] }> }).sessions.model!;
  const outputs = (await engine.model({ [session.inputNames[0]!]: pixel_values })) as Record<string, { dims: number[]; data: Float32Array }>;
  const output = outputs.output_image ?? outputs[session.outputNames[0]!]!;
  const dims = output.dims;
  return { mask: toMask(output.data), width: dims[dims.length - 1]!, height: dims[dims.length - 2]! };
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
    let outcome: InferenceOutcome;
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
        width: outcome.width,
        height: outcome.height,
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
