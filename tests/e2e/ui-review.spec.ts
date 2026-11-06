import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/** Corrections UI (menus, pages statiques stylées, progression du détourage) + captures 360 / 1440 px. */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SHOTS = path.join(ROOT, "tests/screenshots");
const PHOTO = path.join(ROOT, "tests/images/product-6346.jpg");
const PHOTO_2 = path.join(ROOT, "tests/images/fur-12162.jpg");
const WIDTHS = [360, 1440] as const;

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

/** Enregistre chaque étape affichée (texte de la zone aria-live) pendant le traitement. */
async function recordStages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __stages: string[] }).__stages = seen;
    new MutationObserver(() => {
      const el = document.querySelector(".editor-progress-step");
      const text = el?.textContent ?? "";
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

test.describe("progression du détourage", () => {
  test.setTimeout(400_000);

  test("étapes nommées envoyées par le worker, aria-live, barre, balayage, puis Terminé", async ({ page }) => {
    await recordStages(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/fr/");
    await page.setInputFiles('.upload-card input[type="file"]', [PHOTO]);
    const progress = page.locator(".editor-progress");
    await expect(progress).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".editor-progress-step")).toHaveAttribute("aria-live", "polite");
    await expect(progress.locator('[role="progressbar"]').first()).toHaveAttribute("aria-valuenow", /\d+/);
    await expect(page.locator(".editor-stage")).toHaveAttribute("data-busy", "true");
    // Le lot (1 image) n'affiche pas de barre globale.
    await expect(page.locator(".editor-progress-batch")).toBeHidden();
    await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 300_000 });
    await expect(progress).toBeHidden({ timeout: 5_000 });
    const stages = await page.evaluate(() => (window as unknown as { __stages: string[] }).__stages);
    expect(stages).toEqual(["Préparation", "Analyse du sujet", "Finition des bords", "Terminé"]);
  });

  test("lot : « Image 1 / 2 » puis « Image 2 / 2 » et barre globale ; captures 360 et 1440 px", async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
      await page.goto("/fr/");
      await page.setInputFiles('.upload-card input[type="file"]', [PHOTO, PHOTO_2]);
      await expect(page.locator(".editor-progress-batch")).toHaveText("Image 1 / 2", { timeout: 60_000 });
      await expect(page.locator(".editor-progress-bar-global")).toBeVisible();
      await page.locator(".editor-progress").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `progress-${width}.png`) });
      await expect(page.locator(".editor-progress-batch")).toHaveText("Image 2 / 2", { timeout: 300_000 });
      await expect(page.locator(".editor-progress")).toBeHidden({ timeout: 300_000 });
    }
  });

  test("animations réduites : pas de balayage animé", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.setInputFiles('.upload-card input[type="file"]', [PHOTO]);
    await expect(page.locator(".editor-stage[data-busy]")).toBeVisible({ timeout: 60_000 });
    const animation = await page.evaluate(() => getComputedStyle(document.querySelector(".editor-stage .compare-frame")!, "::after").animationName);
    expect(animation).toBe("none");
  });
});

test("captures des menus et des pages statiques (360 et 1440 px)", async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator(".dd-lang .dd-trigger").click();
    await page.waitForTimeout(300); // fin de la rotation du chevron
    await page.screenshot({ path: path.join(SHOTS, `menu-lang-${width}.png`) });
    await page.locator(".dd-nav .dd-trigger").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `menu-tools-${width}.png`) });
    await page.goto("/for/ecommerce/");
    await page.screenshot({ path: path.join(SHOTS, `page-for-ecommerce-${width}.png`), fullPage: true });
    await page.goto("/fr/tutoriels/creer-png-transparent/");
    await page.screenshot({ path: path.join(SHOTS, `page-fr-howto-${width}.png`), fullPage: true });
  }
});
