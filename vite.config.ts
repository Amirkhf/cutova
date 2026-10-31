import { defineConfig, type Connect, type Plugin } from "vite";

import { readFileSync } from "node:fs";
import { MODEL_CACHE_CONTROL, originOf, securityHeaders } from "./security-headers.mjs";

/**
 * Isolation COOP/COEP + CSP stricte (source unique : security-headers.mjs, aussi utilisée pour le
 * `_headers` de Cloudflare Pages). `VITE_MODEL_BASE_URL` (optionnel) = stockage externe des modèles
 * et des binaires onnxruntime-web (R2 en production) : son origine est ajoutée à la CSP.
 */
const MODEL_ORIGIN = originOf(process.env.VITE_MODEL_BASE_URL);
const SECURITY_HEADERS = securityHeaders(MODEL_ORIGIN);
// Serveur de dev : CSS injecté en <style> par Vite → `style-src 'unsafe-inline'` (dev seulement).
const DEV_SECURITY_HEADERS = securityHeaders(MODEL_ORIGIN, { devServer: true });
const ORT_VERSION = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> }).dependencies["onnxruntime-web"];

/**
 * Poids des modèles (`/models/`) : voir security-headers.mjs > MODEL_CACHE_CONTROL (déjà en OPFS ;
 * évite aussi `ERR_CACHE_WRITE_FAILURE` quand transformers.js lit le même fichier deux fois en
 * parallèle).
 */
function securityHeadersMiddleware(headers: Record<string, string>): Connect.NextHandleFunction {
  return (req, res, next) => {
    for (const [name, value] of Object.entries(headers)) {
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
      server.middlewares.use(securityHeadersMiddleware(DEV_SECURITY_HEADERS));
    },
    configurePreviewServer(server) {
      server.middlewares.use(securityHeadersMiddleware(SECURITY_HEADERS));
    },
  };
}

export default defineConfig({
  plugins: [securityHeadersPlugin()],
  define: {
    __ORT_VERSION__: JSON.stringify(ORT_VERSION),
  },
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
