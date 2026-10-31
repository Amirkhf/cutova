#!/usr/bin/env node
/**
 * Télécharge les poids du modèle (+ fichiers de config) dans public/models/, avec
 * vérification SHA-256. public/models/ est gitignoré : ce script doit tourner avant
 * `npm run dev` / `npm run build` sur chaque poste et en CI.
 *
 * Usage :
 *   node scripts/fetch-model.mjs              # télécharge fp32 + fp16
 *   node scripts/fetch-model.mjs --only=fp32  # une seule variante
 *   MODEL_BASE_URL=https://cdn.example.com/models node scripts/fetch-model.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_AUX_FILES, MODEL_REPO_ID, MODEL_REVISION, MODEL_WEIGHT_FILES } from "./model-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MODEL_BASE_URL = process.env.MODEL_BASE_URL ?? `https://huggingface.co/${MODEL_REPO_ID}/resolve/${MODEL_REVISION}`;
const DEST_ROOT = path.join(REPO_ROOT, "public", "models", MODEL_REPO_ID);

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : null;

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

async function fetchWeightFile(file) {
  const destPath = path.join(DEST_ROOT, file.path);
  if (await existingFileMatches(destPath, file.sha256, file.size)) {
    console.log(`[skip] ${file.path} déjà présent et vérifié (${file.dtype})`);
    return;
  }
  const url = `${MODEL_BASE_URL}/${file.path}`;
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

async function fetchAuxFile(name) {
  const destPath = path.join(DEST_ROOT, name);
  const url = `${MODEL_BASE_URL}/${name}`;
  console.log(`[get]  ${name} depuis ${url}`);
  await downloadFile(url, destPath);
}

async function main() {
  const weightFiles = only ? MODEL_WEIGHT_FILES.filter((f) => f.dtype === only) : MODEL_WEIGHT_FILES;
  if (only && weightFiles.length === 0) {
    throw new Error(`--only=${only} ne correspond à aucune variante connue (fp32, fp16).`);
  }
  for (const name of MODEL_AUX_FILES) {
    await fetchAuxFile(name);
  }
  for (const file of weightFiles) {
    await fetchWeightFile(file);
  }
  console.log(`Terminé. Fichiers dans ${DEST_ROOT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
