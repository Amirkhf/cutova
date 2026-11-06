/**
 * Masques de référence BiRefNet_lite à 1024×1024, calculés avec onnxruntime-node (natif,
 * pas de limite mémoire wasm32 de 4 Go). Étalon de qualité pour le chemin WASM navigateur
 * (IoU / erreur moyenne : scripts/bench/compare-candidates.mjs).
 *
 * Entrées : toutes les photos `tests/images/*.jpg` (sources : tests/images/SOURCES.md).
 * Sorties : tests/reference/<photo>.png (masque niveaux de gris 1024×1024) + reference.json
 * (temps, pic mémoire résident VmHWM).
 *
 * Usage : node scripts/reference-masks.mjs
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { REFERENCE_MODEL } from "./model-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_PATH = path.join(ROOT, "public/models", REFERENCE_MODEL.repoId, REFERENCE_MODEL.weights.fp32.path);
export const PHOTOS_DIR = path.join(ROOT, "tests/images");
export const REF_DIR = path.join(ROOT, "tests/reference");
const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export async function listPhotos() {
  return (await readdir(PHOTOS_DIR)).filter((f) => f.endsWith(".jpg")).sort();
}

/** RGB → tenseur NCHW float32 normalisé ImageNet (comme preprocessor_config.json). */
async function preprocess(file) {
  const data = await sharp(file).removeAlpha().resize(SIZE, SIZE, { fit: "fill", kernel: "linear" }).raw().toBuffer();
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  }
  return new ort.Tensor("float32", out, [1, 3, SIZE, SIZE]);
}

function toMask(logits) {
  const mask = new Uint8Array(logits.length);
  for (let i = 0; i < logits.length; i++) mask[i] = Math.round(255 / (1 + Math.exp(-logits[i])));
  return mask;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(REF_DIR, { recursive: true });
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(MODEL_PATH, { enableCpuMemArena: false, enableMemPattern: false });
  const loadMs = performance.now() - t0;
  const runs = [];
  for (const photo of await listPhotos()) {
    const input = await preprocess(path.join(PHOTOS_DIR, photo));
    const t = performance.now();
    const { output_image } = await session.run({ input_image: input });
    const ms = Math.round(performance.now() - t);
    await sharp(Buffer.from(toMask(output_image.data)), { raw: { width: SIZE, height: SIZE, channels: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(REF_DIR, photo.replace(/\.jpg$/, ".png")));
    runs.push({ photo, inferenceMs: ms });
    console.log(`[ok] ${photo} : ${ms} ms`);
  }
  // Pic mémoire résident réel du processus (Linux) ; un échantillonnage JS rate les pics natifs.
  const hwm = (await readFile("/proc/self/status", "utf8").catch(() => "")).match(/VmHWM:\s+(\d+)/);
  const summary = {
    runtime: `onnxruntime-node ${ort.env.versions?.common ?? ""}`.trim(),
    sessionOptions: "enableCpuMemArena=false, enableMemPattern=false",
    size: SIZE,
    loadMs: Math.round(loadMs),
    peakRssMb: hwm ? Math.round(Number(hwm[1]) / 1024) : null,
    runs,
  };
  await writeFile(path.join(REF_DIR, "reference.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ loadMs: summary.loadMs, peakRssMb: summary.peakRssMb }));
}
