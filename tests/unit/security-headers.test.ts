import { describe, expect, it } from "vitest";
// @ts-expect-error — module JS (.mjs) partagé avec vite.config.ts et scripts/postbuild.mjs.
import { cloudflareHeadersFile, contentSecurityPolicy, originOf, securityHeaders } from "../../security-headers.mjs";

describe("security-headers", () => {
  it("isolation cross-origin (WASM multithread)", () => {
    const h = securityHeaders();
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });

  it("CSP : le stockage des modèles n'est autorisé qu'en connect-src (jamais en script-src)", () => {
    const csp = contentSecurityPolicy("https://models.cutova.app");
    expect(csp).toContain("connect-src 'self' https://models.cutova.app");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(csp).not.toMatch(/script-src[^;]*models\.cutova\.app/);
    expect(contentSecurityPolicy()).toContain("connect-src 'self';");
  });

  it("origine d'une URL de base", () => {
    expect(originOf("https://models.cutova.app/some/path/")).toBe("https://models.cutova.app");
    expect(originOf(undefined)).toBeNull();
  });

  it("_headers Cloudflare : en-têtes sur /*, cache long des assets, pas de cache HTTP des modèles", () => {
    const file = cloudflareHeadersFile("https://models.cutova.app");
    expect(file).toMatch(/^\/\*\n  Cross-Origin-Opener-Policy: same-origin$/m);
    expect(file).toContain("/assets/*\n  Cache-Control: public, max-age=31536000, immutable");
    expect(file).toContain("/models/*\n  Cache-Control: no-store, no-transform");
  });
});
