/**
 * Masques de référence BiRefNet_lite à 1024×1024, calculés avec onnxruntime-node (natif,
 * pas de limite mémoire wasm32 de 4 Go). Sert d'étalon de qualité pour le chemin WASM
 * navigateur (IoU / erreur moyenne, voir tests/e2e/wasm-inference.spec.ts).
 *
 * Entrées : 3 des 4 images d'exemple de l'accueil (mêmes chemins SVG, mêmes couleurs, même
 * cadrage 512×512 que `upload-card.ts` > `exampleToFile`), écrites dans tests/reference/.
 * Sorties : tests/reference/mask-<nom>.png (niveaux de gris 1024×1024) + reference.json
 * (temps, pic mémoire RSS).
 *
 * Usage : node scripts/reference-masks.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { MODEL_REPO_ID } from "./model-manifest.mjs";
import { REFERENCE_EXAMPLES } from "./reference-examples.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_PATH = path.join(ROOT, "public/models", MODEL_REPO_ID, "onnx/model.onnx");
const OUT_DIR = path.join(ROOT, "tests/reference");
const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];


function exampleSvg({ bg, fg, d }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
      `<rect width="512" height="512" fill="${bg}"/>` +
      `<path transform="translate(56 56) scale(2)" fill="${fg}" d="${d}"/></svg>`,
  );
}

/** RGB uint8 → tenseur NCHW float32 normalisé ImageNet (comme preprocessor_config.json). */
async function preprocess(png) {
  const { data } = await sharp(png)
    .removeAlpha()
    .resize(SIZE, SIZE, { fit: "fill", kernel: "linear" })
    .raw()
    .toBuffer({ resolveWithObject: true });
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


await mkdir(OUT_DIR, { recursive: true });
const t0 = performance.now();
const session = await ort.InferenceSession.create(MODEL_PATH);
const loadMs = performance.now() - t0;
const runs = [];
for (const ex of REFERENCE_EXAMPLES) {
  const png = await sharp(exampleSvg(ex)).png().toBuffer();
  await writeFile(path.join(OUT_DIR, `input-${ex.name}.png`), png);
  const input = await preprocess(png);
  const t = performance.now();
  const { output_image } = await session.run({ input_image: input });
  const ms = performance.now() - t;
  const mask = toMask(output_image.data);
  await sharp(Buffer.from(mask), { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .png()
    .toFile(path.join(OUT_DIR, `mask-${ex.name}.png`));
  runs.push({ name: ex.name, inferenceMs: Math.round(ms) });
  console.log(`[ok] ${ex.name} : ${Math.round(ms)} ms`);
}
// Pic mémoire résident réel du processus (Linux) ; un échantillonnage JS rate les pics natifs.
const hwm = (await readFile("/proc/self/status", "utf8").catch(() => "")).match(/VmHWM:\s+(\d+)/);
const summary = { runtime: `onnxruntime-node ${ort.env.versions?.common ?? ""}`.trim(), size: SIZE, loadMs: Math.round(loadMs), runs, peakRssMb: hwm ? Math.round(Number(hwm[1]) / 1024) : null };
await writeFile(path.join(OUT_DIR, "reference.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
