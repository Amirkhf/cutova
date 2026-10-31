/**
 * Détecte les capacités WebGPU disponibles. Mis en cache (une seule requête d'adapter
 * par session de worker) : `requestAdapter()` est coûteux et son résultat ne change pas
 * en cours de session.
 */

export interface WebGpuSupport {
  available: boolean;
  shaderF16: boolean;
}

let cached: Promise<WebGpuSupport> | null = null;

async function detect(): Promise<WebGpuSupport> {
  const gpu = typeof navigator !== "undefined" ? navigator.gpu : undefined;
  if (!gpu) return { available: false, shaderF16: false };

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { available: false, shaderF16: false };
    return { available: true, shaderF16: adapter.features.has("shader-f16") };
  } catch {
    return { available: false, shaderF16: false };
  }
}

export function getWebGpuSupport(): Promise<WebGpuSupport> {
  cached ??= detect();
  return cached;
}
