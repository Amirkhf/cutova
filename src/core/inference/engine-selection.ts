/**
 * Logique de sélection du moteur, pure et testable sans navigateur : décide quelle
 * combinaison device/dtype essayer, dans quel ordre, et comment basculer vers la
 * tentative suivante en cas d'échec de chargement.
 */
import type { EngineKind } from "./protocol.ts";
import type { GpuLimits } from "./webgpu-support.ts";

export interface EngineAttempt {
  device: "webgpu" | "wasm";
  dtype: "fp16" | "fp32";
  kind: EngineKind;
}

export interface GpuCapabilities {
  available: boolean;
  shaderF16: boolean;
  limits: GpuLimits | null;
}

/** Besoins WebGPU du modèle (models.json > `webgpu`). */
export interface WebGpuRequirements {
  minStorageBuffersPerShaderStage?: number;
}

export interface EnginePlan {
  plan: EngineAttempt[];
  /** Raison pour laquelle WebGPU n'est pas tenté (log de diagnostic), sinon `null`. */
  webgpuSkipped: string | null;
}

export const WASM_ATTEMPT: EngineAttempt = { device: "wasm", dtype: "fp32", kind: "wasm" };

/**
 * WebGPU (fp16 si `shader-f16`, sinon fp32) en premier si disponible ET si les limites de
 * l'adaptateur couvrent les besoins du modèle ; WASM fp32 toujours en dernier (plan jamais vide).
 * `forceWebGpu` ignore les limites (diagnostic : `?webgpu=force`, tests du repli).
 */
export function getEngineLoadPlan(gpu: GpuCapabilities, requirements: WebGpuRequirements = {}, { forceWasm = false, forceWebGpu = false } = {}): EnginePlan {
  if (forceWasm) return { plan: [WASM_ATTEMPT], webgpuSkipped: "repli WASM forcé (WebGPU a échoué dans ce navigateur)" };
  if (!gpu.available) return { plan: [WASM_ATTEMPT], webgpuSkipped: "WebGPU indisponible" };
  const needed = requirements.minStorageBuffersPerShaderStage;
  const have = gpu.limits?.maxStorageBuffersPerShaderStage;
  if (!forceWebGpu && needed !== undefined && (have === undefined || have < needed)) {
    return {
      plan: [WASM_ATTEMPT],
      webgpuSkipped: `maxStorageBuffersPerShaderStage=${have ?? "?"} < ${needed} requis par le modèle WebGPU`,
    };
  }
  const webgpu: EngineAttempt = gpu.shaderF16 ? { device: "webgpu", dtype: "fp16", kind: "webgpu-fp16" } : { device: "webgpu", dtype: "fp32", kind: "webgpu-fp32" };
  return { plan: [webgpu, WASM_ATTEMPT], webgpuSkipped: null };
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
