/**
 * SOURCE UNIQUE des en-têtes de sécurité : utilisée par vite.config.ts (dev/preview) et par
 * scripts/postbuild.mjs (fichier `_headers` de Cloudflare Pages). Voir context.md > Sécurité.
 *
 * `modelOrigin` : origine du stockage des modèles et des binaires onnxruntime-web en production
 * (ex. https://models.cutova.app, bucket R2). Ajoutée UNIQUEMENT à `connect-src` : poids et `.wasm`
 * y sont téléchargés (fetch), jamais exécutés comme scripts (les `.mjs` restent sur le site).
 * `null` = tout est servi par le site lui-même.
 */

/**
 * Nonce du serveur de DÉVELOPPEMENT uniquement (vite.config.ts > `html.cspNonce`). Vite injecte le
 * CSS dans des balises `<style>` portant ce nonce (rechargement à chaud) ; la CSP de dev autorise ce
 * nonce et rien d'autre. Valeur fixe : acceptable car jamais servie en preview ni en production, où
 * le CSS est en fichiers (`style-src 'self'`).
 */
export const DEV_STYLE_NONCE = "cutova-dev-only";

/** `devServer` : CSP du serveur de dev Vite (styles injectés autorisés par nonce). */
export function contentSecurityPolicy(modelOrigin = null, { devServer = false } = {}) {
  const extra = modelOrigin ? ` ${modelOrigin}` : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    `connect-src 'self'${extra}`,
    "img-src 'self' blob: data:",
    devServer ? `style-src 'self' 'nonce-${DEV_STYLE_NONCE}'` : "style-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** En-têtes appliqués à toutes les réponses du site. */
export function securityHeaders(modelOrigin = null, options = {}) {
  return {
    // Isolation cross-origin : nécessaire à `crossOriginIsolated` (WASM multithread).
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Content-Security-Policy": contentSecurityPolicy(modelOrigin, options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
}

/**
 * Poids des modèles : déjà persistés dans OPFS par le worker → pas de 2e copie dans le cache HTTP du
 * navigateur (`no-store`), pas de compression à la volée (`no-transform`, garde le Content-Length).
 * Le CDN peut, lui, garder le fichier (en-tête `CDN-Cache-Control`, compris par Cloudflare).
 */
export const MODEL_CACHE_CONTROL = "no-store, no-transform";
export const MODEL_CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Origine (schéma + hôte + port) d'une URL de base, ou `null`. */
export function originOf(baseUrl) {
  return baseUrl ? new URL(baseUrl).origin : null;
}

/** Contenu du fichier `_headers` de Cloudflare Pages. */
export function cloudflareHeadersFile(modelOrigin = null) {
  const lines = (headers) => Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join("\n");
  return `# Généré par scripts/postbuild.mjs depuis security-headers.mjs — ne pas modifier à la main.
/*
${lines(securityHeaders(modelOrigin))}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/models/*
  Cache-Control: ${MODEL_CACHE_CONTROL}

/api/*
  Cache-Control: no-store
  X-Robots-Tag: noindex

/stats/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
`;
}
