import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { allowedHosts, runCutout, trackNetwork } from "./helpers.ts";

/**
 * Fumée contre un déploiement déjà en ligne (voir playwright.deployed.config.ts). Pas de webServer :
 * le site existe déjà. Le cas WebGPU forcé est dans deployed-webgpu.spec.ts (flags Chromium dédiés,
 * fichier séparé : un worker Playwright ne peut pas changer `launchOptions` en cours de route).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMAGES = ["hair-157920.jpg", "product-1591.jpg", "car-4314.jpg"].map((f) => path.join(ROOT, "tests/images", f));

test.setTimeout(180_000);

test("WASM (?engine=wasm) : 3 images → vrai masque", async ({ page, baseURL }) => {
  const violations = trackNetwork(page, allowedHosts(baseURL!));
  const results: { image: string; engine: string | null; elapsedMs: number }[] = [];
  for (const image of IMAGES) {
    await page.goto("/?engine=wasm");
    const r = await runCutout(page, image);
    expect(r.engine).toBe("wasm");
    results.push({ image: path.basename(image), ...r });
  }
  console.log("[wasm]", JSON.stringify(results));
  expect(violations, violations.join("\n")).toEqual([]);
});

test("capture de l'écran principal", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "docs/review/deployed-home.png", fullPage: false });
});
