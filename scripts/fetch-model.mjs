#!/usr/bin/env node
/**
 * Télécharge les poids + fichiers de config des modèles utilisés par un moteur
 * (`src/core/model/models.json` > `engines`) dans public/models/<repoId>/, avec vérification
 * SHA-256. public/models/ est gitignoré : ce script doit tourner avant `npm run dev` /
 * `npm run build` sur chaque poste et en CI.
 *
 * Usage :
 *   node scripts/fetch-model.mjs                 # tous les modèles utilisés, toutes variantes
 *   node scripts/fetch-model.mjs --only=fp32     # une seule variante de poids
 *   node scripts/fetch-model.mjs --model=ormbg   # un seul modèle (clé de models.json)
 *   MODEL_BASE_URL=https://cdn.example.com/models node scripts/fetch-model.mjs
 *     (MODEL_BASE_URL remplace https://huggingface.co ; les fichiers y sont cherchés sous
 *      <MODEL_BASE_URL>/<repoId>/<chemin>, même arborescence que public/models/)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, USED_MODEL_IDS } from "./model-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const only = arg("only");
const onlyModel = arg("model");

function baseUrlFor(model) {
  return process.env.MODEL_BASE_URL
    ? `${process.env.MODEL_BASE_URL.replace(/\/$/, "")}/${model.repoId}`
    : `https://huggingface.co/${model.repoId}/resolve/${model.revision}`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function existingFileMatches(destPath, expectedSha256, expectedSize) {
  try {
    const st = await stat(destPath);
    if (st.size !== expectedSize) return false;
    const data = await readFile(destPath);
    return sha256(data) === expectedSha256;
  } catch {
    return false;
  }
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en téléchargeant ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
  return buffer;
}

async function fetchWeightFile(model, file) {
  const destPath = path.join(REPO_ROOT, "public", "models", model.repoId, file.path);
  if (await existingFileMatches(destPath, file.sha256, file.size)) {
    console.log(`[skip] ${file.path} déjà présent et vérifié (${file.dtype})`);
    return;
  }
  const url = `${baseUrlFor(model)}/${file.path}`;
  console.log(`[get]  ${file.path} (${file.dtype}, ${(file.size / 1_048_576).toFixed(1)} Mo) depuis ${url}`);
  const buffer = await downloadFile(url, destPath);
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== file.sha256) {
    await rm(destPath, { force: true });
    throw new Error(
      `SHA-256 invalide pour ${file.path} : attendu ${file.sha256}, obtenu ${actualSha256}. Fichier supprimé.`,
    );
  }
  if (buffer.length !== file.size) {
    throw new Error(`Taille inattendue pour ${file.path} : attendu ${file.size}, obtenu ${buffer.length}.`);
  }
  console.log(`[ok]   ${file.path} vérifié (SHA-256 correspond)`);
}

async function fetchAuxFile(model, name) {
  const destPath = path.join(REPO_ROOT, "public", "models", model.repoId, name);
  const url = `${baseUrlFor(model)}/${name}`;
  console.log(`[get]  ${name} depuis ${url}`);
  await downloadFile(url, destPath);
}

async function main() {
  const ids = onlyModel ? [onlyModel] : USED_MODEL_IDS;
  for (const id of ids) {
    const model = MODELS[id];
    if (!model) throw new Error(`--model=${id} : modèle inconnu dans models.json.`);
    const weightFiles = Object.entries(model.weights)
      .filter(([dtype]) => !only || dtype === only)
      .map(([dtype, file]) => ({ dtype, ...file }));
    for (const name of model.aux) await fetchAuxFile(model, name);
    for (const file of weightFiles) await fetchWeightFile(model, file);
    console.log(`[ok]   ${id} : public/models/${model.repoId}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
