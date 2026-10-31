/**
 * Comparatif de modèles candidats pour le chemin WASM (context.md > Décisions).
 * Exécute chaque modèle avec onnxruntime-web **backend wasm dans Node** : même binaire wasm32
 * (même plafond 4 Go) que dans le navigateur, sans navigateur. Compare chaque masque au masque
 * de référence BiRefNet_lite 1024 (tests/reference/, produit par scripts/reference-masks.mjs).
 *
 * Usage : node scripts/bench/compare-candidates.mjs <dossier> [<dossier>...]
 *   chaque <dossier> contient model.onnx + preprocessor_config.json (format transformers.js).
 * Métriques : IoU (seuil 0,5) et erreur absolue moyenne (0..1), masque ramené à 1024×1024.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-web";
import sharp from "sharp";
import { REFERENCE_EXAMPLES } from "../reference-examples.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REF_DIR = path.join(ROOT, "tests/reference");
const REF_SIZE = 1024;

ort.env.wasm.numThreads = 1;

function inputSide(cfg) {
  const s = cfg.size ?? {};
  return s.height ?? s.longest_edge ?? s.shortest_edge ?? cfg.pad_size?.height ?? 1024;
}

async function preprocess(png, cfg, side) {
  const { data } = await sharp(png).removeAlpha().resize(side, side, { fit: "fill", kernel: "linear" }).raw().toBuffer({ resolveWithObject: true });
  const mean = cfg.do_normalize ? cfg.image_mean : [0, 0, 0];
  const std = cfg.do_normalize ? cfg.image_std : [1, 1, 1];
  const plane = side * side;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 3 + c] / 255 - mean[c]) / std[c];
  return new ort.Tensor("float32", out, [1, 3, side, side]);
}

/** Sortie brute → masque uint8 ; sigmoid seulement si la sortie n'est pas déjà dans [0,1]. */
function toMask(values) {
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const logits = min < -1e-3 || max > 1 + 1e-3;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = Math.round(255 * (logits ? 1 / (1 + Math.exp(-values[i])) : values[i]));
  return out;
}

function compare(mask, ref) {
  let inter = 0, union = 0, err = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = mask[i] >= 128, b = ref[i] >= 128;
    if (a && b) inter++;
    if (a || b) union++;
    err += Math.abs(mask[i] - ref[i]) / 255;
  }
  return { iou: union ? inter / union : 1, mae: err / ref.length };
}

for (const dir of process.argv.slice(2)) {
  const cfg = JSON.parse(await readFile(path.join(dir, "preprocessor_config.json"), "utf8"));
  const side = inputSide(cfg);
  const model = await readFile(path.join(dir, "model.onnx"));
  const row = { model: path.basename(dir), sizeMb: +(model.byteLength / 2 ** 20).toFixed(1), input: side };
  try {
    const t0 = performance.now();
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], enableCpuMemArena: false, enableMemPattern: false });
    row.loadMs = Math.round(performance.now() - t0);
    row.runs = [];
    for (const ex of REFERENCE_EXAMPLES) {
      const png = await readFile(path.join(REF_DIR, `input-${ex.name}.png`));
      const feeds = { [session.inputNames[0]]: await preprocess(png, cfg, side) };
      const t = performance.now();
      const out = await session.run(feeds);
      const ms = performance.now() - t;
      const tensor = out[session.outputNames[0]];
      const [h, w] = tensor.dims.slice(-2);
      const raw = toMask(tensor.data);
      const mask = await sharp(Buffer.from(raw), { raw: { width: w, height: h, channels: 1 } }).resize(REF_SIZE, REF_SIZE, { fit: "fill", kernel: "linear" }).extractChannel(0).raw().toBuffer();
      const ref = await sharp(path.join(REF_DIR, `mask-${ex.name}.png`)).extractChannel(0).raw().toBuffer();
      const { iou, mae } = compare(mask, ref);
      row.runs.push({ image: ex.name, ms: Math.round(ms), iou: +iou.toFixed(4), mae: +mae.toFixed(4) });
    }
    await session.release();
  } catch (err) {
    row.error = String(err?.message ?? err).slice(0, 200);
  }
  console.log(JSON.stringify(row));
}
