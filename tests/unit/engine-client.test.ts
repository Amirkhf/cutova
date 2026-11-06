import { afterEach, describe, expect, it, vi } from "vitest";
import { forceWasmFromUrl } from "../../src/core/inference/engine-client.ts";

describe("forceWasmFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("?engine=wasm : force WASM sans tenter WebGPU", () => {
    vi.stubGlobal("location", { search: "?engine=wasm" });
    expect(forceWasmFromUrl()).toBe(true);
  });

  it("toute autre valeur ou absence du paramètre : false", () => {
    for (const search of ["", "?engine=webgpu", "?webgpu=force", "?engine=WASM"]) {
      vi.stubGlobal("location", { search });
      expect(forceWasmFromUrl()).toBe(false);
    }
  });
});
