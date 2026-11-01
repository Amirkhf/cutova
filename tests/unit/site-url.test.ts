import { describe, expect, it } from "vitest";
// @ts-expect-error module JavaScript sans types
import { resolveSiteUrl } from "../../seo/site-url.mjs";

describe("resolveSiteUrl", () => {
  it("hors production : localhost par défaut, avec avertissement", () => {
    expect(resolveSiteUrl({})).toMatchObject({ url: "http://localhost:4173" });
    expect(resolveSiteUrl({}).warning).toContain("SITE_URL");
    expect(resolveSiteUrl({ SITE_URL: "http://localhost:8788/" }).url).toBe("http://localhost:8788");
  });
  it("production (Cloudflare Pages ou CUTOVA_PRODUCTION) : SITE_URL obligatoire", () => {
    expect(() => resolveSiteUrl({ CF_PAGES: "1" })).toThrow(/obligatoire/);
    expect(() => resolveSiteUrl({ CUTOVA_PRODUCTION: "1", SITE_URL: " " })).toThrow(/obligatoire/);
  });
  it("production : refuse localhost, adresses locales, http, chemin, URL invalide", () => {
    for (const bad of ["https://localhost", "https://127.0.0.1", "https://cutova.local", "https://[::1]", "https://0.0.0.0", "https://x.localhost"]) {
      expect(() => resolveSiteUrl({ CF_PAGES: "1", SITE_URL: bad }), bad).toThrow(/locale/);
    }
    expect(() => resolveSiteUrl({ CF_PAGES: "1", SITE_URL: "http://cutova.app" })).toThrow(/https/);
    expect(() => resolveSiteUrl({ CF_PAGES: "1", SITE_URL: "https://cutova.app/fr/" })).toThrow(/chemin/);
    expect(() => resolveSiteUrl({ CF_PAGES: "1", SITE_URL: "cutova" })).toThrow(/invalide/);
  });
  it("production : accepte une origine https et la normalise", () => {
    expect(resolveSiteUrl({ CF_PAGES: "1", SITE_URL: "https://cutova.app/" })).toEqual({ url: "https://cutova.app", warning: null });
  });
});
