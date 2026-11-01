import { defineConfig, type Connect, type Plugin } from "vite";

import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, PERIODS, type Period } from "./edge/stats.ts";
import { generateDemoRows } from "./edge/demo.ts";
import { DEV_STYLE_NONCE, MODEL_CACHE_CONTROL, originOf, securityHeaders } from "./security-headers.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Isolation COOP/COEP + CSP stricte (source unique : security-headers.mjs, aussi utilisée pour le
 * `_headers` de Cloudflare Pages). `VITE_MODEL_BASE_URL` (optionnel) = stockage externe des modèles
 * et des binaires onnxruntime-web (R2 en production) : son origine est ajoutée à la CSP.
 */
const MODEL_ORIGIN = originOf(process.env.VITE_MODEL_BASE_URL);
const SECURITY_HEADERS = securityHeaders(MODEL_ORIGIN);
// Serveur de dev : Vite injecte le CSS dans des <style> portant le nonce `html.cspNonce` ci-dessous ;
// la CSP de dev autorise ce nonce, et lui seul (pas de 'unsafe-inline').
const DEV_SECURITY_HEADERS = securityHeaders(MODEL_ORIGIN, { devServer: true });
const ORT_VERSION = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> }).dependencies["onnxruntime-web"];

function securityHeadersMiddleware(headers: Record<string, string>): Connect.NextHandleFunction {
  return (_req, res, next) => {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    next();
  };
}

/**
 * `/models/` servi par nous (dev : public/models, preview : dist/models) plutôt que par le serveur
 * statique de Vite, qui compresse à la volée en gzip et supprime alors le `Content-Length` (plus de
 * pourcentage de progression, "Unable to determine content-length"). Ici : `Content-Length` exact,
 * `Content-Encoding: identity` (aucune compression), et `Cache-Control` de security-headers.mjs
 * (déjà en OPFS ; évite aussi `ERR_CACHE_WRITE_FAILURE` quand transformers.js lit le même fichier
 * deux fois en parallèle).
 */
function modelFilesMiddleware(modelsDir: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (!url.startsWith("/models/") || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const file = path.resolve(modelsDir, decodeURIComponent(url.slice("/models/".length)));
    if (!file.startsWith(modelsDir + path.sep)) return next();
    stat(file).then(
      (info) => {
        if (!info.isFile()) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "application/octet-stream");
        res.setHeader("Content-Length", String(info.size));
        res.setHeader("Content-Encoding", "identity");
        res.setHeader("Cache-Control", MODEL_CACHE_CONTROL);
        if (req.method === "HEAD") return res.end();
        createReadStream(file).pipe(res);
      },
      () => next(),
    );
  };
}

/**
 * Serveur de DÉVELOPPEMENT uniquement (jamais preview ni build) : `/api/stats` répond avec des données
 * de démonstration générées, `/api/event` accepte et ignore les événements. En production, ce sont
 * les Pages Functions (functions/api/*) qui répondent.
 */
/** Preview local : les événements anonymes sont acceptés puis ignorés (pas de D1 ici, jamais de démo). */
function previewEventMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/event" || req.method !== "POST") return next();
    res.statusCode = 204;
    res.end();
  };
}

function devApiMiddleware(): Connect.NextHandleFunction {
  const rows = generateDemoRows();
  return (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/event" && req.method === "POST") {
      res.statusCode = 204;
      return res.end();
    }
    if (url.pathname !== "/api/stats") return next();
    const period = url.searchParams.get("period") ?? "7";
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!(period in PERIODS)) {
      res.statusCode = 400;
      return res.end('{"error":"period"}');
    }
    res.setHeader("X-Cutova-Demo", "1");
    res.end(JSON.stringify({ ...aggregate(rows, period as Period, Date.now()), demo: true }));
  };
}

/**
 * En-têtes de sécurité (absents par défaut du serveur dev/preview de Vite) + service des modèles.
 * Les binaires onnxruntime-web (`?url` dans src/core/inference/worker.ts) passent par le pipeline
 * d'assets natif de Vite : même-origine, zéro requête externe.
 */
function securityHeadersPlugin(): Plugin {
  return {
    name: "cutova-security-headers",
    configureServer(server) {
      server.middlewares.use(securityHeadersMiddleware(DEV_SECURITY_HEADERS));
      server.middlewares.use(modelFilesMiddleware(path.join(ROOT, "public/models")));
      server.middlewares.use(devApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(securityHeadersMiddleware(SECURITY_HEADERS));
      server.middlewares.use(modelFilesMiddleware(path.join(ROOT, "dist/models")));
      server.middlewares.use(previewEventMiddleware());
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [securityHeadersPlugin()],
  // Dev uniquement : nonce posé par Vite sur les <style>/<script> qu'il injecte (jamais au build).
  html: command === "serve" ? { cspNonce: DEV_STYLE_NONCE } : undefined,
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
        stats: "stats/index.html",
      },
    },
  },
  worker: {
    format: "es",
  },
}));
