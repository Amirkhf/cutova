#!/usr/bin/env node
/**
 * Images de l'accueil, calculées par NOTRE modèle (BiRefNet_lite, onnxruntime-node) à partir des
 * photos Pexels de tests/images/ (sources : tests/images/SOURCES.md) :
 *   public/examples/<id>.webp + <id>-thumb.{avif,webp}      4 images d'exemple (bouton "Essayer")
 *   public/showcase/demo-before.webp / demo-after.webp      démo avant/après de l'accueil
 *   public/showcase/<cat>-{original,cutout,background,variant}.webp   galerie à onglets
 * Budget : ≤ 150 Ko par fichier (vérifié, échec sinon). Reproductible : `node scripts/build-showcase.mjs`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { REFERENCE_MODEL } from "./model-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = path.join(ROOT, "tests/images");
const MAX_BYTES = 150 * 1024;
const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export const EXAMPLES = [
  { id: "person", photo: "hair-157920" },
  { id: "product", photo: "product-6346" },
  { id: "animal", photo: "fur-17767" },
  { id: "car", photo: "car-7406" },
];
export const DEMO = "hair-53000";
export const GALLERY = [
  { id: "people", photo: "hair-35537", background: "field", variant: "blur" },
  { id: "products", photo: "product-5670", background: "#f4f1ea", variant: "white-shadow" },
  { id: "animals", photo: "fur-12162", background: "sky", variant: "sticker" },
  { id: "cars", photo: "car-4314", background: "city", variant: "blur" },
  { id: "graphics", photo: "logo-109998", background: "#ffffff", variant: "sticker" },
];

const session = await ort.InferenceSession.create(path.join(ROOT, "public/models", REFERENCE_MODEL.repoId, REFERENCE_MODEL.weights.fp32.path), {
  enableCpuMemArena: false,
  enableMemPattern: false,
});

/** Photo (≤ `side` px) + son masque alpha à la même taille. */
async function cutout(photo, side) {
  const file = path.join(PHOTOS, `${photo}.jpg`);
  const { data } = await sharp(file).removeAlpha().resize(SIZE, SIZE, { fit: "fill", kernel: "linear" }).raw().toBuffer({ resolveWithObject: true });
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) input[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const { output_image } = await session.run({ input_image: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const mask = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) mask[i] = Math.round(255 / (1 + Math.exp(-output_image.data[i])));
  const rgb = await sharp(file).resize(side, side, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = rgb.info;
  const alpha = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(width, height, { fit: "fill" }).extractChannel(0).raw().toBuffer();
  const rgba = await sharp(rgb.data, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return { rgb: rgb.data, rgba, alpha, width, height };
}

async function save(file, pipeline, quality = 72) {
  let q = quality;
  for (;;) {
    const buffer = await pipeline(q);
    if (buffer.length <= MAX_BYTES || q <= 30) {
      if (buffer.length > MAX_BYTES) throw new Error(`${file} : ${buffer.length} octets > 150 Ko`);
      await writeFile(file, buffer);
      return buffer.length;
    }
    q -= 8;
  }
}

/** Fond : couleur `#rrggbb` ou photo de public/backgrounds/. */
async function backgroundOf(spec, width, height) {
  if (spec.startsWith("#")) return sharp({ create: { width, height, channels: 3, background: spec } }).png().toBuffer();
  return sharp(path.join(ROOT, "public/backgrounds", `${spec}.webp`)).resize(width, height, { fit: "cover" }).png().toBuffer();
}

async function variantOf(kind, c) {
  const { width, height } = c;
  if (kind === "blur") {
    const base = await sharp(c.rgb, { raw: { width, height, channels: 3 } }).blur(Math.max(8, width / 60)).png().toBuffer();
    return sharp(base).composite([{ input: c.rgba }]);
  }
  if (kind === "white-shadow") {
    const shadow = await sharp(c.alpha, { raw: { width, height, channels: 1 } })
      .blur(Math.max(6, width / 70))
      .linear(0.45, 0)
      .extractChannel(0)
      .raw()
      .toBuffer();
    const black = await sharp({ create: { width, height, channels: 3, background: "#000000" } }).joinChannel(shadow, { raw: { width, height, channels: 1 } }).png().toBuffer();
    return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite([{ input: black, top: Math.round(height / 40), left: 0 }, { input: c.rgba }]);
  }
  // "sticker" : contour blanc épais (dilatation de l'alpha) sur fond de marque.
  const dilated = await sharp(c.alpha, { raw: { width, height, channels: 1 } }).blur(Math.max(4, width / 90)).threshold(8).extractChannel(0).raw().toBuffer();
  const white = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).joinChannel(dilated, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: "#5b4bff" } }).composite([{ input: white }, { input: c.rgba }]);
}

await mkdir(path.join(ROOT, "public/examples"), { recursive: true });
await mkdir(path.join(ROOT, "public/showcase"), { recursive: true });
const report = [];

for (const ex of EXAMPLES) {
  const file = path.join(PHOTOS, `${ex.photo}.jpg`);
  const out = path.join(ROOT, "public/examples");
  report.push([`examples/${ex.id}.webp`, await save(path.join(out, `${ex.id}.webp`), (q) => sharp(file).resize(1400, 1400, { fit: "inside" }).webp({ quality: q }).toBuffer())]);
  report.push([`examples/${ex.id}-thumb.avif`, await save(path.join(out, `${ex.id}-thumb.avif`), (q) => sharp(file).resize(240, 240, { fit: "cover" }).avif({ quality: Math.max(30, q - 20) }).toBuffer())]);
  report.push([`examples/${ex.id}-thumb.webp`, await save(path.join(out, `${ex.id}-thumb.webp`), (q) => sharp(file).resize(240, 240, { fit: "cover" }).webp({ quality: q }).toBuffer())]);
}

const demo = await cutout(DEMO, 720);
const showcase = path.join(ROOT, "public/showcase");
report.push(["showcase/demo-before.webp", await save(path.join(showcase, "demo-before.webp"), (q) => sharp(demo.rgb, { raw: { width: demo.width, height: demo.height, channels: 3 } }).webp({ quality: q }).toBuffer())]);
report.push(["showcase/demo-after.webp", await save(path.join(showcase, "demo-after.webp"), (q) => sharp(demo.rgba).webp({ quality: q, alphaQuality: 90 }).toBuffer())]);

for (const g of GALLERY) {
  const c = await cutout(g.photo, 640);
  const raw = { raw: { width: c.width, height: c.height, channels: 3 } };
  report.push([`showcase/${g.id}-original.webp`, await save(path.join(showcase, `${g.id}-original.webp`), (q) => sharp(c.rgb, raw).webp({ quality: q }).toBuffer())]);
  report.push([`showcase/${g.id}-cutout.webp`, await save(path.join(showcase, `${g.id}-cutout.webp`), (q) => sharp(c.rgba).webp({ quality: q, alphaQuality: 90 }).toBuffer())]);
  const bg = await backgroundOf(g.background, c.width, c.height);
  report.push([`showcase/${g.id}-background.webp`, await save(path.join(showcase, `${g.id}-background.webp`), async (q) => (await sharp(bg).composite([{ input: c.rgba }]).png().toBuffer().then((b) => sharp(b).webp({ quality: q }).toBuffer())))]);
  report.push([`showcase/${g.id}-variant.webp`, await save(path.join(showcase, `${g.id}-variant.webp`), async (q) => sharp(await (await variantOf(g.variant, c)).png().toBuffer()).webp({ quality: q }).toBuffer())]);
  console.log(`[ok] ${g.id} (${c.width}×${c.height})`);
}

for (const [name, bytes] of report) console.log(`${name}\t${Math.round(bytes / 1024)} Ko`);
