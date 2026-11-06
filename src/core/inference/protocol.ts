/** API typée par messages entre le thread principal et le Web Worker d'inférence. */

export type EngineKind = "webgpu-fp16" | "webgpu-fp32" | "wasm";

export interface LoadRequest {
  type: "load";
  /** Repli : WebGPU a échoué dans ce navigateur → ce worker (neuf) n'utilise que WASM. */
  forceWasm?: boolean;
  /** Diagnostic (`?webgpu=force`) : tenter WebGPU même si les limites lues sont insuffisantes. */
  forceWebGpu?: boolean;
}

export interface RunRequest {
  type: "run";
  requestId: number;
  bitmap: ImageBitmap;
}

export type MainToWorkerMessage = LoadRequest | RunRequest;

export interface ProgressResponse {
  type: "progress";
  file: string;
  loaded: number;
  total: number;
}

/** Étapes du pipeline de détourage (affichées sur l'image). `refine` et `done` sont posées par le thread principal. */
export type PipelineStage = "prepare" | "analyze" | "refine" | "done";

/** Le worker annonce l'étape en cours d'une requête (distinct du téléchargement du modèle : `progress`). */
export interface StageResponse {
  type: "stage";
  requestId: number;
  stage: Extract<PipelineStage, "prepare" | "analyze">;
}

export interface ReadyResponse {
  type: "ready";
  engine: EngineKind;
}

export interface ResultResponse {
  type: "result";
  requestId: number;
  mask: Uint8Array;
  width: number;
  height: number;
  engine: EngineKind;
  elapsedMs: number;
}

export interface ErrorResponse {
  type: "error";
  requestId: number | null;
  message: string;
}

/**
 * L'inférence WebGPU a échoué : l'image est rendue au thread principal, qui remplace ce worker par
 * un worker neuf en WASM forcé. Un worker neuf est indispensable : transformers.js enchaîne toutes
 * les exécutions (et créations de session) sur une promesse globale, qui reste rejetée après un
 * échec — toute exécution suivante dans le même worker renverrait la même erreur.
 */
export interface FallbackResponse {
  type: "fallback";
  requestId: number;
  bitmap: ImageBitmap;
  reason: string;
}

export type WorkerToMainMessage = ProgressResponse | StageResponse | ReadyResponse | ResultResponse | ErrorResponse | FallbackResponse;
