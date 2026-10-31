import { test, expect, type Page, type Request } from "@playwright/test";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);

interface NetworkViolation {
  url: string;
  reason: string;
}

/** Collecte toute requête vers un hôte externe, ou toute requête dont le corps semble contenir des données d'image. */
function trackNetwork(page: Page): NetworkViolation[] {
  const violations: NetworkViolation[] = [];
  page.on("request", (req: Request) => {
    let hostname: string;
    try {
      hostname = new URL(req.url()).hostname;
    } catch {
      return;
    }
    if (hostname && !ALLOWED_HOSTS.has(hostname)) {
      violations.push({ url: req.url(), reason: `hôte externe: ${hostname}` });
      return;
    }
    const postData = req.postDataBuffer();
    if (postData && postData.length > 1024) {
      // Toute requête de cette app est censée être un GET d'asset statique ; un corps
      // volumineux suggérerait une image envoyée, ce qui ne doit jamais arriver.
      violations.push({ url: req.url(), reason: `corps de requête volumineux (${postData.length} octets)` });
    }
  });
  return violations;
}

test.setTimeout(180_000);

/**
 * Chemin WASM (Chromium headless, pas de GPU). Depuis la décision "modèle WASM plus léger"
 * (context.md > Décisions, `src/core/model/models.json`), l'inférence aboutit : on exige donc un
 * succès. Le masque lui-même est vérifié en détail dans wasm-inference.spec.ts.
 */
const SETTLED_STATUS = /Processed in|failed/i;
const SUCCESS_STATUS = /Processed in/i;

test("parcours complet (WASM) : aucune requête externe, aucune donnée d'image envoyée", async ({ page }) => {
  const violations = trackNetwork(page);
  // Poids du modèle servis avec Content-Length et sans compression : la progression peut afficher %.
  const modelHeaders: Record<string, string>[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".onnx") && r.status() === 200) modelHeaders.push(r.headers());
  });

  await page.goto("/");
  const isolated = await page.evaluate(() => crossOriginIsolated);
  expect(isolated).toBe(true);

  await page.getByRole("button", { name: "Example image 1" }).click();
  await expect(page.locator(".result-status")).toContainText(SETTLED_STATUS, { timeout: 150_000 });

  expect(violations).toEqual([]);
  expect(modelHeaders.length).toBeGreaterThan(0);
  for (const h of modelHeaders) {
    expect(Number(h["content-length"])).toBeGreaterThan(1_000_000);
    expect(h["content-encoding"] ?? "identity").toBe("identity");
  }
});

test("clic sur un exemple : le pipeline aboutit et le masque est composité dans l'aperçu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Example image 2" }).click();

  const status = page.locator(".result-status");
  await expect(status).toContainText(SETTLED_STATUS, { timeout: 150_000 });
  await expect(status).toContainText(SUCCESS_STATUS);
  const canvas = page.locator(".result-canvas");
  await expect(canvas).toBeVisible();
  const transparentShare = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 128) transparent++;
    return transparent / (data.length / 4);
  });
  // Le fond a été retiré (une partie transparente) sans tout retirer.
  expect(transparentShare).toBeGreaterThan(0.01);
  expect(transparentShare).toBeLessThan(0.99);
});

test("rechargement : le modèle vient du cache OPFS, aucun nouveau téléchargement du .onnx", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Example image 3" }).click();
  await expect(page.locator(".result-status")).toContainText(SETTLED_STATUS, { timeout: 150_000 });

  let onnxRequests = 0;
  page.on("request", (req) => {
    if (req.url().endsWith(".onnx")) onnxRequests++;
  });

  await page.reload();
  await page.getByRole("button", { name: "Example image 3" }).click();
  await expect(page.locator(".result-status")).toContainText(SETTLED_STATUS, { timeout: 150_000 });

  expect(onnxRequests).toBe(0);
});
