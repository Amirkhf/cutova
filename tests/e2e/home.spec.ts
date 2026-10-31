import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// 1x1 PNG valide (pixel noir) — fixture technique, pas une photo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function pngBuffer(): Buffer {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}

/** Capture le dernier événement `image:selected` émis sur `window`. */
async function trackImageSelected(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lastImageSelected: unknown }).__lastImageSelected = null;
    window.addEventListener("image:selected", (event) => {
      const detail = (event as CustomEvent<{ file: File; source: string }>).detail;
      (window as unknown as { __lastImageSelected: unknown }).__lastImageSelected = {
        name: detail.file.name,
        type: detail.file.type,
        source: detail.source,
      };
    });
  });
}

test.beforeEach(async ({ page }) => {
  await trackImageSelected(page);
});

test("choix via le bouton principal émet image:selected", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', {
    name: "photo.png",
    mimeType: "image/png",
    buffer: pngBuffer(),
  });
  await expect(page.getByText(/Selected: photo\.png/)).toBeVisible();
  const detail = await page.evaluate(() => (window as any).__lastImageSelected);
  expect(detail).toMatchObject({ name: "photo.png", source: "picker" });
});

test("glisser-déposer sur la page émet image:selected", async ({ page }) => {
  await page.goto("/");
  const base64 = TINY_PNG_BASE64;
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "dropped.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const init = { bubbles: true, cancelable: true, dataTransfer };
    window.dispatchEvent(new DragEvent("dragenter", init));
    window.dispatchEvent(new DragEvent("dragover", init));
    window.dispatchEvent(new DragEvent("drop", init));
  }, base64);
  await expect(page.getByText(/Selected: dropped\.png/)).toBeVisible();
  const detail = await page.evaluate(() => (window as any).__lastImageSelected);
  expect(detail).toMatchObject({ name: "dropped.png", source: "drop" });
});

test("collage (Ctrl+V) émet image:selected", async ({ page }) => {
  await page.goto("/");
  const base64 = TINY_PNG_BASE64;
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "pasted.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    window.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
  }, base64);
  await expect(page.getByText(/Selected: pasted\.png/)).toBeVisible();
  const detail = await page.evaluate(() => (window as any).__lastImageSelected);
  expect(detail).toMatchObject({ name: "pasted.png", source: "paste" });
});

test("clic sur un exemple émet image:selected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Example image 1" }).click();
  await expect(page.locator(".upload-selected-name")).toBeVisible({ timeout: 10_000 });
  const detail = await page.evaluate(() => (window as any).__lastImageSelected);
  expect(detail).toMatchObject({ source: "example" });
});

test("fichier invalide affiche un message d'erreur", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', {
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is plain text, not an image"),
  });
  await expect(page.locator(".upload-status")).toContainText(/supported/i);
});

test("l'accueil ne présente aucune violation axe", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
