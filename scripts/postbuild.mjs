#!/usr/bin/env node
/**
 * Dernière étape de `npm run build` (après vite build + seo/build.mjs) :
 * 1. écrit `dist/_headers` (Cloudflare Pages) depuis security-headers.mjs ;
 * 2. si `VITE_MODEL_BASE_URL` est défini (modèles sur R2), retire `dist/models/` (copie de
 *    public/models/, inutile et trop lourde pour Pages) ;
 * 3. vérifie qu'aucun fichier de dist/ ne dépasse la limite de Cloudflare Pages (25 Mio/fichier).
 *    Échec du build si c'est le cas sur Cloudflare (`CF_PAGES=1`) ou avec `STRICT_DEPLOY=1` ;
 *    simple avertissement en local (où les modèles restent servis par le site).
 */
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareHeadersFile, originOf } from "../security-headers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
export const CLOUDFLARE_PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const modelBase = process.env.VITE_MODEL_BASE_URL || null;

// IndexNow (Bing, Yandex…) : fichier-clé public à la racine, si une clé est fournie (voir DEPLOY.md).
const indexNowKey = process.env.INDEXNOW_KEY?.trim();
if (indexNowKey) {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(indexNowKey)) {
    console.error("[postbuild] INDEXNOW_KEY invalide (8 à 128 caractères : lettres, chiffres, tirets).");
    process.exit(1);
  }
  await writeFile(path.join(DIST, `${indexNowKey}.txt`), indexNowKey);
  console.log(`[postbuild] fichier-clé IndexNow écrit : /${indexNowKey}.txt`);
}
await writeFile(path.join(DIST, "_headers"), cloudflareHeadersFile(originOf(modelBase)));

if (modelBase) {
  await rm(path.join(DIST, "models"), { recursive: true, force: true });
  // Binaires `.wasm` d'onnxruntime-web émis par Vite (URL par défaut codée dans onnxruntime-web,
  // `new URL("ort-wasm-simd-threaded*.wasm", import.meta.url)`). En mode externe, le worker fixe
  // toujours `wasmPaths.wasm` vers le stockage externe avant toute session : ces copies ne sont
  // jamais chargées (et le `.asyncify.wasm`, 25,6 Mio, est refusé par Cloudflare Pages). Les `.mjs`
  // restent servis par le site (voir src/core/inference/worker.ts > wasmPaths).
  const assets = path.join(DIST, "assets");
  const unused = (await readdir(assets)).filter((f) => /^ort-wasm-simd-threaded.*\.wasm$/.test(f));
  await Promise.all(unused.map((f) => rm(path.join(assets, f))));
  console.log(`[postbuild] modèles et binaires ONNX Runtime servis depuis ${modelBase} : dist/models/ et ${unused.length} binaires .wasm bundlés retirés.`);
}

// Champs légaux à remplir par l'éditeur (pages /legal/, /privacy/, /terms/ et équivalents FR).
let toComplete = 0;
for await (const file of walk(DIST)) {
  if (file.endsWith(".html")) toComplete += ((await readFile(file, "utf8")).match(/\[À COMPLÉTER\]/g) ?? []).length;
}
if (toComplete) console.warn(`[postbuild] ${toComplete} champ(s) [À COMPLÉTER] dans les pages légales : à remplir avant la mise en ligne (DEPLOY.md).`);

const tooBig = [];
for await (const file of walk(DIST)) {
  const { size } = await stat(file);
  if (size > CLOUDFLARE_PAGES_MAX_FILE_BYTES) tooBig.push(`${path.relative(DIST, file)} (${(size / 2 ** 20).toFixed(1)} Mio)`);
}
if (tooBig.length) {
  const message = `[postbuild] fichiers > 25 Mio (refusés par Cloudflare Pages) : ${tooBig.join(", ")}. Définir VITE_MODEL_BASE_URL (voir DEPLOY.md).`;
  if (process.env.CF_PAGES === "1" || process.env.STRICT_DEPLOY === "1") {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
} else {
  console.log("[postbuild] dist/ prêt pour Cloudflare Pages (aucun fichier > 25 Mio).");
}
