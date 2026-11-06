import { test, expect } from "@playwright/test";

const SITE = "localhost:4175";
const MIRROR = "127.0.0.1:4180";

test.setTimeout(300_000);

test("modèles et ONNX Runtime chargés depuis le stockage externe, sous COEP/CSP, vrai masque", async ({ page }) => {
  const hosts = new Set<string>();
  const fromMirror: string[] = [];
  const cspErrors: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Cross-Origin-Embedder|blocked/i.test(m.text())) cspErrors.push(m.text());
  });
  const modelHeaders: Record<string, string>[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".onnx") && r.status() === 200) modelHeaders.push(r.headers());
  });
  page.on("request", (r) => {
    const url = new URL(r.url());
    hosts.add(url.host);
    if (url.host === MIRROR) fromMirror.push(url.pathname);
  });

  await page.goto("/");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole("button", { name: "Example image 1" }).click();
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-state", /done|error/, { timeout: 280_000 });
  expect(await panel.getAttribute("data-state"), (await page.locator(".result-status").textContent()) ?? "").toBe("done");

  // Seulement le site et le stockage externe ; poids + binaires WASM venus du stockage externe.
  expect([...hosts].sort()).toEqual([MIRROR, SITE].sort());
  expect(fromMirror.some((p) => /\/resolve\/[0-9a-f]{40}\/onnx\/model\.onnx$/.test(p))).toBe(true);
  expect(fromMirror.some((p) => /^\/onnxruntime-web\/.+\/ort-wasm-simd-threaded.*\.wasm$/.test(p))).toBe(true);
  expect(cspErrors).toEqual([]);
  // Taille connue → progression en pourcentage possible (comme sur R2 avec no-transform).
  expect(modelHeaders.length).toBeGreaterThan(0);
  for (const h of modelHeaders) expect(Number(h["content-length"])).toBeGreaterThan(1_000_000);
});

test("le site n'embarque plus ni /models/ ni les binaires ONNX Runtime (limite 25 Mio de Pages)", async ({ request }) => {
  // `vite preview` répond index.html (repli SPA) pour un chemin absent : on vérifie qu'on n'obtient
  // pas le vrai fichier.
  const config = await request.get("/models/onnx-community/ormbg-ONNX/config.json");
  expect(config.headers()["content-type"] ?? "").not.toContain("application/json");
  const headersFile = await (await request.get("/_headers")).text();
  expect(headersFile).toContain("connect-src 'self' http://127.0.0.1:4180");
});
