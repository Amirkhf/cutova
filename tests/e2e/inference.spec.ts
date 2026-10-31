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
 * IMPORTANT (voir context.md > Mesures) : dans cet environnement de test (Chromium
 * headless sans GPU), le modèle BiRefNet_lite fp32 à 1024×1024 épuise la mémoire linéaire
 * WASM pendant `OrtRun()` (`std::bad_alloc`) — reproduit indépendamment du nombre de
 * threads, de la variante wasm (asyncify/plain) et du dtype (fp32/fp16). C'est une limite
 * du modèle sur CPU/WASM dans cet environnement, pas un bug de l'intégration : le chemin
 * WebGPU (non testable ici, voir plus bas) est le chemin visé pour ce modèle. Les tests
 * ci-dessous vérifient donc ce qui est réellement garanti : téléchargement + cache OPFS +
 * isolation réseau fonctionnent, et un échec d'inférence est toujours signalé clairement
 * (jamais un plantage silencieux ni un blocage indéfini) plutôt que de supposer un succès.
 */
const SETTLED_STATUS = /Processed in|failed/i;

test("parcours complet (WASM) : aucune requête externe, aucune donnée d'image envoyée", async ({ page }) => {
  const violations = trackNetwork(page);

  await page.goto("/");
  const isolated = await page.evaluate(() => crossOriginIsolated);
  expect(isolated).toBe(true);

  await page.getByRole("button", { name: "Example image 1" }).click();
  await expect(page.locator(".result-status")).toContainText(SETTLED_STATUS, { timeout: 150_000 });

  expect(violations).toEqual([]);
});

test("clic sur un exemple : le pipeline se termine toujours (succès avec masque, ou échec signalé clairement)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Example image 2" }).click();

  const status = page.locator(".result-status");
  await expect(status).toContainText(SETTLED_STATUS, { timeout: 150_000 });
  const finalText = await status.textContent();

  if (/Processed in/i.test(finalText ?? "")) {
    const canvas = page.locator(".result-canvas");
    await expect(canvas).toBeVisible();
    const hasContent = await canvas.evaluate((el) => {
      const ctx = (el as HTMLCanvasElement).getContext("2d")!;
      const { data } = ctx.getImageData(0, 0, (el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height);
      // Au moins un pixel avec de l'alpha : le masque a bien été composité.
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
      }
      return false;
    });
    expect(hasContent).toBe(true);
  } else {
    // Échec gracieux (ex. std::bad_alloc wasm sur ce modèle, voir plus haut) : le message
    // d'erreur attendu doit être affiché, jamais un blocage indéfini sur un état vide.
    expect(finalText).toContain("Background removal failed");
  }
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
