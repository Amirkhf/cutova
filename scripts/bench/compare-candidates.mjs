/**
 * Comparatif de modèles pour le chemin WASM (context.md > Décisions).
 * Exécute UN modèle avec onnxruntime-web **backend wasm dans Node** : même binaire wasm32 (même
 * plafond 4 Go) que dans le navigateur, sans navigateur. Compare chaque masque au masque de
 * référence BiRefNet_lite 1024 (tests/reference/, produit par scripts/reference-masks.mjs).
 *
 * Usage : node scripts/bench/compare-candidates.mjs <dossier> [--threads N] [--only motif]
 *   <dossier> contient model.onnx + preprocessor_config.json (format transformers.js).
 *   Un modèle par processus : le pic mémoire (VmHWM) mesuré est alors celui de ce modèle.
 * Métriques : IoU (seuil 0,5) et erreur absolue moyenne (0..1), masque ramené à 1024×1024.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-web";
import sharp from "sharp";
import { listPhotos, PHOTOS_DIR, REF_DIR } from "../reference-masks.mjs";

const REF_SIZE = 1024;
const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
ort.env.wasm.numThreads = Number(opt("--threads", "1"));
const only = opt("--only", "");

function inputSide(cfg) {
  const s = cfg.size ?? {};
  return s.height ?? s.longest_edge ?? s.shortest_edge ?? cfg.pad_size?.height ?? 1024;
}

async function preprocess(file, cfg, side) {
  const data = await sharp(file).removeAlpha().resize(side, side, { fit: "fill", kernel: "linear" }).raw().toBuffer();
  const mean = cfg.do_normalize ? cfg.image_mean : [0, 0, 0];
  const std = cfg.do_normalize ? cfg.image_std : [1, 1, 1];
  const plane = side * side;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 3 + c] / 255 - mean[c]) / std[c];
  return new ort.Tensor("float32", out, [1, 3, side, side]);
}

/** Sortie brute → masque uint8 ; sigmoid seulement si la sortie n'est pas déjà dans [0,1]. */
function toMask(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const logits = min < -1e-3 || max > 1 + 1e-3;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = Math.round(255 * (logits ? 1 / (1 + Math.exp(-values[i])) : values[i]));
  return out;
}

function compare(mask, ref) {
  let inter = 0;
  let union = 0;
  let err = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = mask[i] >= 128;
    const b = ref[i] >= 128;
    if (a && b) inter++;
    if (a || b) union++;
    err += Math.abs(mask[i] - ref[i]) / 255;
  }
  return { iou: union ? inter / union : 1, mae: err / ref.length };
}

const cfg = JSON.parse(await readFile(path.join(dir, "preprocessor_config.json"), "utf8"));
const side = inputSide(cfg);
const model = await readFile(path.join(dir, "model.onnx"));
const row = { model: path.basename(dir), threads: ort.env.wasm.numThreads, sizeMb: +(model.byteLength / 2 ** 20).toFixed(1), input: side };
try {
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], enableCpuMemArena: false, enableMemPattern: false });
  row.loadMs = Math.round(performance.now() - t0);
  row.runs = [];
  for (const photo of (await listPhotos()).filter((p) => p.includes(only))) {
    const feeds = { [session.inputNames[0]]: await preprocess(path.join(PHOTOS_DIR, photo), cfg, side) };
    const t = performance.now();
    const out = await session.run(feeds);
    const ms = performance.now() - t;
    const tensor = out[session.outputNames[0]];
    const [h, w] = tensor.dims.slice(-2);
    const mask = await sharp(Buffer.from(toMask(tensor.data)), { raw: { width: w, height: h, channels: 1 } })
      .resize(REF_SIZE, REF_SIZE, { fit: "fill", kernel: "linear" })
      .extractChannel(0)
      .raw()
      .toBuffer();
    const ref = await sharp(path.join(REF_DIR, photo.replace(/\.jpg$/, ".png"))).extractChannel(0).raw().toBuffer();
    const { iou, mae } = compare(mask, ref);
    row.runs.push({ photo, ms: Math.round(ms), iou: +iou.toFixed(4), mae: +mae.toFixed(4) });
    console.error(`${row.model} ${photo} ${Math.round(ms)} ms IoU ${iou.toFixed(3)}`);
  }
  await session.release();
  const ious = row.runs.map((r) => r.iou);
  const times = row.runs.map((r) => r.ms).sort((a, b) => a - b);
  row.iouMean = +(ious.reduce((a, b) => a + b, 0) / ious.length).toFixed(4);
  row.iouMin = Math.min(...ious);
  row.maeMean = +(row.runs.reduce((a, r) => a + r.mae, 0) / row.runs.length).toFixed(4);
  row.msMedian = times[Math.floor(times.length / 2)];
} catch (err) {
  row.error = String(err?.message ?? err).slice(0, 200);
}
const hwm = (await readFile("/proc/self/status", "utf8").catch(() => "")).match(/VmHWM:\s+(\d+)/);
row.peakRssMb = hwm ? Math.round(Number(hwm[1]) / 1024) : null;
console.log(JSON.stringify(row));
