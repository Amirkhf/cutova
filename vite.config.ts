import { defineConfig, type Connect, type Plugin } from "vite";

/**
 * Isolation COOP/COEP + CSP stricte, nécessaires pour `crossOriginIsolated === true`
 * (WASM multithread) et pour garantir qu'aucun script tiers ne peut être chargé.
 * Voir context.md > Sécurité.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "img-src 'self' blob: data:",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

/**
 * Poids des modèles (`/models/`) : déjà mis en cache de façon persistante dans OPFS par le worker
 * (src/core/model/opfs-cache.ts). `no-store` évite une 2e copie de ~170 Mo dans le cache HTTP du
 * navigateur (et l'erreur Chromium `ERR_CACHE_WRITE_FAILURE` observée quand transformers.js lit le
 * même fichier deux fois en parallèle) ; `no-transform` empêche la compression gzip à la volée,
 * qui supprime le `Content-Length` (plus de barre de progression) et coûte du CPU pour un binaire
 * quasi incompressible. Mêmes règles en production : voir public/_headers.
 */
export const MODEL_CACHE_CONTROL = "no-store, no-transform";

function securityHeadersMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    if (req.url?.startsWith("/models/")) {
      res.setHeader("Cache-Control", MODEL_CACHE_CONTROL);
    }
    next();
  };
}

/**
 * Les binaires onnxruntime-web (`?url` imports dans src/core/inference/worker.ts) sont
 * gérés par le pipeline d'assets natif de Vite : zéro middleware custom nécessaire,
 * zéro requête externe (même-origine en dev comme en prod). Ce plugin n'ajoute que les
 * en-têtes de sécurité, absents par défaut du serveur dev/preview de Vite.
 */
function securityHeadersPlugin(): Plugin {
  return {
    name: "cutova-security-headers",
    configureServer(server) {
      server.middlewares.use(securityHeadersMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(securityHeadersMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [securityHeadersPlugin()],
  build: {
    // Manifeste lu par seo/build.mjs pour retrouver le CSS haché des pages statiques.
    manifest: true,
    rollupOptions: {
      input: {
        main: "index.html",
        seo: "src/seo/seo-page.ts",
      },
    },
  },
  worker: {
    format: "es",
  },
});
