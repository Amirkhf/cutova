/**
 * Gabarit unique des pages statiques SEO (fonctions pures, testées : tests/unit/seo-render.test.ts).
 * Aucune dépendance : chaînes HTML échappées à la main. Utilisé par seo/build.mjs.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Échappe du texte pour un contenu HTML ou une valeur d'attribut. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** JSON-LD sûr dans un <script> : `<` échappé pour empêcher toute fermeture prématurée. */
export function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export function absoluteUrl(siteUrl, path) {
  return new URL(path, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).href;
}

// --- Données structurées (schema.org) -------------------------------------------------------

export function faqPageLd(faq) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

export function howToLd({ name, description, totalTime, steps, url, inLanguage }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    inLanguage,
    totalTime,
    tool: [{ "@type": "HowToTool", name: "Cutova" }],
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text, url: `${url}#step-${i + 1}` })),
  };
}

export function webApplicationLd({ name, url, description, inLanguage }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    url,
    description,
    inLanguage,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires a modern browser with WebAssembly (WebGPU used when available).",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

export function webSiteLd({ name, url, inLanguage }) {
  return { "@context": "https://schema.org", "@type": "WebSite", name, url, inLanguage };
}

// --- <head> ----------------------------------------------------------------------------------

/**
 * Balises SEO du <head> : title, description, canonical, hreflang (+ x-default), Open Graph,
 * Twitter, JSON-LD. `alternates` = [{ hreflang, href }] incluant la page elle-même.
 */
export function headTags({ title, description, canonical, alternates, xDefault, ogLocale, ogType = "website", siteName, jsonLd = [] }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    ...alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${esc(xDefault)}" />`,
    `<meta property="og:type" content="${esc(ogType)}" />`,
    `<meta property="og:site_name" content="${esc(siteName)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:locale" content="${esc(ogLocale)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    ...jsonLd.map(jsonLdScript),
  ].join("\n    ");
}

// --- Corps ---------------------------------------------------------------------------------

export function faqHtml(title, faq) {
  const items = faq.map(({ q, a }) => `<details class="seo-faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n");
  return `<section class="seo-section seo-faq" aria-labelledby="faq-title"><h2 id="faq-title">${esc(title)}</h2>\n${items}\n</section>`;
}

function sectionHtml({ h2, paragraphs = [], list = [], source = null }) {
  const ps = paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n");
  const ul = list.length ? `<ul>${list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : "";
  // Source citée (lien sortant, sans transmettre de référent ni d'accès à notre page).
  const src = source
    ? `<p class="seo-source">${esc(source.prefix)} <a href="${esc(source.url)}" rel="noopener noreferrer external">${esc(source.label)}</a></p>`
    : "";
  return `<section class="seo-section"><h2>${esc(h2)}</h2>\n${ps}${ul}${src}</section>`;
}

function tableHtml({ caption, head, rows }) {
  const th = head.map((h, i) => (i === 0 ? `<td></td>` : `<th scope="col">${esc(h)}</th>`)).join("");
  const body = rows.map(([label, ...cells]) => `<tr><th scope="row">${esc(label)}</th>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("\n");
  return `<div class="seo-table-wrap"><table class="seo-table"><caption>${esc(caption)}</caption><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

function stepsHtml(title, steps) {
  const items = steps.map((s, i) => `<li id="step-${i + 1}"><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></li>`).join("\n");
  return `<section class="seo-section" aria-labelledby="steps-title"><h2 id="steps-title">${esc(title)}</h2><ol class="seo-steps">\n${items}\n</ol></section>`;
}

function ctaHtml(chrome, homePath) {
  return `<p class="seo-cta"><a class="btn btn-primary" href="${esc(homePath)}">${esc(chrome.cta)}</a><span>${esc(chrome.ctaNote)}</span></p>`;
}

/** Icône de la marque (ciseaux), identique à l'en-tête de l'application. */
const BRAND_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></svg>`;

export function headerHtml({ brand, chrome, homePath, otherLanguage }) {
  return `<header class="seo-header">
  <a class="seo-brand" href="${esc(homePath)}">${BRAND_ICON}<span>${esc(brand)}</span></a>
  <nav aria-label="${esc(chrome.nav)}" class="seo-nav">
    ${otherLanguage ? `<a href="${esc(otherLanguage.href)}" hreflang="${esc(otherLanguage.hreflang)}" lang="${esc(otherLanguage.hreflang)}">${esc(otherLanguage.label)}</a>` : ""}
    <a class="btn btn-primary seo-nav-cta" href="${esc(homePath)}">${esc(chrome.cta)}</a>
  </nav>
</header>`;
}

export function footerHtml({ chrome, guides, otherLanguage }) {
  const links = guides.map((g) => `<li><a href="${esc(g.path)}">${esc(g.label)}</a></li>`).join("");
  return `<footer class="seo-footer">
  <p>${esc(chrome.footerPrivacy)}</p>
  <nav aria-label="${esc(chrome.footerGuides)}"><h2 class="seo-footer-title">${esc(chrome.footerGuides)}</h2><ul class="seo-footer-links">${links}</ul></nav>
  ${otherLanguage ? `<p><a href="${esc(otherLanguage.href)}" hreflang="${esc(otherLanguage.hreflang)}" lang="${esc(otherLanguage.hreflang)}">${esc(chrome.footerLanguage)}</a></p>` : ""}
</footer>`;
}

/**
 * Page statique complète (article / tutoriel). `assets` = { css: [href], js: [href] } venant du
 * manifeste Vite (même CSS que l'application : jetons, polices, boutons).
 */
export function renderArticlePage({ lang, head, brand, chrome, homePath, page, breadcrumb, guides, otherLanguage, assets }) {
  const crumbs = breadcrumb
    .map((c, i) => (i < breadcrumb.length - 1 ? `<li><a href="${esc(c.path)}">${esc(c.name)}</a></li>` : `<li aria-current="page">${esc(c.name)}</li>`))
    .join("");
  const parts = [
    `<nav class="seo-breadcrumb" aria-label="${esc(chrome.breadcrumbLabel)}"><ol>${crumbs}</ol></nav>`,
    `<h1>${esc(page.h1)}</h1>`,
    ...page.intro.map((p) => `<p class="seo-lead">${esc(p)}</p>`),
    ctaHtml(chrome, homePath),
    page.table ? tableHtml(page.table) : "",
    page.steps ? stepsHtml(chrome.stepsTitle, page.steps) : "",
    ...(page.sections ?? []).map(sectionHtml),
    page.faq?.length ? faqHtml(chrome.faqTitle, page.faq) : "",
    ctaHtml(chrome, homePath),
    page.trademark ? `<p class="seo-note">${esc(chrome.trademarkNote)}</p>` : "",
  ].filter(Boolean);
  return `<!doctype html>
<html lang="${esc(lang)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    ${assets.css.map((href) => `<link rel="stylesheet" href="${esc(href)}" />`).join("\n    ")}
    ${head}
  </head>
  <body class="seo-page">
    <a class="skip-link" href="#main">${esc(chrome.skipToContent)}</a>
    ${headerHtml({ brand, chrome, homePath, otherLanguage })}
    <main id="main" class="seo-main">
${parts.join("\n")}
    </main>
    ${footerHtml({ chrome, guides, otherLanguage })}
  </body>
</html>
`;
}

/** Sections statiques de l'accueil, sous l'application (lisibles sans JavaScript). */
export function homeSectionsHtml({ chrome, home, guides }) {
  const cards = (title, items) =>
    `<section class="seo-section"><h2>${esc(title)}</h2><div class="seo-cards">${items
      .map((it) => `<div class="seo-card"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>`)
      .join("")}</div></section>`;
  const links = guides.map((g) => `<li><a href="${esc(g.path)}">${esc(g.label)}</a></li>`).join("");
  return `<section class="seo-home" aria-label="${esc(home.howTitle)}">
${cards(home.howTitle, home.how)}
${cards(home.whyTitle, home.why)}
${faqHtml(chrome.faqTitle, home.faq)}
<nav class="seo-section" aria-label="${esc(chrome.footerGuides)}"><h2>${esc(chrome.footerGuides)}</h2><ul class="seo-footer-links">${links}</ul></nav>
<p class="seo-note">${esc(chrome.footerPrivacy)}</p>
</section>`;
}

// --- Fichiers racine -------------------------------------------------------------------------

/** sitemap.xml avec alternances hreflang (une entrée <url> par page et par langue). */
export function sitemapXml(entries) {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${esc(e.loc)}</loc>
${e.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(e.xDefault)}" />
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/** Robots d'IA explicitement autorisés (décision : visibilité dans les réponses des assistants). */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Meta-ExternalAgent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
];

export function robotsTxt(siteUrl) {
  const ai = AI_CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /\n`).join("\n");
  return `# Cutova — tout est public. Les poids des modèles (/models/) ne sont pas des pages.
User-agent: *
Allow: /
Disallow: /models/

${ai}
Sitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}
`;
}

/** llms.txt (https://llmstxt.org) : résumé du site + liens vers les pages utiles. */
export function llmsTxt({ siteUrl, summary, details, sections }) {
  const body = sections
    .map((s) => `## ${s.title}\n\n${s.links.map((l) => `- [${l.label}](${absoluteUrl(siteUrl, l.path)}): ${l.description}`).join("\n")}`)
    .join("\n\n");
  return `# Cutova\n\n> ${summary}\n\n${details.join("\n\n")}\n\n${body}\n`;
}
