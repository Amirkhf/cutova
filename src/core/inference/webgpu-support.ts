/**
 * Détecte les capacités WebGPU et crée le GPUDevice passé à ONNX Runtime. Mis en cache (une seule
 * requête d'adaptateur par worker).
 *
 * Constat sur un vrai Mac (Chrome) ET sur SwiftShader : l'adaptateur plafonne
 * `maxStorageBuffersPerShaderStage` à 10, alors qu'un shader de BiRefNet_lite en demande 11
 * ("Too many storage buffers in shader. Current: 11, Max is 10"). On lit donc les limites pour
 * décider AVANT de tenter WebGPU (voir engine-selection.ts), et on crée le device nous-mêmes en
 * demandant les limites MAXIMALES de l'adaptateur (ONNX Runtime ne demande pas toutes les limites).
 */

export interface GpuLimits {
  maxStorageBuffersPerShaderStage: number;
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
}

export interface WebGpuSupport {
  available: boolean;
  shaderF16: boolean;
  limits: GpuLimits | null;
  adapter: GPUAdapter | null;
}

const UNAVAILABLE: WebGpuSupport = { available: false, shaderF16: false, limits: null, adapter: null };

let cached: Promise<WebGpuSupport> | null = null;

async function detect(): Promise<WebGpuSupport> {
  const gpu = typeof navigator !== "undefined" ? navigator.gpu : undefined;
  if (!gpu) return UNAVAILABLE;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return UNAVAILABLE;
    return {
      available: true,
      shaderF16: adapter.features.has("shader-f16"),
      limits: {
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
      adapter,
    };
  } catch {
    return UNAVAILABLE;
  }
}

export function getWebGpuSupport(): Promise<WebGpuSupport> {
  cached ??= detect();
  return cached;
}

/** Ligne de log des limites (diagnostic sur matériel réel). */
export function formatGpuLimits(support: Pick<WebGpuSupport, "available" | "shaderF16" | "limits">): string {
  if (!support.available || !support.limits) return "[cutova] GPU limits: WebGPU indisponible";
  const l = support.limits;
  return `[cutova] GPU limits: maxStorageBuffersPerShaderStage=${l.maxStorageBuffersPerShaderStage}, maxStorageBufferBindingSize=${l.maxStorageBufferBindingSize}, maxBufferSize=${l.maxBufferSize}, shader-f16=${support.shaderF16 ? "oui" : "non"}`;
}

/** Toutes les limites numériques de l'adaptateur, pour les demander au maximum. */
export function maxRequiredLimits(limits: GPUSupportedLimits): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key in limits) {
    const value = (limits as unknown as Record<string, unknown>)[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** GPUDevice avec les limites maximales de l'adaptateur (+ `shader-f16` si disponible). */
export async function createMaxDevice(support: WebGpuSupport): Promise<GPUDevice> {
  if (!support.adapter) throw new Error("WebGPU indisponible");
  return support.adapter.requestDevice({
    requiredFeatures: support.shaderF16 ? ["shader-f16"] : [],
    requiredLimits: maxRequiredLimits(support.adapter.limits),
  });
}
