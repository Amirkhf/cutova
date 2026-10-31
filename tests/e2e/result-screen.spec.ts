import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Écran de résultat (phase 2) : pleine résolution, curseur avant/après, fonds, exports, "Nouvelle image".
 * Photo réelle 2000×1332 (tests/images/SOURCES.md) : l'export doit sortir à cette taille exacte.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const PHOTO = path.join(ROOT, "tests/images/fur-12162.jpg");
const REVIEW = path.join(ROOT, "docs/review");

test.setTimeout(600_000);

/** Capture du panneau : PNG brut dans tests/screenshots/, copie WebP compressée dans docs/review/. */
async function reviewShot(page: Page, name: string): Promise<void> {
  await mkdir(REVIEW, { recursive: true });
  await mkdir(path.join(ROOT, "tests/screenshots"), { recursive: true });
  const png = await page.locator(".result-panel").screenshot({ path: path.join(ROOT, "tests/screenshots", `${name}.png`) });
  await sharp(png).webp({ quality: 78 }).toFile(path.join(REVIEW, `${name}.webp`));
}

async function processPhoto(page: Page): Promise<void> {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', PHOTO);
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-run", "1", { timeout: 60_000 });
  await expect(panel).toHaveAttribute("data-state", "done", { timeout: 300_000 });
}

async function download(page: Page, format: "png" | "webp" | "jpg"): Promise<{ name: string; data: Buffer }> {
  await page.getByRole("radio", { name: format === "webp" ? "WebP" : format.toUpperCase() }).check();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  const filePath = await file.path();
  return { name: file.suggestedFilename(), data: await readFile(filePath) };
}

test("résultat pleine résolution : exports PNG/WebP transparents, JPG opaque, bonne taille", async ({ page }) => {
  await processPhoto(page);
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-width", "2000");
  await expect(panel).toHaveAttribute("data-height", "1332");
  await expect(page.getByText("Full resolution: 2000 × 1332 px")).toBeVisible();

  const png = await download(page, "png");
  expect(png.name).toBe("fur-12162-cutova.png");
  const pngMeta = await sharp(png.data).metadata();
  expect([pngMeta.width, pngMeta.height, pngMeta.hasAlpha]).toEqual([2000, 1332, true]);
  // Le fond est bien transparent : le coin haut-droit (mur) a un alpha faible, le chiot est opaque.
  const alpha = await sharp(png.data).extractChannel(3).raw().toBuffer();
  expect(alpha[0 * 2000 + 1990]!).toBeLessThan(40);
  expect(alpha[600 * 2000 + 700]!).toBeGreaterThan(200);

  const webp = await download(page, "webp");
  expect(webp.name).toBe("fur-12162-cutova.webp");
  expect((await sharp(webp.data).metadata()).hasAlpha).toBe(true);

  // JPG + fond transparent → note affichée et fond blanc dans le fichier.
  await page.getByRole("radio", { name: "JPG" }).check();
  await expect(page.locator(".result-note")).toContainText("JPG has no transparency");
  const jpg = await download(page, "jpg");
  const jpgMeta = await sharp(jpg.data).metadata();
  expect([jpgMeta.format, jpgMeta.width, jpgMeta.height]).toEqual(["jpeg", 2000, 1332]);
  expect(jpgMeta.hasAlpha).toBe(false);
  // Le JPG = le PNG composité sur blanc (à la compression près).
  const expected = await sharp(png.data).flatten({ background: "#ffffff" }).raw().toBuffer();
  const actual = await sharp(jpg.data).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff += Math.abs(expected[i]! - actual[i]!);
  expect(diff / expected.length).toBeLessThan(4);
});

test("fond couleur : appliqué à l'aperçu et à l'export", async ({ page }) => {
  await processPhoto(page);
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByLabel("Background color").fill("#ff0000");
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "color");
  const png = await download(page, "png");
  const { data, info } = await sharp(png.data).extract({ left: 1980, top: 0, width: 10, height: 10 }).raw().toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(4);
  // Rouge opaque dans le coin (fond), plus de transparence.
  expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255]);

  await reviewShot(page, "phase2-result-color");
});

test("curseur avant/après au clavier, puis \"Nouvelle image\" ramène à l'envoi", async ({ page }) => {
  await processPhoto(page);
  const slider = page.getByRole("slider", { name: "Compare original and result" });
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuetext", "49%");
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "100%");

  await slider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("PageUp");
  await reviewShot(page, "phase2-result-transparent");

  const axe = await new AxeBuilder({ page }).include(".result-panel").analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "New image" }).click();
  await expect(page.locator(".result-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: /choose/i }).first()).toBeFocused();
});

test("mobile : l'écran de résultat tient dans 360 px sans défilement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await processPhoto(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await reviewShot(page, "phase2-result-mobile");
});

/** Point (fractions de l'image) → coordonnées écran dans l'aperçu (object-fit: contain). */
async function screenPoint(page: Page, u: number, v: number): Promise<{ x: number; y: number }> {
  return page.locator(".result-canvas").evaluate(
    (el, [fu, fv]) => {
      const c = el as HTMLCanvasElement;
      const box = c.getBoundingClientRect();
      const scale = Math.min(box.width / c.width, box.height / c.height);
      const w = c.width * scale;
      const h = c.height * scale;
      return { x: box.left + (box.width - w) / 2 + fu! * w, y: box.top + (box.height - h) / 2 + fv! * h };
    },
    [u, v],
  );
}

async function exportedAlpha(page: Page, points: [number, number][]): Promise<number[]> {
  const png = await download(page, "png");
  const alpha = await sharp(png.data).extractChannel(3).raw().toBuffer();
  return points.map(([x, y]) => alpha[y * 2000 + x]!);
}

test("gomme / restauration : appliquées à l'export pleine résolution, annulables", async ({ page }) => {
  await processPhoto(page);
  // Chiot (opaque) en (700, 600) ; mur (transparent) en (1900, 66) sur l'image 2000×1332.
  const subject: [number, number] = [700, 600];
  const wall: [number, number] = [1900, 66];
  const [subjectBefore, wallBefore] = await exportedAlpha(page, [subject, wall]);
  expect(subjectBefore).toBeGreaterThan(200);
  expect(wallBefore).toBeLessThan(40);

  // Gomme : un trait horizontal sur le chiot.
  await page.getByRole("radio", { name: "Erase" }).check();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-tool", "erase");
  const a = await screenPoint(page, 0.33, 0.45);
  const b = await screenPoint(page, 0.37, 0.45);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-edits", "1");
  expect((await exportedAlpha(page, [subject]))[0]).toBe(0);

  // Annuler : le chiot revient.
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await exportedAlpha(page, [subject]))[0]).toBeGreaterThan(200);

  // Restaurer : un clic sur le mur le rend opaque.
  await page.getByRole("radio", { name: "Restore" }).check();
  const w = await screenPoint(page, 0.95, 0.05);
  await page.mouse.click(w.x, w.y);
  expect((await exportedAlpha(page, [wall]))[0]).toBe(255);
  await reviewShot(page, "p0-touchup-restore");

  // Réinitialiser : retour au masque d'origine.
  await page.getByRole("button", { name: "Reset" }).click();
  expect((await exportedAlpha(page, [wall]))[0]).toBeLessThan(40);
});

test("recadrage sur le sujet (+ marge) et largeur de sortie appliqués à l'export", async ({ page }) => {
  await processPhoto(page);
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-out-width", "2000");

  // Recadrage sans marge : l'image exportée est plus petite et le sujet touche les bords.
  await page.getByRole("radio", { name: "Crop to subject" }).check();
  await page.getByLabel("Margin").fill("0");
  const cropW = Number(await panel.getAttribute("data-out-width"));
  const cropH = Number(await panel.getAttribute("data-out-height"));
  expect(cropW).toBeLessThan(2000);
  await expect(page.locator(".result-size")).toContainText(`Output: ${cropW} × ${cropH} px`);
  const cropped = await download(page, "png");
  const meta = await sharp(cropped.data).metadata();
  expect([meta.width, meta.height]).toEqual([cropW, cropH]);
  const alpha = await sharp(cropped.data).extractChannel(3).raw().toBuffer();
  let left = cropW;
  let right = -1;
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      if (alpha[y * cropW + x]! > 16) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  expect(left).toBeLessThanOrEqual(3);
  expect(right).toBeGreaterThanOrEqual(cropW - 4);

  // Largeur de sortie 500 px : rapport conservé.
  await page.getByLabel("Width (px)").fill("500");
  await expect(panel).toHaveAttribute("data-out-width", "500");
  const resized = await download(page, "png");
  const rmeta = await sharp(resized.data).metadata();
  expect(rmeta.width).toBe(500);
  expect(Math.abs(rmeta.height! - Math.round((cropH * 500) / cropW))).toBeLessThanOrEqual(1);
  await reviewShot(page, "p0-crop-subject");

  // Retour au cadrage d'origine : pleine taille.
  await page.getByRole("radio", { name: "Original framing" }).check();
  await expect(panel).toHaveAttribute("data-out-width", "2000");
});
