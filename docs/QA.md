# Rapport de recette — Cutova

Date : 2026-11-01. Banc : bac à sable Linux, 4 cœurs, 15 Go de RAM, **sans GPU** (chemin WASM).
Build de production servi par `vite preview` (mêmes en-têtes que le `_headers` de Cloudflare Pages).

## Résumé

| Domaine | Résultat |
|---|---|
| Tests unitaires (vitest) | **131 / 131** |
| Tests e2e (Chromium ordinateur + 4 profils de recette) | **74 / 74** (éditeur, SEO, accueil, inférence, dev = build, WebGPU/repli, recette) |
| Recette `tests/e2e/qa.spec.ts` | **18 / 18** : Chromium ordinateur clair, Chromium ordinateur sombre, iPhone émulé, Android 360 px émulé, **Firefox**, **WebKit** (3 tests × 6 profils) |
| Mode "modèles sur stockage externe" (faux R2, autre origine) | **2 / 2** |
| Confidentialité | **0 requête externe**, aucune donnée d'image envoyée, sur tout le parcours |
| Sécurité | en-têtes vérifiés sur le build ; `npm audit` : **0 vulnérabilité** ; licences : **0 GPL/AGPL** |
| Lighthouse (mobile) | `/` 97–98 / 100 / 100 / 100 ; `/fr/` 98 / 100 / 100 / 100 ; pages de guides et légales 100 partout |

## Ce qui est testé

### Parcours complet (chaque profil)
1. Ajout d'images par les **4 voies** : image d'exemple, sélecteur de fichiers, glisser-déposer, collage.
2. Détourage de chaque image (file d'attente dans le Worker, une à la fois), bande de miniatures.
3. **Chaque outil** : fond photo libre, ombre portée, contour autocollant, contraste, format prédéfini
   (story 1080 × 1920), annuler.
4. **Chaque export**, relu par `sharp` : PNG 2000 × 1332 avec alpha, WebP 2000 × 1332, JPG 2000 × 1332 sans
   alpha, PNG 1080 × 1920 ; **ZIP** des 4 images (structure vérifiée).
5. Aucune requête vers un autre hôte que le site, aucun corps de requête volumineux, aucune erreur de page.

Tests plus détaillés de l'éditeur (`tests/e2e/editor.spec.ts`, Chromium) : exports et alpha au pixel près,
fond couleur/blanc/photo/flou, préférence de couleur mémorisée après rechargement, ombre et contour,
luminosité mesurée + annuler/rétablir (boutons et Ctrl+Z), recadrage sur le sujet, taille réduite, formats
boutique (fond blanc proposé), gomme/restauration appliquées à l'export, lot de 2 images avec réglages
séparés et ZIP, onglets au clavier, **axe : 0 violation sur chaque panneau**, mobile 360 px sans défilement
horizontal, animations réduites respectées.

### Robustesse (chaque profil)
| Fichier | Résultat attendu et obtenu |
|---|---|
| 0 octet | « This file is empty (0 bytes)… » |
| Texte nommé `.png` | « This file type isn't supported… » |
| PNG à en-tête valide, données corrompues | « Something went wrong reading this file… » |
| HEIC | « HEIC photos aren't supported yet… » |
| Bombe de décompression (en-tête 40 000 × 20 000 = 800 MP) | refusée **sans décodage** : « too large to process safely » |
| Image géante (12 000 × 9 000 = 108 MP) | acceptée, réduction annoncée (« reduced to … ») |
| PNG valide nommé `.jpg` (extension trompeuse) | accepté (détection par signature) |

Les dimensions sont lues dans l'en-tête du fichier (PNG, GIF, WebP, JPEG, AVIF) avant tout décodage
(`src/core/validate-image/header-dimensions.ts`, testé sur de vrais fichiers de chaque format).

### Sécurité
- Sur le build : `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`,
  CSP `default-src 'self'` sans `unsafe-inline`, `X-Content-Type-Options: nosniff` ; `dist/_headers`
  contient les mêmes règles (+ `frame-ancestors 'none'`).
- `npm audit --audit-level=high` : 0 vulnérabilité (`npm run check:audit`).
- `npm run check:licenses` : 93 paquets ; MIT 52, Apache-2.0 14, BSD-3-Clause 12, MPL-2.0 5, ISC 3,
  OFL-1.1 2, autres permissives ; **aucune GPL/AGPL**. 3 paquets LGPL (`libvips` via `sharp`) : utilisés
  seulement par les scripts Node (images de l'accueil, tests), **jamais envoyés au navigateur**.

## Benchmark (20 photos de `tests/images/`, modèle WASM ormbg)

| Banc | 1re image | p50 (à chaud) | p95 (à chaud) | Affinage des bords p50 / p95 |
|---|---|---|---|---|
| **Chromium headless**, WASM 4 threads, `crossOriginIsolated` | 6,6 s (chargement compris) | **3,7 s** | **7,9 s** | 0,50 s / 0,69 s |
| Node, onnxruntime-web wasm, 4 threads | — | 4,0 s | 4,3 s | — |

Données brutes : `docs/review/bench-chromium.json`, `docs/review/bench-node-wasm-4t.json`. Le p95 de
Chromium est plus haut que celui de Node à cause du CPU partagé du bac à sable (un pic isolé à 7,9 s).
Qualité (IoU moyen vs BiRefNet_lite 1024) : 0,684 — voir context.md > Décisions.

## Limites connues

- **WebGPU non testé sur une vraie carte graphique.** Sur Chrome (Mac) comme sur SwiftShader, l'adaptateur
  plafonne à 10 storage buffers par shader alors que BiRefNet_lite en demande 11 : le site passe alors
  directement en WASM (testé). Le chemin "WebGPU réussi" reste à mesurer sur du matériel où la limite est
  ≥ 11.
- **Qualité WASM (ormbg)** : excellente sur les personnes, plus faible sur les objets, le verre, les
  signatures et les scènes chargées.
- **Appareils réels** : iPhone et Android sont **émulés** (taille d'écran, tactile, agent utilisateur) dans
  Chromium ; WebKit desktop (Playwright) est testé, mais pas Safari sur un vrai iPhone (mémoire réelle).
- **Firefox** : un collage *synthétique* (test automatique) ne transporte pas de fichier — protection du
  navigateur ; un vrai Ctrl+V fonctionne. Le test ajoute alors l'image par le sélecteur et l'annote.
- **Pinceau** : utilisable à la souris et au doigt seulement (pas d'équivalent clavier pour dessiner).
- Photos d'exemple, de fond et de test : licence Pexels, récupérées via un miroir ; **lien d'origine de
  chaque photo à revérifier à la main** (SOURCES.md).

## Rejouer la recette

```bash
npm run build
```

```bash
npx playwright test
```

```bash
QA_ALL_BROWSERS=1 npx playwright test --project=qa-firefox --project=qa-webkit
```

```bash
npm run check:licenses && npm run check:audit
```

```bash
node scripts/bench/browser-bench.mjs
```
