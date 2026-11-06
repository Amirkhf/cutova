import { describe, expect, it } from "vitest";
// @ts-expect-error — module JS (.mjs) sans déclarations de types, utilisé tel quel par Node.
import { AI_CRAWLERS, absoluteUrl, esc, faqPageLd, headTags, jsonLdScript, robotsTxt, sitemapXml } from "../../seo/render.mjs";

describe("seo/render", () => {
  it("échappe le HTML et les guillemets", () => {
    expect(esc(`<a href="x">l'été & co</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;l&#39;été &amp; co&lt;/a&gt;");
  });

  it("JSON-LD : impossible de fermer le <script> depuis le contenu", () => {
    const out = jsonLdScript({ text: "</script><script>alert(1)</script>" });
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(out).toContain("\\u003c/script>");
  });

  it("URL absolue depuis la racine du site", () => {
    expect(absoluteUrl("https://cutova.app", "/fr/")).toBe("https://cutova.app/fr/");
    expect(absoluteUrl("https://cutova.app/", "/sitemap.xml")).toBe("https://cutova.app/sitemap.xml");
  });

  it("FAQPage conforme à schema.org", () => {
    const ld = faqPageLd([{ q: "Q ?", a: "R." }]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Q ?", acceptedAnswer: { "@type": "Answer", text: "R." } });
  });

  it("<head> : canonical, hreflang de chaque langue + x-default", () => {
    const head = headTags({
      title: "T",
      description: "D",
      canonical: "https://c.app/fr/",
      alternates: [
        { hreflang: "en", href: "https://c.app/" },
        { hreflang: "fr", href: "https://c.app/fr/" },
      ],
      xDefault: "https://c.app/",
      ogLocale: "fr_FR",
      siteName: "Cutova",
    });
    expect(head).toContain('<link rel="canonical" href="https://c.app/fr/" />');
    expect(head).toContain('hreflang="en" href="https://c.app/"');
    expect(head).toContain('hreflang="x-default" href="https://c.app/"');
  });

  it("robots.txt : tout autorisé, robots d'IA explicitement autorisés, sitemap absolu", () => {
    const txt = robotsTxt("https://cutova.app");
    for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(AI_CRAWLERS).toContain(bot);
      expect(txt).toContain(`User-agent: ${bot}\nAllow: /`);
    }
    expect(txt).not.toMatch(/Disallow: \/\n/);
    expect(txt).toContain("Sitemap: https://cutova.app/sitemap.xml");
  });

  it("sitemap.xml avec alternances", () => {
    const xml = sitemapXml([{ loc: "https://c.app/", alternates: [{ hreflang: "fr", href: "https://c.app/fr/" }], xDefault: "https://c.app/" }]);
    expect(xml).toContain("<loc>https://c.app/</loc>");
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="fr" href="https://c.app/fr/"');
  });
});
