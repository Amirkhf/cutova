import { describe, expect, it, vi } from "vitest";
import { getEngineLoadPlan, loadWithFallback, type EngineAttempt } from "../../src/core/inference/engine-selection.ts";

describe("getEngineLoadPlan", () => {
  it("WebGPU avec shader-f16 : tente fp16 sur webgpu, puis wasm en dernier recours", () => {
    const plan = getEngineLoadPlan({ available: true, shaderF16: true });
    expect(plan).toEqual([
      { device: "webgpu", dtype: "fp16", kind: "webgpu-fp16" },
      { device: "wasm", dtype: "fp32", kind: "wasm" },
    ]);
  });

  it("WebGPU sans shader-f16 : tente fp32 sur webgpu, puis wasm en dernier recours", () => {
    const plan = getEngineLoadPlan({ available: true, shaderF16: false });
    expect(plan).toEqual([
      { device: "webgpu", dtype: "fp32", kind: "webgpu-fp32" },
      { device: "wasm", dtype: "fp32", kind: "wasm" },
    ]);
  });

  it("pas de WebGPU : seul le WASM figure dans le plan", () => {
    const plan = getEngineLoadPlan({ available: false, shaderF16: false });
    expect(plan).toEqual([{ device: "wasm", dtype: "fp32", kind: "wasm" }]);
  });
});

describe("loadWithFallback", () => {
  it("retourne le résultat de la première tentative quand elle réussit", async () => {
    const plan = getEngineLoadPlan({ available: true, shaderF16: true });
    const load = vi.fn(async (attempt: EngineAttempt) => `loaded:${attempt.kind}`);
    const result = await loadWithFallback(plan, load);
    expect(result).toBe("loaded:webgpu-fp16");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("échec WebGPU → repli WASM : la tentative suivante est essayée et son résultat renvoyé", async () => {
    const plan = getEngineLoadPlan({ available: true, shaderF16: true });
    const onFallback = vi.fn();
    const load = vi.fn(async (attempt: EngineAttempt) => {
      if (attempt.device === "webgpu") throw new Error("device lost");
      return `loaded:${attempt.kind}`;
    });
    const result = await loadWithFallback(plan, load, onFallback);
    expect(result).toBe("loaded:wasm");
    expect(load).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0]![0]).toMatchObject({ device: "webgpu" });
  });

  it("relance l'erreur quand même la dernière tentative échoue", async () => {
    const plan = getEngineLoadPlan({ available: false, shaderF16: false });
    const load = vi.fn(async () => {
      throw new Error("wasm indisponible");
    });
    await expect(loadWithFallback(plan, load)).rejects.toThrow("wasm indisponible");
  });
});
