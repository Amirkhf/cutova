import { test, expect } from "@playwright/test";
import { chromiumExecutablePath } from "../../playwright.config.ts";

/**
 * Chemin WebGPU, avec WebGPU logiciel (Dawn + SwiftShader) — sans ces drapeaux,
 * `navigator.gpu` est absent du Chromium headless de Playwright. Avec eux, un adaptateur
 * logiciel est bien exposé : le test s'exécute (il ne "skip" que si, malgré les drapeaux,
 * aucun adaptateur n'est trouvé). Voir context.md > Mesures pour ce que ce test a révélé
 * (repli webgpu → wasm déclenché en conditions réelles, limite de shader du backend
 * logiciel) — un vrai GPU matériel reste à tester avant toute conclusion sur WebGPU.
 */
test.use({
  launchOptions: {
    executablePath: chromiumExecutablePath,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,UseSkiaRenderer", "--use-angle=swiftshader", "--use-gl=swiftshader"],
  },
});

test("WebGPU : charge le modèle en fp16 si shader-f16 est supporté", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const support = await page.evaluate(async () => {
    if (!navigator.gpu) return { available: false };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { available: true, adapter: false };
    return { available: true, adapter: true, shaderF16: adapter.features.has("shader-f16") };
  });

  test.skip(
    !support.available || !support.adapter,
    "Aucun adaptateur WebGPU dans ce Chromium headless sandboxé (pas de GPU) — voir context.md > Mesures.",
  );

  await page.getByRole("button", { name: "Example image 1" }).click();
  await expect(page.locator(".result-status")).toContainText(/Processed in|failed/i, { timeout: 150_000 });
});
