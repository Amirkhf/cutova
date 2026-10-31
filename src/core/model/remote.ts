/**
 * Stockage des modèles : local (`/models/`, servi par le site) ou externe (bucket R2 en production,
 * `VITE_MODEL_BASE_URL` au build). Disposition du stockage externe = celle de Hugging Face, pour que
 * transformers.js la lise nativement et que `scripts/fetch-model.mjs` puisse s'en servir de miroir :
 *   <base>/<repoId>/resolve/<revision>/<fichier>
 *   <base>/onnxruntime-web/<version>/ort-wasm-simd-threaded[.asyncify].wasm   (les .mjs restent sur le site)
 * (Le binaire `.asyncify.wasm` fait 25,6 Mio : au-dessus de la limite de 25 Mio par fichier de
 * Cloudflare Pages, d'où son hébergement avec les modèles.)
 */
export const MODEL_BASE_URL: string | null = import.meta.env.VITE_MODEL_BASE_URL?.replace(/\/+$/, "") || null;

/** Dossier distant des binaires onnxruntime-web (version figée), ou `null` en mode local. */
export function remoteOrtDir(base: string | null = MODEL_BASE_URL, version: string = __ORT_VERSION__): string | null {
  return base ? `${base}/onnxruntime-web/${version}/` : null;
}

/** Modèle de chemin transformers.js (`env.remotePathTemplate`) pour la disposition ci-dessus. */
export const REMOTE_PATH_TEMPLATE = "{model}/resolve/{revision}/";
