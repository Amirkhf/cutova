import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { allowedHosts, runCutout, trackNetwork } from "./helpers.ts";

/** WebGPU forcé (`?webgpu=force`) : flags SwiftShader, comme tests/e2e/webgpu.spec.ts. */
test.use({
  launchOptions: {
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-gl=swiftshader"],
  },
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMAGES = ["hair-157920.jpg", "product-1591.jpg", "car-4314.jpg"].map((f) => path.join(ROOT, "tests/images", f));

test.setTimeout(600_000);

test("WebGPU (?webgpu=force) : 3 images → masque ou repli propre", async ({ page, baseURL }) => {
  const violations = trackNetwork(page, allowedHosts(baseURL!));
  const results: { image: string; engine: string | null; elapsedMs: number }[] = [];
  for (const image of IMAGES) {
    await page.goto("/?webgpu=force");
    const r = await runCutout(page, image);
    results.push({ image: path.basename(image), ...r });
  }
  console.log("[webgpu-force]", JSON.stringify(results));
  expect(violations, violations.join("\n")).toEqual([]);
});
