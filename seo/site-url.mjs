/**
 * URL absolue du site (canonical, hreflang, sitemaps, robots.txt, llms.txt).
 * Build de production (Cloudflare Pages `CF_PAGES=1`, ou `CUTOVA_PRODUCTION=1`) : SITE_URL est
 * OBLIGATOIRE, en https, sans localhost ni adresse locale — sinon le build échoue. Ailleurs (tests,
 * preview local) : http://localhost:4173 par défaut, annoncé clairement.
 */
export const LOCAL_SITE_URL = "http://localhost:4173";

const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$|\.(localhost|local|test|internal)$/i;

export function isProductionBuild(env) {
  return env.CF_PAGES === "1" || env.CUTOVA_PRODUCTION === "1";
}

/** Renvoie { url, warning } ou lève une erreur explicite (build de production mal configuré). */
export function resolveSiteUrl(env) {
  const raw = (env.SITE_URL ?? "").trim();
  if (!isProductionBuild(env)) {
    if (!raw) return { url: LOCAL_SITE_URL, warning: `SITE_URL non défini : URLs absolues générées pour ${LOCAL_SITE_URL} (définir SITE_URL au déploiement).` };
    return { url: raw.replace(/\/+$/, ""), warning: null };
  }
  if (!raw) throw new Error("SITE_URL est obligatoire pour un build de production (ex. SITE_URL=https://cutova.app). Voir DEPLOY.md.");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SITE_URL invalide : « ${raw} ».`);
  }
  if (parsed.protocol !== "https:") throw new Error(`SITE_URL doit être en https en production : « ${raw} ».`);
  if (LOCAL_HOST.test(parsed.hostname)) throw new Error(`SITE_URL ne peut pas être une adresse locale en production : « ${raw} ».`);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error(`SITE_URL doit être l'origine seule, sans chemin : « ${raw} ».`);
  return { url: parsed.origin, warning: null };
}
