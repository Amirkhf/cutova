#!/usr/bin/env node
/**
 * Banc d'inférence dans un VRAI navigateur (Chromium, Playwright) sur les 20 photos de tests/images/ :
 * temps d'inférence du worker (data-elapsed-ms) et temps clic→résultat, p50 / p95, moteur utilisé.
 * Prérequis : `npm run build` puis `npx vite preview --port 4173` (ou BENCH_URL).
 *
 * Usage : node scripts/bench/browser-bench.mjs [--out docs/review/bench-chromium.json]
 *   PLAYWRIGHT_CHROMIUM_PATH=/chemin/chrome pour un Chromium déjà installé.
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const URL_BASE = process.env.BENCH_URL ?? "http://localhost:4173/";
const outIndex = process.argv.indexOf("--out");
const OUT = outIndex > 0 ? process.argv[outIndex + 1] : path.join(ROOT, "docs/review/bench-chromium.json");

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const photos = (await readdir(path.join(ROOT, "tests/images"))).filter((f) => f.endsWith(".jpg")).sort();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.goto(URL_BASE);
  const runs = [];
  for (const [i, photo] of photos.entries()) {
    const started = Date.now();
    await page.setInputFiles('.upload-card input[type="file"]', path.join(ROOT, "tests/images", photo));
    await page.locator(`.result-panel[data-run="${i + 1}"][data-state="done"], .result-panel[data-run="${i + 1}"][data-state="error"]`).waitFor({ timeout: 600_000 });
    const panel = page.locator(".result-panel");
    runs.push({
      photo,
      state: await panel.getAttribute("data-state"),
      engine: await panel.getAttribute("data-engine"),
      inferenceMs: Number(await panel.getAttribute("data-elapsed-ms")),
      refineMs: Number(await panel.getAttribute("data-refine-ms")),
      totalMs: Date.now() - started,
    });
    console.error(`${photo}\t${runs.at(-1).inferenceMs} ms`);
  }
  const env = await page.evaluate(() => ({ userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, crossOriginIsolated }));
  await browser.close();
  // La 1re image inclut le chargement du modèle : exclue des percentiles d'inférence "à chaud".
  const warm = runs.slice(1).map((r) => r.inferenceMs);
  const report = {
    date: new Date().toISOString(),
    env,
    first: runs[0],
    warm: { count: warm.length, p50: percentile(warm, 50), p95: percentile(warm, 95), min: Math.min(...warm), max: Math.max(...warm) },
    refine: { p50: percentile(runs.map((r) => r.refineMs), 50), p95: percentile(runs.map((r) => r.refineMs), 95) },
    runs,
  };
  await writeFile(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ first: runs[0].totalMs, warm: report.warm, refine: report.refine, engine: runs[0].engine }));
}
