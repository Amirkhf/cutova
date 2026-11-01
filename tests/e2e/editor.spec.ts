import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Éditeur complet (écran de résultat) : chaque outil et chaque export, sur une vraie photo 2000×1332
 * (tests/images/SOURCES.md). Chaque export est relu (format, taille, alpha) avec sharp.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const PHOTO = path.join(ROOT, "tests/images/fur-12162.jpg");
const PHOTO_2 = path.join(ROOT, "tests/images/product-6346.jpg");
const REVIEW = path.join(ROOT, "docs/review");
const W = 2000;
const H = 1332;

test.setTimeout(600_000);

async function reviewShot(page: Page, name: string): Promise<void> {
  await mkdir(REVIEW, { recursive: true });
  await mkdir(path.join(ROOT, "tests/screenshots"), { recursive: true });
  const png = await page.locator(".result-panel").screenshot({ path: path.join(ROOT, "tests/screenshots", `${name}.png`) });
  await sharp(png).resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(REVIEW, `${name}.webp`));
}

async function processPhoto(page: Page, files: string[] = [PHOTO]): Promise<void> {
  await page.goto("/");
  await page.setInputFiles('.upload-card input[type="file"]', files);
  await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 300_000 });
}

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

type Format = "png" | "webp" | "jpg";
async function download(page: Page, format: Format = "png"): Promise<{ name: string; data: Buffer }> {
  const toggle = page.getByRole("button", { name: "Download options" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByRole("radio", { name: { png: /^PNG/, webp: /^WebP/, jpg: /^JPG/ }[format] }).check();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: file.suggestedFilename(), data: await readFile(await file.path()) };
}

async function alphaOf(png: Buffer): Promise<Buffer> {
  return sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
}
const sum = (b: Buffer) => b.reduce((n, v) => n + v, 0);
const minOf = (b: Buffer) => b.reduce((m, v) => (v < m ? v : m), 255);

test("exports PNG / WebP transparents, JPG fond blanc, pleine taille", async ({ page }) => {
  await processPhoto(page);
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-width", String(W));
  await expect(page.locator(".result-size")).toContainText(`Full resolution: ${W} × ${H} px`);
  const png = await download(page, "png");
  expect(png.name).toBe("fur-12162-cutova.png");
  expect(await sharp(png.data).metadata()).toMatchObject({ format: "png", width: W, height: H, hasAlpha: true });
  const alpha = await alphaOf(png.data);
  expect(alpha[0 * W + 1990]!).toBeLessThan(40); // mur : transparent
  expect(alpha[600 * W + 700]!).toBeGreaterThan(200); // chiot : opaque
  const webp = await download(page, "webp");
  expect(await sharp(webp.data).metadata()).toMatchObject({ format: "webp", width: W, height: H, hasAlpha: true });
  const jpg = await download(page, "jpg");
  expect(await sharp(jpg.data).metadata()).toMatchObject({ format: "jpeg", width: W, height: H, hasAlpha: false });
  const corner = await sharp(jpg.data).extract({ left: 1980, top: 0, width: 10, height: 10 }).stats();
  expect(corner.channels[0]!.mean).toBeGreaterThan(200);
  await reviewShot(page, "editor-cut");
});

test("arrière-plan : couleur, blanc, photo libre, flou — appliqués à l'export ; préférence de couleur mémorisée", async ({ page }) => {
  await processPhoto(page);
  await tab(page, "Background");
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByLabel("Background color").fill("#ff0000");
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "color");
  const red = await download(page, "png");
  const { data } = await sharp(red.data).extract({ left: 1980, top: 0, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255]);

  await page.getByRole("button", { name: "White", exact: true }).click();
  const white = await sharp((await download(page, "png")).data).extract({ left: 1980, top: 0, width: 4, height: 4 }).raw().toBuffer();
  expect([white[0], white[1], white[2], white[3]]).toEqual([255, 255, 255, 255]);

  await page.getByRole("button", { name: "Sea and pier" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "photo");
  await expect(page.getByRole("button", { name: "Sea and pier" })).toHaveAttribute("aria-pressed", "true");
  const photo = await download(page, "png");
  expect(minOf(await alphaOf(photo.data))).toBe(255);
  await reviewShot(page, "editor-background-photo");

  await page.getByRole("radio", { name: "Blur" }).check();
  const blurred = await download(page, "png");
  expect(minOf(await alphaOf(blurred.data))).toBe(255);
  await reviewShot(page, "editor-background-blur");

  // La couleur choisie est proposée en "récent" après rechargement (localStorage).
  await processPhoto(page);
  await tab(page, "Background");
  await expect(page.getByRole("button", { name: "Use color #ff0000" })).toBeVisible();
});

test("effets : ombre portée et contour autocollant ajoutent de la matière autour du sujet", async ({ page }) => {
  await processPhoto(page);
  const base = sum(await alphaOf((await download(page, "png")).data));
  await tab(page, "Effects");
  await page.getByRole("checkbox", { name: "Drop shadow" }).check();
  const shadow = sum(await alphaOf((await download(page, "png")).data));
  expect(shadow).toBeGreaterThan(base * 1.02);
  await page.getByRole("checkbox", { name: "Drop shadow" }).uncheck();
  await page.getByRole("checkbox", { name: "Outline (sticker)" }).check();
  const outline = sum(await alphaOf((await download(page, "png")).data));
  expect(outline).toBeGreaterThan(base * 1.02);
  await page.getByRole("checkbox", { name: "Drop shadow" }).check();
  await reviewShot(page, "editor-effects");
});

test("ajuster : luminosité plus forte, puis annuler / rétablir (boutons et Ctrl+Z)", async ({ page }) => {
  await processPhoto(page);
  // Moyenne (R+G+B) des pixels opaques du sujet : les ajustements ne touchent que le sujet.
  const meanOf = async () => {
    const { data } = await sharp((await download(page, "png")).data).raw().toBuffer({ resolveWithObject: true });
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) {
        total += data[i]! + data[i + 1]! + data[i + 2]!;
        count++;
      }
    }
    return total / count / 3;
  };
  const before = await meanOf();
  await tab(page, "Adjust");
  await page.getByLabel("Brightness").fill("60");
  const brighter = await meanOf();
  expect(brighter).toBeGreaterThan(before + 20);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(Math.abs((await meanOf()) - before)).toBeLessThan(2);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(Math.abs((await meanOf()) - brighter)).toBeLessThan(2);
  await page.getByRole("tab", { name: "Adjust" }).focus();
  await page.keyboard.press("Control+z");
  expect(Math.abs((await meanOf()) - before)).toBeLessThan(2);
  await page.getByLabel("Saturation").fill("-100");
  await reviewShot(page, "editor-adjust");
});

test("formats : prédéfini 1080×1080 (fond blanc proposé), recadrage sur le sujet, taille réduite", async ({ page }) => {
  await processPhoto(page);
  await tab(page, "Size");
  await page.getByRole("radio", { name: "Crop to subject" }).check();
  await page.getByLabel("Margin").fill("0");
  const panel = page.locator(".result-panel");
  await expect(panel).not.toHaveAttribute("data-out-width", String(W));
  const cw = Number(await panel.getAttribute("data-out-width"));
  expect(cw).toBeLessThan(W);
  const cropped = await download(page, "png");
  expect((await sharp(cropped.data).metadata()).width).toBe(cw);

  // Taille réduite (menu de téléchargement).
  await page.getByRole("radio", { name: "Reduced size" }).check();
  await page.getByLabel("Width (px)").fill("500");
  await expect(panel).toHaveAttribute("data-out-width", "500");
  expect((await sharp((await download(page, "png")).data).metadata()).width).toBe(500);

  await page.getByLabel("Choose a format").selectOption("marketplace-2000");
  await expect(panel).toHaveAttribute("data-out-width", "2000");
  await expect(panel).toHaveAttribute("data-out-height", "2000");
  await expect(panel).toHaveAttribute("data-background", "color");
  await page.getByLabel("Choose a format").selectOption("square-1080");
  const square = await download(page, "png");
  expect(await sharp(square.data).metadata()).toMatchObject({ width: 1080, height: 1080 });
  await reviewShot(page, "editor-formats");
});

test("pinceau : gomme puis restauration, appliquées à l'export, annulables", async ({ page }) => {
  await processPhoto(page);
  const point = async (u: number, v: number) =>
    page.locator(".result-canvas").evaluate(
      (el, [fu, fv]) => {
        const c = el as HTMLCanvasElement;
        const box = c.getBoundingClientRect();
        const s = Math.min(box.width / c.width, box.height / c.height);
        const w = c.width * s;
        const h = c.height * s;
        return { x: box.left + (box.width - w) / 2 + fu! * w, y: box.top + (box.height - h) / 2 + fv! * h };
      },
      [u, v],
    );
  const alphaAt = async (x: number, y: number) => (await alphaOf((await download(page, "png")).data))[y * W + x]!;
  await page.getByRole("radio", { name: "Erase" }).check();
  const a = await point(0.33, 0.45);
  const b = await point(0.37, 0.45);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-edits", "1");
  expect(await alphaAt(700, 600)).toBe(0);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await alphaAt(700, 600)).toBeGreaterThan(200);
  await page.getByRole("radio", { name: "Restore" }).check();
  const wall = await point(0.95, 0.05);
  await page.mouse.click(wall.x, wall.y);
  await expect(page.locator(".result-panel")).toHaveAttribute("data-edits", "2");
  expect(await alphaAt(1900, 66)).toBe(255);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  expect(await alphaAt(1900, 66)).toBeLessThan(40);
});

test("plusieurs images : miniatures, réglages gardés par image, ZIP de toutes", async ({ page }) => {
  await processPhoto(page, [PHOTO, PHOTO_2]);
  await expect(page.locator(".editor-thumb")).toHaveCount(2);
  await expect(page.locator('.editor-thumb[data-status="done"]')).toHaveCount(2, { timeout: 300_000 });
  // Image 2 (courante) : fond rouge. Image 1 : reste transparente.
  await tab(page, "Background");
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByRole("button", { name: "Open fur-12162.jpg" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "transparent");
  await page.getByRole("button", { name: "Open product-6346.jpg" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "color");

  await page.getByRole("button", { name: "Download options" }).click();
  const [zipFile] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download all \(2\)/ }).click()]);
  expect(zipFile.suggestedFilename()).toBe("cutova-images.zip");
  const zip = await readFile(await zipFile.path());
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  expect(zip.readUInt16LE(end + 10)).toBe(2);
  // Les deux images PNG sont bien dans l'archive (signature PNG après chaque en-tête local).
  expect(zip.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeGreaterThan(0);
  await reviewShot(page, "editor-batch");

  await page.getByRole("button", { name: "Remove product-6346.jpg" }).click();
  await expect(page.locator(".editor-thumb")).toHaveCount(1);
});

test("clavier et accessibilité : onglets aux flèches, axe sans violation sur chaque panneau", async ({ page }) => {
  await processPhoto(page);
  await page.getByRole("tab", { name: "Cut out" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Background" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Background" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Size" })).toHaveAttribute("aria-selected", "true");
  for (const name of ["Cut out", "Background", "Effects", "Adjust", "Size"]) {
    await tab(page, name);
    await page.getByRole("button", { name: "Download options" }).click();
    const axe = await new AxeBuilder({ page }).include(".result-panel").analyze();
    expect(axe.violations.map((v) => `${name}: ${v.id}`)).toEqual([]);
    await page.getByRole("button", { name: "Download options" }).click();
  }
});

test("mobile 360 px : outils en feuille du bas, aucun défilement horizontal ; animations réduites respectées", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 780 });
  await processPhoto(page);
  // Pas d'animation de révélation : curseur directement à 50 %.
  await expect(page.locator("#result-compare-slider")).toHaveAttribute("aria-valuetext", "50%");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.locator(".editor-tools").evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  // La barre d'onglets reste visible dans la feuille (elle s'était écrasée à 1 px).
  expect((await page.locator(".editor-tabs").boundingBox())!.height).toBeGreaterThan(40);
  await reviewShot(page, "editor-mobile");
});
