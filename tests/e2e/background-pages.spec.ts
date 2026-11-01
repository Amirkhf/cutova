import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** Pages /white-background et /photo-background (5 langues) + présélection du fond dans l'outil. */
const ROOT = path.resolve(import.meta.dirname, "../..");
const PHOTO = path.join(ROOT, "tests/images/product-6346.jpg");

const PAGES = await Promise.all(
  ["white-background", "photo-background"].map(async (id) => {
    const doc = JSON.parse(await readFile(path.join(ROOT, "content", `${id}.json`), "utf8")) as { locales: Record<string, { path: string; cta: { query: string } }> };
    return Object.entries(doc.locales).map(([lang, p]) => ({ id, lang, path: p.path, query: p.cta.query }));
  }),
).then((all) => all.flat());

test("10 pages : réponse directe juste sous le h1, CTA vers l'outil avec le fond présélectionné, HowTo + FAQ", async ({ page }) => {
  expect(PAGES).toHaveLength(10);
  const homes: Record<string, string> = { en: "/", fr: "/fr/", "pt-br": "/pt-br/", es: "/es/", id: "/id/" };
  for (const p of PAGES) {
    await page.goto(p.path);
    await expect(page.locator("main > h1 + .seo-answer")).toBeVisible();
    const ctas = page.locator(".seo-cta a");
    await expect(ctas.first()).toHaveAttribute("href", `${homes[p.lang]}${p.query}`);
    const ld = (await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent ?? ""))).join("");
    expect(ld).toContain('"HowTo"');
    expect(ld).toContain('"FAQPage"');
    await expect(page.locator(".seo-footer-links").first()).toContainText(await page.locator("h1").innerText());
  }
});

test.describe("présélection du fond depuis l'URL", () => {
  test.setTimeout(400_000);
  test("?bg=white : onglet Arrière-plan ouvert, export JPG à fond blanc pur", async ({ page }) => {
    await page.goto("/?bg=white");
    await page.setInputFiles('.upload-card input[type="file"]', [PHOTO]);
    await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 300_000 });
    await expect(page.getByRole("tab", { name: "Background" })).toHaveAttribute("aria-selected", "true");
    const toggle = page.getByRole("button", { name: "Download options" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await page.getByRole("radio", { name: /^PNG/ }).check();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    const { data, info } = await sharp(await readFile(await file.path())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Coin supérieur gauche : fond, donc blanc pur et opaque.
    expect([...data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(info.width).toBeGreaterThan(1000);
  });

  test("?bg=photo : onglet Arrière-plan ouvert, première photo de fond choisie", async ({ page }) => {
    await page.goto("/fr/?bg=photo");
    await page.setInputFiles('.upload-card input[type="file"]', [PHOTO]);
    await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 300_000 });
    await expect(page.getByRole("tab", { name: "Arrière-plan" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('.result-panel button[aria-pressed="true"]').filter({ has: page.locator("img") }).first()).toBeVisible();
  });
});
