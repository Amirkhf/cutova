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

function securityHeadersMiddleware(): Connect.NextHandleFunction {
  return (_req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
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
  worker: {
    format: "es",
  },
});
