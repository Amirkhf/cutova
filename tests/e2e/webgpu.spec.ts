import { test, expect, type Page } from "@playwright/test";
import { chromiumExecutablePath } from "../../playwright.config.ts";

/**
 * Chemin WebGPU sur SwiftShader (WebGPU logiciel, Dawn) — banc d'essai FIDÈLE du bug vu sur un vrai
 * Mac (Chrome) : l'adaptateur plafonne `maxStorageBuffersPerShaderStage` à 10 alors qu'un shader de
 * BiRefNet_lite en demande 11 ("Too many storage buffers in shader. Current: 11, Max is 10").
 *
 * 1. Sans paramètre : les limites sont lues et loggées, WebGPU n'est PAS tenté, WASM directement.
 * 2. `?webgpu=force` : WebGPU est tenté, échoue, puis le repli crée un worker NEUF réellement en WASM
 *    (fournisseur loggé) et un vrai masque est produit. Avant correctif, le repli renvoyait la même
 *    erreur WebGPU (promesse globale de transformers.js restée rejetée dans le même worker).
 */
test.use({
  launchOptions: {
    executablePath: chromiumExecutablePath,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-gl=swiftshader"],
  },
});

test.setTimeout(300_000);

async function runExample(page: Page, path: string): Promise<{ logs: string[]; engine: string | null; foreground: number }> {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.goto(path);
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return a ? a.limits.maxStorageBuffersPerShaderStage : null;
  });
  test.skip(adapter === null, "Aucun adaptateur WebGPU dans ce Chromium (drapeaux SwiftShader non pris en compte).");

  await page.getByRole("button", { name: "Example image 1" }).click();
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-state", /done|error/, { timeout: 280_000 });
  expect(await panel.getAttribute("data-state"), logs.filter((l) => l.includes("cutova")).join("\n")).toBe("done");
  const foreground = await page.locator(".result-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let kept = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! >= 128) kept++;
    return kept / (data.length / 4);
  });
  return { logs, engine: await panel.getAttribute("data-engine"), foreground };
}

test("limites lues : maxStorageBuffersPerShaderStage=10 < 11 → WASM directement, sans tenter WebGPU", async ({ page }) => {
  const { logs, engine, foreground } = await runExample(page, "/");
  expect(logs.some((l) => /^\[cutova\] GPU limits: maxStorageBuffersPerShaderStage=10, maxStorageBufferBindingSize=\d+, maxBufferSize=\d+, shader-f16=(oui|non)$/.test(l))).toBe(true);
  expect(logs).toContain("[cutova] WebGPU non tenté : maxStorageBuffersPerShaderStage=10 < 11 requis par le modèle WebGPU → WASM.");
  expect(logs.some((l) => l.includes("fournisseur d'exécution : webgpu"))).toBe(false);
  expect(logs).toContain("[cutova] Modèle ormbg chargé, fournisseur d'exécution : wasm (fp32)");
  expect(engine).toBe("wasm");
  expect(foreground).toBeGreaterThan(0.01);
  expect(foreground).toBeLessThan(0.99);
});

test("?webgpu=force : WebGPU échoue → nouveau worker réellement WASM → vrai masque", async ({ page }) => {
  const { logs, engine, foreground } = await runExample(page, "/?webgpu=force");
  expect(logs.some((l) => l.includes("fournisseur d'exécution : webgpu"))).toBe(true);
  expect(logs.some((l) => l.includes("Too many storage buffers in shader"))).toBe(true);
  expect(logs.some((l) => l.startsWith("[cutova] WebGPU a échoué") && l.includes("nouveau worker en WASM"))).toBe(true);
  // Le fournisseur du repli est bien wasm, et c'est le DERNIER modèle chargé.
  const loads = logs.filter((l) => l.includes("fournisseur d'exécution"));
  expect(loads.at(-1)).toBe("[cutova] Modèle ormbg chargé, fournisseur d'exécution : wasm (fp32)");
  expect(engine).toBe("wasm");
  expect(foreground).toBeGreaterThan(0.01);
  expect(foreground).toBeLessThan(0.99);
});
