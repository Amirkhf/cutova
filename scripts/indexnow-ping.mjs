#!/usr/bin/env node
/**
 * Signale toutes les URL du sitemap à IndexNow (Bing, Yandex, Seznam…) APRÈS une mise en ligne.
 * À lancer par l'éditeur du site, depuis son ordinateur (requête réseau vers api.indexnow.org) :
 *
 *   SITE_URL=https://exemple.com INDEXNOW_KEY=<la même clé qu'au build> node scripts/indexnow-ping.mjs
 *
 * Prérequis : le site déployé sert /<INDEXNOW_KEY>.txt (écrit par scripts/postbuild.mjs).
 */
const site = process.env.SITE_URL?.replace(/\/+$/, "");
const key = process.env.INDEXNOW_KEY?.trim();
if (!site || !key) {
  console.error("Définir SITE_URL et INDEXNOW_KEY (voir DEPLOY.md).");
  process.exit(1);
}
const sitemap = await (await fetch(`${site}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const keyCheck = await fetch(`${site}/${key}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== key) {
  console.error(`Le fichier-clé ${site}/${key}.txt est absent ou différent : redéployer avec INDEXNOW_KEY.`);
  process.exit(1);
}
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList }),
});
console.log(`IndexNow : ${urlList.length} URL envoyées → HTTP ${response.status} (200 ou 202 = accepté).`);
process.exit(response.ok ? 0 : 1);
