import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Pages statiques générées par seo/build.mjs (après `npm run build`). */
const PAGES = [
  { path: "/", lang: "en" },
  { path: "/fr/", lang: "fr" },
  { path: "/remove-bg-alternative/", lang: "en" },
  { path: "/fr/alternative-remove-bg/", lang: "fr" },
  { path: "/how-to/remove-background-from-photo/", lang: "en" },
  { path: "/how-to/make-transparent-png/", lang: "en" },
  { path: "/how-to/change-photo-background-color/", lang: "en" },
  { path: "/fr/tutoriels/supprimer-arriere-plan-photo/", lang: "fr" },
  { path: "/fr/tutoriels/creer-png-transparent/", lang: "fr" },
  { path: "/fr/tutoriels/changer-couleur-fond-photo/", lang: "fr" },
];

async function hreflangs(page: Page): Promise<Record<string, string>> {
  return page.$$eval('link[rel="alternate"][hreflang]', (links) =>
    Object.fromEntries(links.map((l) => [l.getAttribute("hreflang")!, new URL(l.getAttribute("href")!).pathname])),
  );
}

for (const { path, lang } of PAGES) {
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
    expect(blocks.some((b) => b.includes('"FAQPage"'))).toBe(true);

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

test("fichiers racine : robots.txt (robots IA autorisés), sitemap.xml (10 URL), llms.txt", async ({ request }) => {
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
  for (const path of ["/remove-bg-alternative/", "/fr/tutoriels/creer-png-transparent/", "/fr/"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
});

test("accueil /fr/ : l'application démarre en français et le sélecteur mène à /", async ({ page }) => {
  await page.goto("/fr/");
  await expect(page.getByRole("button", { name: "Choisir une image" })).toBeVisible();
  await page.getByLabel("Langue").selectOption("en");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Choose an image" })).toBeVisible();
});
