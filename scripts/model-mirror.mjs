#!/usr/bin/env node
/**
 * Fichiers du stockage externe des modèles (bucket R2 en production), disposition décrite dans
 * src/core/model/remote.ts :
 *   <repoId>/resolve/<revision>/<fichier>                (poids + config, depuis public/models/)
 *   onnxruntime-web/<version>/ort-wasm-simd-threaded*.wasm (binaires, depuis node_modules/)
 *
 * Usage :
 *   node scripts/model-mirror.mjs r2-commands --bucket cutova-models
 *       → affiche les commandes `wrangler r2 object put` à lancer (n'envoie rien lui-même).
 *   node scripts/model-mirror.mjs serve --port 4180
 *       → "faux R2" local (autre origine, CORS) pour tester le mode externe
 *         (tests/e2e-remote/, playwright.remote.config.ts).
 * Prérequis : `node scripts/fetch-model.mjs` (fichiers dans public/models/).
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, USED_MODEL_IDS } from "./model-manifest.mjs";
import { MODEL_CACHE_CONTROL, MODEL_CDN_CACHE_CONTROL } from "../security-headers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Seuls les `.wasm` vont sur le stockage externe (les `.mjs` restent sur le site : CSP). */
const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.asyncify.wasm"];

function contentType(file) {
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".mjs")) return "text/javascript";
  return "application/octet-stream";
}

/** [{ key, file, contentType }] pour tous les fichiers à publier. */
export async function mirrorFiles() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const ortVersion = pkg.dependencies["onnxruntime-web"];
  const files = [];
  for (const id of USED_MODEL_IDS) {
    const model = MODELS[id];
    const names = [...model.aux, ...Object.values(model.weights).map((w) => w.path)];
    for (const name of names) {
      files.push({
        key: `${model.repoId}/resolve/${model.revision}/${name}`,
        file: path.join(ROOT, "public/models", model.repoId, name),
        contentType: contentType(name),
      });
    }
  }
  for (const name of ORT_FILES) {
    files.push({ key: `onnxruntime-web/${ortVersion}/${name}`, file: path.join(ROOT, "node_modules/onnxruntime-web/dist", name), contentType: contentType(name) });
  }
  return files;
}

const [command, ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};

if (command === "r2-commands") {
  const bucket = option("bucket", "cutova-models");
  for (const f of await mirrorFiles()) {
    await stat(f.file); // échoue clairement si fetch-model.mjs n'a pas été lancé
    console.log(
      `npx wrangler r2 object put "${bucket}/${f.key}" --remote --file "${path.relative(ROOT, f.file)}" --content-type "${f.contentType}" --cache-control "${MODEL_CACHE_CONTROL}"`,
    );
  }
  console.error(`# Cache côté CDN : règle Cloudflare sur le domaine du bucket → "${MODEL_CDN_CACHE_CONTROL}" (voir DEPLOY.md).`);
} else if (command === "serve") {
  const port = Number(option("port", "4180"));
  const byKey = new Map((await mirrorFiles()).map((f) => [`/${f.key}`, f]));
  createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length");
    const entry = byKey.get(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    if (req.method === "OPTIONS") return res.writeHead(204, { "Access-Control-Allow-Methods": "GET, HEAD", "Access-Control-Allow-Headers": "*" }).end();
    if (!entry) return res.writeHead(404).end();
    const { size } = await stat(entry.file);
    res.writeHead(200, { "Content-Type": entry.contentType, "Content-Length": size, "Cache-Control": MODEL_CACHE_CONTROL });
    if (req.method === "HEAD") return res.end();
    createReadStream(entry.file).pipe(res);
  }).listen(port, "127.0.0.1", () => console.log(`[mirror] faux R2 sur http://127.0.0.1:${port}/`));
} else {
  console.error("Usage : node scripts/model-mirror.mjs r2-commands --bucket <nom> | serve --port <port>");
  process.exit(1);
}
