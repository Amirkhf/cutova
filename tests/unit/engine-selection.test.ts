import { describe, expect, it, vi } from "vitest";
import { getEngineLoadPlan, loadWithFallback, WASM_ATTEMPT, type EngineAttempt } from "../../src/core/inference/engine-selection.ts";
import { formatGpuLimits, maxRequiredLimits } from "../../src/core/inference/webgpu-support.ts";

const limits = (maxStorageBuffersPerShaderStage: number) => ({ maxStorageBuffersPerShaderStage, maxStorageBufferBindingSize: 134217728, maxBufferSize: 268435456 });
const BIREFNET = { minStorageBuffersPerShaderStage: 11 };

describe("getEngineLoadPlan", () => {
  it("WebGPU avec shader-f16 et limites suffisantes : fp16 sur webgpu, puis wasm", () => {
    const { plan, webgpuSkipped } = getEngineLoadPlan({ available: true, shaderF16: true, limits: limits(16) }, BIREFNET);
    expect(plan).toEqual([{ device: "webgpu", dtype: "fp16", kind: "webgpu-fp16" }, WASM_ATTEMPT]);
    expect(webgpuSkipped).toBeNull();
  });

  it("WebGPU sans shader-f16 : fp32 sur webgpu, puis wasm", () => {
    const { plan } = getEngineLoadPlan({ available: true, shaderF16: false, limits: limits(11) }, BIREFNET);
    expect(plan).toEqual([{ device: "webgpu", dtype: "fp32", kind: "webgpu-fp32" }, WASM_ATTEMPT]);
  });

  it("limite à 10 (Chrome Mac, SwiftShader) < 11 requis : WASM directement, sans tenter WebGPU", () => {
    const { plan, webgpuSkipped } = getEngineLoadPlan({ available: true, shaderF16: true, limits: limits(10) }, BIREFNET);
    expect(plan).toEqual([WASM_ATTEMPT]);
    expect(webgpuSkipped).toBe("maxStorageBuffersPerShaderStage=10 < 11 requis par le modèle WebGPU");
  });

  it("limites inconnues alors que le modèle en exige : WASM par prudence", () => {
    const { plan } = getEngineLoadPlan({ available: true, shaderF16: true, limits: null }, BIREFNET);
    expect(plan).toEqual([WASM_ATTEMPT]);
  });

  it("forceWebGpu ignore les limites (diagnostic, test du repli)", () => {
    const { plan } = getEngineLoadPlan({ available: true, shaderF16: false, limits: limits(10) }, BIREFNET, { forceWebGpu: true });
    expect(plan[0]!.device).toBe("webgpu");
  });

  it("forceWasm (repli après échec WebGPU) : WASM seul, même si WebGPU semble disponible", () => {
    const { plan } = getEngineLoadPlan({ available: true, shaderF16: true, limits: limits(64) }, BIREFNET, { forceWasm: true });
    expect(plan).toEqual([WASM_ATTEMPT]);
  });

  it("pas de WebGPU : seul le WASM figure dans le plan", () => {
    expect(getEngineLoadPlan({ available: false, shaderF16: false, limits: null }).plan).toEqual([WASM_ATTEMPT]);
  });
});

describe("limites GPU", () => {
  it("ligne de log lisible", () => {
    expect(formatGpuLimits({ available: true, shaderF16: true, limits: limits(10) })).toBe(
      "[cutova] GPU limits: maxStorageBuffersPerShaderStage=10, maxStorageBufferBindingSize=134217728, maxBufferSize=268435456, shader-f16=oui",
    );
    expect(formatGpuLimits({ available: false, shaderF16: false, limits: null })).toBe("[cutova] GPU limits: WebGPU indisponible");
  });

  it("demande toutes les limites numériques de l'adaptateur à leur maximum", () => {
    const fake = { maxStorageBuffersPerShaderStage: 10, maxBufferSize: 1024, label: "x" } as unknown as GPUSupportedLimits;
    expect(maxRequiredLimits(fake)).toEqual({ maxStorageBuffersPerShaderStage: 10, maxBufferSize: 1024 });
  });
});

describe("loadWithFallback", () => {
  const { plan } = getEngineLoadPlan({ available: true, shaderF16: true, limits: limits(16) }, BIREFNET);

  it("retourne le résultat de la première tentative quand elle réussit", async () => {
    const load = vi.fn(async (attempt: EngineAttempt) => `loaded:${attempt.kind}`);
    expect(await loadWithFallback(plan, load)).toBe("loaded:webgpu-fp16");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("échec de chargement WebGPU → tentative WASM", async () => {
    const onFallback = vi.fn();
    const load = vi.fn(async (attempt: EngineAttempt) => {
      if (attempt.device === "webgpu") throw new Error("device lost");
      return `loaded:${attempt.kind}`;
    });
    expect(await loadWithFallback(plan, load, onFallback)).toBe("loaded:wasm");
    expect(onFallback.mock.calls[0]![0]).toMatchObject({ device: "webgpu" });
  });

  it("relance l'erreur quand même la dernière tentative échoue", async () => {
    const load = vi.fn(async () => {
      throw new Error("wasm indisponible");
    });
    await expect(loadWithFallback([WASM_ATTEMPT], load)).rejects.toThrow("wasm indisponible");
  });
});
