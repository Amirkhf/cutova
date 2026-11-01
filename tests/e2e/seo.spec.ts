import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Pages statiques générées par seo/build.mjs (après `npm run build`), lues depuis content/. */
const CONTENT = path.resolve(import.meta.dirname, "../../content");
const PAGES = readdirSync(CONTENT)
  .filter((f) => f.endsWith(".json") && f !== "site.json")
  .flatMap((f) => {
    const doc = JSON.parse(readFileSync(path.join(CONTENT, f), "utf8")) as { type?: string; locales: Record<string, { path: string }> };
    return Object.entries(doc.locales).map(([lang, page]) => ({ path: page.path, lang, legal: doc.type === "legal" }));
  });

async function hreflangs(page: Page): Promise<Record<string, string>> {
  return page.$$eval('link[rel="alternate"][hreflang]', (links) =>
    Object.fromEntries(links.map((l) => [l.getAttribute("hreflang")!, new URL(l.getAttribute("href")!).pathname])),
  );
}

for (const { path, lang, legal } of PAGES) {
  test(`SEO ${path} : langue, titre, description, canonical, hreflang réciproques, JSON-LD, h1`, async ({ page, request }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).hostname;
      if (host && host !== "localhost" && host !== "127.0.0.1") external.push(r.url());
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    expect((await page.title()).length).toBeGreaterThan(20);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description!.length).toBeGreaterThan(70);
    expect(description!.length).toBeLessThanOrEqual(200);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical!).pathname).toBe(path);
    await expect(page.locator("h1")).toHaveCount(1);

    // hreflang : la page se cite elle-même, et chaque alternative renvoie vers elle (réciprocité).
    const alts = await hreflangs(page);
    expect(alts[lang]).toBe(path);
    expect(alts["x-default"]).toBeTruthy();
    for (const [code, altPath] of Object.entries(alts)) {
      if (code === "x-default" || altPath === path) continue;
      const html = await (await request.get(altPath)).text();
      expect(html, `${altPath} doit pointer vers ${path}`).toContain(`hreflang="${lang}" href="${new URL(canonical!).href}"`);
    }

    // JSON-LD valide.
    const blocks = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent ?? ""));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(() => JSON.parse(block)).not.toThrow();
    // FAQ sur toutes les pages sauf légales (fil d'Ariane pour celles-ci).
    expect(blocks.some((b) => b.includes(legal ? '"BreadcrumbList"' : '"FAQPage"'))).toBe(true);

    expect(external).toEqual([]);
  });
}

test("/remove-bg-alternative : date de fermeture de remove.bg avec sa source officielle (EN et FR)", async ({ page }) => {
  for (const [path, date] of [
    ["/remove-bg-alternative/", "December 1, 2026"],
    ["/fr/alternative-remove-bg/", "1er décembre 2026"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText(date);
    const source = page.locator('.seo-source a[href="https://www.remove.bg/faq"]');
    await expect(source).toHaveCount(1);
    await expect(source).toHaveAttribute("rel", /noopener/);
  }
});

test("fichiers racine : robots.txt (robots IA autorisés), sitemap.xml (toutes les pages), llms.txt", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("User-agent: GPTBot\nAllow: /");
  expect(robots).toContain("User-agent: ClaudeBot\nAllow: /");
  expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap.match(/<loc>/g)).toHaveLength(PAGES.length);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toMatch(/^# Cutova\n\n> /);
});

test("pages guides : aucune violation axe (EN et FR)", async ({ page }) => {
  for (const url of ["/", "/remove-bg-alternative/", "/fr/tutoriels/creer-png-transparent/", "/fr/", "/for/ecommerce/", "/fr/confidentialite/"]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${url}: ${v.id}`)).toEqual([]);
  }
});

test("accueil /fr/ : l'application démarre en français et le sélecteur mène à /", async ({ page }) => {
  await page.goto("/fr/");
  await expect(page.getByRole("button", { name: "Choisir une image" })).toBeVisible();
  await page.getByLabel("Langue").selectOption("en");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Choose an image" })).toBeVisible();
});

test("accueil : galerie à onglets (clic, flèches), images chargées, pied de page et liens vers les usages", async ({ page }) => {
  await page.goto("/");
  const tabs = page.locator(".gallery-tabs [role=tab]");
  await expect(tabs).toHaveCount(5);
  await page.getByRole("tab", { name: "Cars" }).click();
  await expect(page.locator("#gallery-panel-cars")).toBeVisible();
  await expect(page.locator("#gallery-panel-people")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Graphics" })).toBeFocused();
  await expect(page.locator("#gallery-panel-graphics")).toBeVisible();
  const imgs = page.locator("#gallery-panel-graphics img");
  await expect(imgs).toHaveCount(4);
  for (const img of await imgs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for (const href of ["/for/ecommerce/", "/legal/", "/privacy/", "/terms/"]) {
    await expect(page.locator(`footer a[href="${href}"]`).first()).toBeVisible();
  }
  await expect(page.locator('#uses a[href="/for/photographers/"]')).toBeVisible();
});

test("exemples et démo : vraies photos optimisées (≤ 150 Ko) avec leurs sources", async ({ page, request }) => {
  await page.goto("/");
  const thumbs = page.locator(".upload-example img");
  await expect(thumbs).toHaveCount(4);
  for (const t of await thumbs.all()) await expect.poll(() => t.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  for (const file of ["/examples/person.webp", "/examples/car.webp", "/showcase/demo-before.webp", "/showcase/demo-after.webp"]) {
    const res = await request.get(file);
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeLessThanOrEqual(150 * 1024);
  }
  expect((await request.get("/examples/SOURCES.md")).status()).toBe(200);
  await expect(page.locator(".home-demo img").first()).toHaveAttribute("src", "/showcase/demo-before.webp");
});

test("pages légales : champs à compléter visibles, liées depuis toutes les pages", async ({ page }) => {
  for (const url of ["/legal/", "/fr/mentions-legales/", "/privacy/", "/fr/conditions/"]) {
    await page.goto(url);
    await expect(page.locator("main")).toContainText("[À COMPLÉTER]");
  }
  await page.goto("/how-to/make-transparent-png/");
  await expect(page.locator('footer a[href="/privacy/"]')).toBeVisible();
});
