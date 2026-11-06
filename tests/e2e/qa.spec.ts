import { test, expect, type Page, type Request } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Recette complète, exécutée par chaque projet "qa-*" (ordinateur clair/sombre, iPhone, Android 360 px ;
 * Firefox/WebKit avec QA_ALL_BROWSERS=1) : parcours complet, robustesse, confidentialité, en-têtes.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const PHOTO = path.join(ROOT, "tests/images/fur-12162.jpg");

test.setTimeout(900_000);

function watchNetwork(page: Page): string[] {
  const problems: string[] = [];
  page.on("request", (req: Request) => {
    const host = new URL(req.url()).hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") problems.push(`externe : ${req.url()}`);
    const body = req.postDataBuffer();
    if (body && body.length > 1024) problems.push(`corps volumineux : ${req.url()}`);
  });
  return problems;
}

type Format = "png" | "webp" | "jpg";
async function download(page: Page, format: Format): Promise<Buffer> {
  const toggle = page.getByRole("button", { name: "Download options" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByRole("radio", { name: { png: /^PNG/, webp: /^WebP/, jpg: /^JPG/ }[format] }).check();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return readFile(await file.path());
}

/** Fabrique un File dans la page à partir d'un exemple servi par le site (pour glisser / coller). */
async function dispatchFile(page: Page, kind: "drop" | "paste", url: string, name: string): Promise<void> {
  await page.evaluate(
    async ([k, u, n]) => {
      const blob = await (await fetch(u!)).blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], n!, { type: blob.type }));
      if (k === "drop") {
        const init = { bubbles: true, cancelable: true, dataTransfer: dt };
        window.dispatchEvent(new DragEvent("dragenter", init));
        window.dispatchEvent(new DragEvent("dragover", init));
        window.dispatchEvent(new DragEvent("drop", init));
      } else {
        window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
      }
    },
    [kind, url, name],
  );
}

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

test("parcours complet : choisir, glisser, coller, exemple → détourage → chaque outil → chaque export → ZIP ; zéro requête externe", async ({ page }) => {
  const network = watchNetwork(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");

  // 1. Quatre façons d'ajouter une image : exemple (tant que la carte d'envoi les montre), puis
  //    sélecteur de fichiers, glisser-déposer et collage (toujours actifs sur la page).
  await page.getByRole("button", { name: "Example image 4" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 300_000 });
  await page.setInputFiles('.upload-card input[type="file"]', PHOTO);
  await dispatchFile(page, "drop", "/examples/product.webp", "glisse.webp");
  // Firefox vide le presse-papiers d'un ClipboardEvent synthétique (protection) : un vrai Ctrl+V marche,
  // mais un test ne peut pas le simuler. On le détecte et on ajoute alors l'image par le sélecteur.
  const syntheticPaste = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "x.png", { type: "image/png" }));
    return (new ClipboardEvent("paste", { clipboardData: dt }).clipboardData?.files.length ?? 0) > 0;
  });
  if (syntheticPaste) await dispatchFile(page, "paste", "/examples/animal.webp", "colle.webp");
  else {
    test.info().annotations.push({ type: "limite", description: "collage synthétique impossible dans ce navigateur : image ajoutée par le sélecteur" });
    await page.setInputFiles('.upload-card input[type="file"]', path.join(ROOT, "public/examples/animal.webp"));
  }
  await expect(page.locator(".editor-thumb")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.editor-thumb[data-status="done"]')).toHaveCount(4, { timeout: 600_000 });
  await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done");

  // 2. Chaque outil, chaque export (sur la première image : vraie photo 2000×1332).
  await page.getByRole("button", { name: "Open fur-12162.jpg" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done");
  const png = await download(page, "png");
  expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 2000, height: 1332, hasAlpha: true });

  await tab(page, "Background");
  await page.getByRole("button", { name: "Sea and pier" }).click();
  await expect(page.locator(".result-panel")).toHaveAttribute("data-background", "photo");
  const webp = await download(page, "webp");
  expect(await sharp(webp).metadata()).toMatchObject({ format: "webp", width: 2000, height: 1332 });

  await tab(page, "Effects");
  await page.getByRole("checkbox", { name: "Drop shadow" }).check();
  await page.getByRole("checkbox", { name: "Outline (sticker)" }).check();
  await tab(page, "Adjust");
  await page.getByLabel("Contrast").fill("30");
  const jpg = await download(page, "jpg");
  expect(await sharp(jpg).metadata()).toMatchObject({ format: "jpeg", width: 2000, height: 1332, hasAlpha: false });

  await tab(page, "Size");
  await page.getByLabel("Choose a format").selectOption("story-1080x1920");
  await expect(page.locator(".result-panel")).toHaveAttribute("data-out-height", "1920");
  expect(await sharp(await download(page, "png")).metadata()).toMatchObject({ width: 1080, height: 1920 });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".result-panel")).not.toHaveAttribute("data-out-height", "1920");

  // 3. ZIP des 4 images.
  const [zipFile] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download all \(4\)/ }).click()]);
  const zip = await readFile(await zipFile.path());
  expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(4);

  // 4. Confidentialité et stabilité.
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const pngHeader = (w: number, h: number) =>
  Buffer.from([...PNG_HEAD, (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, 2, 0, 0, 0]);

test("robustesse : chaque fichier piégé donne un message clair, jamais de plantage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const alert = page.locator(".upload-status");
  const cases: { name: string; mimeType: string; buffer: Buffer; expected: RegExp }[] = [
    { name: "vide.png", mimeType: "image/png", buffer: Buffer.alloc(0), expected: /empty/ },
    { name: "texte.png", mimeType: "image/png", buffer: Buffer.from("Ceci n'est pas une image."), expected: /isn't supported/ },
    { name: "abime.png", mimeType: "image/png", buffer: Buffer.concat([pngHeader(800, 600), Buffer.from("données corrompues")]), expected: /went wrong reading/ },
    { name: "photo.heic", mimeType: "image/heic", buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]), expected: /HEIC/ },
    { name: "bombe.png", mimeType: "image/png", buffer: pngHeader(40000, 20000), expected: /too large to process safely/ },
    { name: "geante.png", mimeType: "image/png", buffer: pngHeader(12000, 9000), expected: /reduced to/ },
  ];
  for (const c of cases) {
    await page.setInputFiles('.upload-card input[type="file"]', { name: c.name, mimeType: c.mimeType, buffer: c.buffer });
    await expect(alert, c.name).toContainText(c.expected);
  }
  // Extension trompeuse mais contenu valide (PNG nommé .jpg) : accepté (détection par signature).
  const realPng = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#cc3366" } }).png().toBuffer();
  await page.setInputFiles('.upload-card input[type="file"]', { name: "trompeur.jpg", mimeType: "image/jpeg", buffer: realPng });
  await expect(page.getByText("Selected: trompeur.jpg")).toBeVisible();
  expect(errors).toEqual([]);
});

test("sécurité : en-têtes du build (COOP, COEP, CSP stricte, nosniff) et _headers de production", async ({ request }) => {
  for (const url of ["/", "/fr/", "/remove-bg-alternative/"]) {
    const h = (await request.get(url)).headers();
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("style-src 'self';");
    expect(h["content-security-policy"]).not.toContain("unsafe-inline");
    expect(h["x-content-type-options"]).toBe("nosniff");
  }
  const headersFile = await readFile(path.join(ROOT, "dist/_headers"), "utf8");
  expect(headersFile).toContain("Cross-Origin-Embedder-Policy: require-corp");
  expect(headersFile).toContain("frame-ancestors 'none'");
});
