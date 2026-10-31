import { test, expect } from "@playwright/test";
import sharp from "sharp";

/**
 * `npm run dev` : la CSP de dev doit laisser passer les styles injectés par Vite (nonce), sinon la
 * page s'affiche sans mise en forme (bug vu sur un vrai Mac). Vérification : aucune violation CSP,
 * et la capture du serveur de dev = la capture du build (preview), au pixel près ou presque.
 */
const DEV = "http://localhost:5174/";

async function shot(page: import("@playwright/test").Page, url: string): Promise<Buffer> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(url);
  await page.getByRole("button", { name: "Choose an image" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page.screenshot();
}

test("serveur de dev : styles appliqués (CSP par nonce) et rendu identique au build", async ({ page, browser }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
  });
  const dev = await shot(page, DEV);
  expect(cspErrors).toEqual([]);
  const csp = (await page.request.get(DEV)).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("style-src 'self' 'nonce-");
  expect(csp).not.toContain("unsafe-inline");

  const previewPage = await browser.newPage();
  const preview = await shot(previewPage, "/");
  await previewPage.close();

  const a = await sharp(dev).removeAlpha().raw().toBuffer();
  const b = await sharp(preview).removeAlpha().raw().toBuffer();
  expect(a.length).toBe(b.length);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
  // Moyenne d'écart par canal (0–255) : 0 = identique. Une page sans CSS donnerait > 30.
  expect(diff / a.length).toBeLessThan(1);
});
