/** API typée par messages entre le thread principal et le Web Worker d'inférence. */

export type EngineKind = "webgpu-fp16" | "webgpu-fp32" | "wasm";

export interface LoadRequest {
  type: "load";
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

export type WorkerToMainMessage = ProgressResponse | ReadyResponse | ResultResponse | ErrorResponse;
