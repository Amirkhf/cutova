/**
 * Logique de sélection du moteur, pure et testable sans navigateur : décide quelle
 * combinaison device/dtype essayer, dans quel ordre, et comment basculer vers la
 * tentative suivante en cas d'échec (chargement OU première inférence).
 */
import type { EngineKind } from "./protocol.ts";
import type { WebGpuSupport } from "./webgpu-support.ts";

export interface EngineAttempt {
  device: "webgpu" | "wasm";
  dtype: "fp16" | "fp32";
  kind: EngineKind;
}

/**
 * WebGPU (fp16 si `shader-f16`, sinon fp32) en premier si disponible, WASM fp32 en
 * dernier recours — toujours présent dans le plan, jamais vide.
 */
export function getEngineLoadPlan(gpuSupport: WebGpuSupport): EngineAttempt[] {
  const plan: EngineAttempt[] = [];
  if (gpuSupport.available) {
    plan.push(
      gpuSupport.shaderF16
        ? { device: "webgpu", dtype: "fp16", kind: "webgpu-fp16" }
        : { device: "webgpu", dtype: "fp32", kind: "webgpu-fp32" },
    );
  }
  plan.push({ device: "wasm", dtype: "fp32", kind: "wasm" });
  return plan;
}

/** Essaie chaque tentative du plan dans l'ordre ; ne relance l'erreur que si tout a échoué. */
export async function loadWithFallback<T>(
  plan: EngineAttempt[],
  load: (attempt: EngineAttempt) => Promise<T>,
  onFallback?: (failed: EngineAttempt, err: unknown) => void,
): Promise<T> {
  for (let i = 0; i < plan.length; i++) {
    const attempt = plan[i]!;
    try {
      return await load(attempt);
    } catch (err) {
      if (i === plan.length - 1) throw err;
      onFallback?.(attempt, err);
    }
  }
  throw new Error("Plan de chargement vide");
}
