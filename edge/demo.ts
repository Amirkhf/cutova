/**
 * Données de DÉMONSTRATION pour le tableau de bord (jamais en production) : utilisées par le serveur
 * de développement Vite (`/api/stats` en dev) et par `scripts/seed-demo-stats.mjs` (D1 LOCAL seulement).
 * Pseudo-aléatoire déterministe (même graine → mêmes chiffres) pour des captures reproductibles.
 */
import type { Row } from "./stats.ts";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PAGES = ["/", "/fr/", "/remove-bg-alternative/", "/how-to/make-transparent-png/", "/fr/alternative-remove-bg/", "/for/ecommerce/", "/es/", "/pt-br/"];
const LANGS = ["en", "fr", "es", "pt-br", "id"];
const TOOLS = ["background", "background_photo", "shadow", "outline", "adjust", "erase", "crop", "format_preset", "undo"];
const FORMATS = ["png", "webp", "jpg"];
const TIMES = ["lt1s", "1-2s", "2-5s", "5-10s", "gt10s"];

const empty = { page: "", lang: "", engine: "", model: "", tool: "", format: "", time_bucket: "", size_bucket: "" };

export function generateDemoRows(days = 120, now = Date.now(), seed = 42): Row[] {
  const random = rng(seed);
  const rows: Row[] = [];
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(today - d * 86_400_000).toISOString().slice(0, 10);
    const growth = 1 + (days - d) / days; // trafic en croissance
    const weekend = [0, 6].includes(new Date(today - d * 86_400_000).getUTCDay()) ? 0.7 : 1;
    const base = Math.round((180 + random() * 90) * growth * weekend);
    for (const [i, page] of PAGES.entries()) {
      rows.push({ ...empty, day, type: "page_view", page, lang: LANGS[i % LANGS.length]!, count: Math.round((base / (i + 1.4)) * (0.8 + random() * 0.4)) });
    }
    const cutouts = Math.round(base * 0.55);
    for (const engine of ["webgpu", "wasm"]) {
      const share = engine === "webgpu" ? 0.2 : 0.8;
      for (const [t, time] of TIMES.entries()) {
        const weight = engine === "webgpu" ? [0.4, 0.35, 0.2, 0.04, 0.01][t]! : [0.02, 0.08, 0.55, 0.3, 0.05][t]!;
        rows.push({ ...empty, day, type: "cutout_done", lang: "en", engine, model: engine === "webgpu" ? "birefnet-lite" : "ormbg", time_bucket: time, size_bucket: "1-4mp", count: Math.round(cutouts * share * weight) });
      }
    }
    rows.push({ ...empty, day, type: "cutout_failed", lang: "en", engine: "wasm", model: "ormbg", size_bucket: "gt24mp", count: Math.round(cutouts * (0.01 + random() * 0.02)) });
    rows.push({ ...empty, day, type: "engine_fallback", lang: "en", engine: "webgpu", model: "birefnet-lite", count: Math.round(random() * 4) });
    for (const [f, format] of FORMATS.entries()) {
      rows.push({ ...empty, day, type: "download", lang: "en", format, size_bucket: "1-4mp", count: Math.round(cutouts * [0.5, 0.15, 0.2][f]! * (0.8 + random() * 0.4)) });
    }
    for (const [t, tool] of TOOLS.entries()) {
      rows.push({ ...empty, day, type: "tool_used", lang: "en", tool, count: Math.round((cutouts * 0.4) / (t + 1)) });
    }
    rows.push({ ...empty, day, type: "batch_zip", lang: "en", format: "png", count: Math.round(random() * 8) });
  }
  return rows.filter((r) => r.count > 0);
}
