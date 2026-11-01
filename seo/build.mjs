#!/usr/bin/env node
/**
 * Générateur statique SEO — tourne APRÈS `vite build` (voir package.json > build).
 *
 * - Pages article/tutoriel : content/<id>.json × locales → dist/<chemin>/index.html (gabarit unique
 *   seo/render.mjs, CSS = entrée Vite `src/seo/seo-page.ts`, lue dans dist/.vite/manifest.json).
 * - Accueil : dist/index.html (application) enrichi pour chaque locale (title, description, canonical,
 *   hreflang, Open Graph, JSON-LD, titre de repli dans #app, sections statiques sous l'application) →
 *   dist/index.html (en) et dist/fr/index.html (fr).
 * - dist/sitemap.xml (avec hreflang), dist/robots.txt (robots d'IA autorisés), dist/llms.txt.
 *
 * URL absolue du site : variable d'environnement SITE_URL (ex. https://cutova.app). Sans elle, on
 * utilise http://localhost:4173 (preview local) et on l'annonce clairement : à définir au déploiement.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "../src/i18n/locales/en.ts";
import { fr } from "../src/i18n/locales/fr.ts";
import { es } from "../src/i18n/locales/es.ts";
import { ptBr } from "../src/i18n/locales/pt-br.ts";
import { id } from "../src/i18n/locales/id.ts";
import {
  absoluteUrl,
  breadcrumbLd,
  esc,
  faqPageLd,
  headTags,
  footerHtml,
  homeSectionsHtml,
  howToLd,
  llmsTxt,
  renderArticlePage,
  robotsTxt,
  sitemapIndexXml,
  sitemapXml,
  webApplicationLd,
  webSiteLd,
} from "./render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const CONTENT = path.join(ROOT, "content");
const DICTS = { en, fr, "pt-br": ptBr, es, id };
const DEFAULT_LOCALE = "en";

const SITE_URL = process.env.SITE_URL || "http://localhost:4173";
if (!process.env.SITE_URL) {
  console.warn(`[seo] SITE_URL non défini : URLs absolues générées pour ${SITE_URL} (définir SITE_URL au déploiement).`);
}

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

async function writePage(urlPath, html) {
  const file = path.join(DIST, urlPath, "index.html");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

function seoAssets(manifest) {
  const entry = manifest["src/seo/seo-page.ts"];
  if (!entry) throw new Error("[seo] entrée src/seo/seo-page.ts absente du manifeste Vite (vite.config.ts > build.rollupOptions.input).");
  return { css: (entry.css ?? []).map((f) => `/${f}`), js: entry.file?.endsWith(".js") ? [`/${entry.file}`] : [] };
}

async function main() {
  const site = await readJson(path.join(CONTENT, "site.json"));
  const home = await readJson(path.join(CONTENT, "home.json"));
  const pages = [];
  for (const file of (await readdir(CONTENT)).filter((f) => f.endsWith(".json") && f !== "site.json" && f !== "home.json").sort()) {
    pages.push(await readJson(path.join(CONTENT, file)));
  }
  const manifest = await readJson(path.join(DIST, ".vite/manifest.json"));
  const assets = seoAssets(manifest);
  const locales = Object.keys(site.locales);
  const url = (p) => absoluteUrl(SITE_URL, p);
  const alternatesOf = (doc) => locales.filter((l) => doc.locales[l]).map((l) => ({ hreflang: site.locales[l].hreflang, href: url(doc.locales[l].path) }));
  /** Toutes les versions linguistiques publiées d'une page (sélecteur de langue). */
  const languagesOf = (doc, locale) =>
    locales
      .filter((l) => doc.locales[l])
      .map((l) => ({ href: doc.locales[l].path, hreflang: site.locales[l].hreflang, label: site.locales[l].languageName, code: l === "pt-br" ? "PT" : l.toUpperCase(), current: l === locale }));
  const linksOf = (locale, types, tool = false) =>
    pages
      .filter((p) => types.includes(p.type ?? "article") && Boolean(p.tool) === tool && p.locales[locale])
      .map((p) => ({ path: p.locales[locale].path, label: p.locales[locale].h1 }));
  /** Colonnes du pied de page (mêmes sur toutes les pages d'une langue). */
  const columnsFor = (locale) => {
    const chrome = site.locales[locale];
    return [
      { title: chrome.footerTools, links: [{ path: chrome.home, label: chrome.footerToolRemove }, ...linksOf(locale, ["howto"], true), ...linksOf(locale, ["article"])] },
      { title: chrome.footerGuides, links: linksOf(locale, ["howto"]) },
      { title: chrome.footerUses, links: pages.filter((p) => p.type === "segment" && p.locales[locale]).map((p) => ({ path: p.locales[locale].path, label: p.locales[locale].card.title })) },
      { title: chrome.footerHelp, links: [{ path: `${chrome.home}#how`, label: chrome.footerHow }, { path: `${chrome.home}#faq-title`, label: chrome.footerFaq }] },
      { title: chrome.footerLegal, links: linksOf(locale, ["legal"]) },
    ];
  };
  // Galerie : dimensions réelles des images (attributs width/height → pas de décalage de mise en page).
  const GALLERY_IDS = ["people", "products", "animals", "cars", "graphics"];
  const galleryItems = [];
  for (const id of GALLERY_IDS) {
    const sizes = {};
    try {
      for (const stage of ["original", "cutout", "background", "variant"]) {
        const meta = await sharp(path.join(ROOT, "public/showcase", `${id}-${stage}.webp`)).metadata();
        sizes[stage] = { width: meta.width, height: meta.height };
      }
      galleryItems.push({ id, sizes });
    } catch {
      console.warn(`[seo] images de galerie manquantes pour ${id} (node scripts/build-showcase.mjs)`);
    }
  }
  const sitemap = [];
  const homeEntries = [];

  // Pages article / tutoriel.
  for (const doc of pages) {
    for (const locale of locales) {
      const page = doc.locales[locale];
      if (!page) continue;
      const chrome = site.locales[locale];
      const canonical = url(page.path);
      const breadcrumb = [
        { name: chrome.breadcrumbHome, path: chrome.home },
        { name: page.h1, path: page.path },
      ];
      const jsonLd = [breadcrumbLd(breadcrumb.map((b) => ({ name: b.name, url: url(b.path) })))];
      if (doc.type === "howto" && page.steps) {
        jsonLd.push(howToLd({ name: page.h1, description: page.description, totalTime: page.totalTime, steps: page.steps, url: canonical, inLanguage: locale }));
      }
      if (page.faq?.length) jsonLd.push(faqPageLd(page.faq));
      const head = headTags({
        title: page.title,
        description: page.description,
        canonical,
        alternates: alternatesOf(doc),
        xDefault: url(doc.locales[DEFAULT_LOCALE]?.path ?? page.path),
        ogLocale: chrome.ogLocale,
        ogType: "article",
        siteName: site.brand,
        jsonLd,
      });
      const html = renderArticlePage({
        lang: locale,
        head,
        brand: site.brand,
        chrome,
        homePath: chrome.home,
        page: { ...page, trademark: doc.id === "remove-bg-alternative", noCta: doc.type === "legal" },
        breadcrumb,
        columns: columnsFor(locale),
        languages: languagesOf(doc, locale),
        assets,
      });
      await writePage(page.path, html);
      sitemap.push({ locale, loc: canonical, alternates: alternatesOf(doc), xDefault: url(doc.locales[DEFAULT_LOCALE].path) });
    }
  }

  // Accueil : l'application construite par Vite, enrichie par locale.
  const appHtml = await readFile(path.join(DIST, "index.html"), "utf8");
  for (const locale of locales) {
    const content = home.locales[locale];
    const chrome = site.locales[locale];
    const dict = DICTS[locale];
    const canonical = url(content.path);
    const head = headTags({
      title: content.title,
      description: content.description,
      canonical,
      alternates: alternatesOf(home),
      xDefault: url(home.locales[DEFAULT_LOCALE].path),
      ogLocale: chrome.ogLocale,
      siteName: site.brand,
      jsonLd: [
        webSiteLd({ name: site.brand, url: canonical, inLanguage: locale }),
        webApplicationLd({ name: site.brand, url: canonical, description: content.description, inLanguage: locale }),
        faqPageLd(content.faq),
      ],
    });
    // Titre de repli dans #app (remplacé par l'application au démarrage) : le titre principal reste
    // lisible pour les robots qui n'exécutent pas JavaScript.
    const fallback = `<div class="app-fallback"><h1>${esc(dict.hero.title)}</h1><p>${esc(dict.hero.subtitle)}</p><p>${esc(dict.hero.reassurance)}</p></div>`;
    let html = appHtml
      .replace(/<html lang="[^"]*">/, `<html lang="${esc(locale)}" data-locale="${esc(locale)}">`)
      .replace(/<title>[^<]*<\/title>/, head)
      .replace(
        '<div id="app"></div>',
        `<div id="app">${fallback}</div>\n    ${homeSectionsHtml({
          chrome,
          home: content,
          uses: pages.filter((p) => p.type === "segment" && p.locales[locale]).map((p) => ({ path: p.locales[locale].path, ...p.locales[locale].card })),
          galleryItems,
        })}\n    ${footerHtml({ chrome, brand: site.brand, columns: columnsFor(locale), languages: languagesOf(home, locale) })}`,
      );
    if (!html.includes('data-locale=') || !html.includes('rel="canonical"') || !html.includes("seo-home")) {
      throw new Error("[seo] dist/index.html n'a pas la structure attendue (html lang / title / #app).");
    }
    await writePage(content.path, html);
    homeEntries.push({ locale, loc: canonical, alternates: alternatesOf(home), xDefault: url(home.locales[DEFAULT_LOCALE].path) });
  }

  sitemap.unshift(...homeEntries);
  // Un sitemap par langue (avec alternances hreflang) + index `sitemap.xml` (cité par robots.txt).
  for (const locale of locales) {
    await writeFile(path.join(DIST, `sitemap-${locale}.xml`), sitemapXml(sitemap.filter((e) => e.locale === locale)));
  }
  await writeFile(path.join(DIST, "sitemap.xml"), sitemapIndexXml(locales.map((l) => url(`/sitemap-${l}.xml`))));
  await writeFile(path.join(DIST, "robots.txt"), robotsTxt(SITE_URL));
  await writeFile(
    path.join(DIST, "llms.txt"),
    llmsTxt({
      siteUrl: SITE_URL,
      summary: "Cutova is a free web app that removes the background from images directly in the browser. Images are never uploaded: an open-source AI model runs on the user's device (WebGPU when available, otherwise WebAssembly).",
      details: [
        "Key facts: free, no account, full-resolution download (up to about 50 megapixels on desktop), input PNG/JPEG/WebP/AVIF/GIF up to 50 MB, output transparent PNG, WebP or JPG, transparent/white/custom color background.",
        "Models: BiRefNet_lite (MIT) on WebGPU, ormbg (Apache-2.0) on CPU/WebAssembly. Available in English, French, Brazilian Portuguese, Spanish and Indonesian.",
      ],
      sections: [
        {
          title: "Pages",
          links: locales.map((l) => ({ label: `Cutova (${site.locales[l].languageName})`, path: home.locales[l].path, description: home.locales[l].description })),
        },
        ...locales.flatMap((locale) =>
          [
            [["article", "howto"], "Guides"],
            [["segment"], "Use cases"],
            [["legal"], "Legal"],
          ].map(([types, title]) => ({
            title: `${title} (${site.locales[locale].languageName})`,
            links: pages
              .filter((p) => types.includes(p.type ?? "article") && p.locales[locale])
              .map((p) => ({ label: p.locales[locale].h1, path: p.locales[locale].path, description: p.locales[locale].description })),
          })),
        ),
      ],
    }),
  );
  console.log(`[seo] ${sitemap.length} pages, sitemap.xml, robots.txt, llms.txt écrits dans dist/ (SITE_URL=${SITE_URL}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
