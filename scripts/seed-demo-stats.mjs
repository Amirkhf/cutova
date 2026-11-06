#!/usr/bin/env node
/**
 * Remplit la base D1 LOCALE (wrangler, .wrangler/) avec des données de démonstration pour tester le
 * tableau de bord /stats avec `npm run dev:edge`. Refuse toute base distante : jamais en production.
 *
 * Usage : node scripts/seed-demo-stats.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateDemoRows } from "../edge/demo.ts";

if (process.argv.includes("--remote")) {
  console.error("Données de démonstration : base LOCALE uniquement (jamais --remote).");
  process.exit(1);
}
const rows = generateDemoRows(120);
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = ["DELETE FROM daily_events;"]
  .concat(rows.map((r) => `INSERT INTO daily_events VALUES (${[r.day, r.type, r.page, r.lang, r.engine, r.model, r.tool, r.format, r.time_bucket, r.size_bucket].map(q).join(", ")}, ${r.count});`))
  .join("\n");
const file = path.join(mkdtempSync(path.join(tmpdir(), "cutova-demo-")), "demo.sql");
writeFileSync(file, sql);
execFileSync("npx", ["wrangler", "d1", "execute", "cutova-stats", "--local", `--file=${file}`], { stdio: "inherit" });
console.log(`${rows.length} lignes de démonstration insérées dans la base D1 locale.`);
