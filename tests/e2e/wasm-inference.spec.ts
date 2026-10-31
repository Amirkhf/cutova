import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Critère d'acceptation du chemin WASM (CPU) : dans Chromium headless (pas de GPU → moteur WASM),
 * un VRAI masque est produit et affiché dans l'aperçu. Vérifie aussi la qualité par rapport au
 * masque de référence BiRefNet_lite 1024 (tests/reference/, scripts/reference-masks.mjs), enregistre
 * les résultats détourés (tests/screenshots/wasm-result-*.png, PNG transparents) et les mesures de
 * temps (tests/screenshots/wasm-measures.json, reprises dans context.md > Mesures).
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const SHOTS = path.join(ROOT, "tests/screenshots");
/**
 * Photos réelles (tests/images/SOURCES.md) : cheveux, poils, objet — choisies parmi celles où le
 * modèle WASM (ormbg) atteint IoU ≥ 0,95 dans le banc Node (docs/review/bench-wasm-20-photos.jsonl).
 * Ce test vérifie donc que le navigateur reproduit le banc, pas la qualité moyenne du modèle
 * (IoU moyen sur les 20 photos : voir context.md > Décisions).
 */
const PHOTOS = ["hair-157920", "fur-12162", "product-6346"];
const MIN_IOU = 0.9;

test.setTimeout(600_000);

/** Attend la fin du traitement numéro `run` (compteur `data-run` du panneau : évite de lire le résultat précédent). */
async function waitForResult(page: Page, run: number): Promise<{ engine: string; elapsedMs: number }> {
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-run", String(run), { timeout: 60_000 });
  await expect(panel).toHaveAttribute("data-state", /done|error/, { timeout: 300_000 });
  expect(await panel.getAttribute("data-state"), await page.locator(".result-status").textContent() ?? "").toBe("done");
  return {
    engine: (await panel.getAttribute("data-engine")) ?? "",
    elapsedMs: Number(await panel.getAttribute("data-elapsed-ms")),
  };
}

/** Canvas de l'aperçu → PNG (alpha = masque). */
async function canvasPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.locator(".result-canvas").evaluate((el) => (el as HTMLCanvasElement).toDataURL("image/png"));
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function alphaStats(png: Buffer): Promise<{ fg: number }> {
  const alpha = await sharp(png).extractChannel(3).raw().toBuffer();
  let fg = 0;
  for (const a of alpha) if (a >= 128) fg++;
  return { fg: fg / alpha.length };
}

/** IoU du masque affiché vs référence 1024×1024 (l'aperçu garde le rapport d'origine : on le ramène à 1024²). */
async function iouVsReference(png: Buffer, photo: string): Promise<number> {
  const alpha = await sharp(png).extractChannel(3).resize(1024, 1024, { fit: "fill", kernel: "linear" }).raw().toBuffer();
  const ref = await sharp(path.join(ROOT, "tests/reference", `${photo}.png`)).extractChannel(0).raw().toBuffer();
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = alpha[i]! >= 128;
    const b = ref[i]! >= 128;
    if (a && b) inter++;
    if (a || b) union++;
  }
  return union ? inter / union : 1;
}

test("WASM : clic sur un exemple → vrai masque (ni vide, ni plein) affiché dans l'aperçu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Example image 1" }).click();
  const { engine } = await waitForResult(page, 1);
  expect(engine).toBe("wasm");
  const { fg } = await alphaStats(await canvasPng(page));
  // Masque réel : une partie de l'image est gardée, une partie est retirée.
  expect(fg).toBeGreaterThan(0.01);
  expect(fg).toBeLessThan(0.99);
});

test("WASM : 3 vraies photos → masques proches de la référence, PNG transparents + mesures", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  const t0 = Date.now();
  await page.goto("/");
  const measures: Record<string, unknown>[] = [];
  for (const [i, photo] of PHOTOS.entries()) {
    const started = Date.now();
    await page.setInputFiles('input[type="file"]', path.join(ROOT, "tests/images", `${photo}.jpg`));
    const { engine, elapsedMs } = await waitForResult(page, i + 1);
    const totalMs = Date.now() - started;
    expect(engine).toBe("wasm");
    const png = await canvasPng(page);
    const { fg } = await alphaStats(png);
    expect(fg).toBeGreaterThan(0.01);
    expect(fg).toBeLessThan(0.99);
    const iou = await iouVsReference(png, photo);
    await writeFile(path.join(SHOTS, `wasm-result-${photo}.png`), png);
    // Le 1er passage inclut le chargement du modèle (téléchargement/cache + création de session).
    measures.push({ photo, run: i + 1, inferenceMs: elapsedMs, clickToResultMs: totalMs, iou: +iou.toFixed(4), foreground: +fg.toFixed(3) });
    expect(iou, `IoU ${photo}`).toBeGreaterThanOrEqual(MIN_IOU);
  }
  const report = {
    date: new Date().toISOString(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    crossOriginIsolated: await page.evaluate(() => crossOriginIsolated),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    totalMs: Date.now() - t0,
    measures,
  };
  await writeFile(path.join(SHOTS, "wasm-measures.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  // Vérification croisée : le fichier de référence existe bien (sinon l'IoU n'a pas de sens).
  expect((await readFile(path.join(ROOT, "tests/reference/reference.json"), "utf8")).length).toBeGreaterThan(0);
});
