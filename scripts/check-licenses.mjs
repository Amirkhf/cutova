#!/usr/bin/env node
/**
 * Contrôle des licences de TOUTES les dépendances installées (production et développement).
 * Échec (code 1) si une dépendance est sous GPL ou AGPL (règle LICENSES.md). LGPL et licences
 * inconnues : signalées, sans échec (à examiner à la main). Résumé par licence.
 *
 * Usage : npm run check:licenses   (ou node scripts/check-licenses.mjs --json)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE_MODULES = path.join(ROOT, "node_modules");

/** Normalise le champ `license` (chaîne SPDX, objet ancien format, tableau `licenses`). */
export function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return "UNKNOWN";
}

/** GPL/AGPL (toutes versions), mais pas LGPL. Une alternative non-GPL ("MIT OR GPL-2.0") est acceptée. */
export function isForbidden(license) {
  const options = license.replace(/[()]/g, "").split(/\s+OR\s+/i);
  return options.every((option) => /(^|[^L])\bA?GPL\b/i.test(option) && !/\bLGPL\b/i.test(option));
}

async function* packages(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      yield* packages(full);
      continue;
    }
    try {
      const pkg = JSON.parse(await readFile(path.join(full, "package.json"), "utf8"));
      if (pkg.name) yield { name: pkg.name, version: pkg.version, license: licenseOf(pkg) };
    } catch {
      // dossier sans package.json : ignoré
    }
    yield* packages(path.join(full, "node_modules"));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seen = new Map();
  for await (const p of packages(NODE_MODULES)) seen.set(`${p.name}@${p.version}`, p);
  const all = [...seen.values()];
  const forbidden = all.filter((p) => isForbidden(p.license));
  const lgpl = all.filter((p) => /\bLGPL\b/i.test(p.license));
  const unknown = all.filter((p) => p.license === "UNKNOWN");
  const byLicense = {};
  for (const p of all) byLicense[p.license] = (byLicense[p.license] ?? 0) + 1;
  const report = { packages: all.length, byLicense, forbidden, lgpl, unknown };
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`[licences] ${all.length} paquets.`, Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l}: ${n}`).join(", "));
    for (const p of lgpl) console.warn(`[licences] LGPL (à examiner) : ${p.name}@${p.version} (${p.license})`);
    for (const p of unknown) console.warn(`[licences] licence inconnue : ${p.name}@${p.version}`);
    for (const p of forbidden) console.error(`[licences] INTERDIT (GPL/AGPL) : ${p.name}@${p.version} (${p.license})`);
  }
  process.exit(forbidden.length ? 1 : 0);
}
