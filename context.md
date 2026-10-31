# Cutova — context.md

## État actuel
Design system posé (tokens, polices, base CSS, styleguide de contrôle, test de contraste WCAG).
Écran d'accueil (direction C) implémenté en TypeScript vanilla, sans framework : UI complète
(en-tête, accroche, démo avant/après, carte d'envoi avec bouton/glisser-déposer/collage/exemples),
i18n EN/FR, validation de fichiers par signature binaire, accessibilité clavier + axe (0 violation).
Moteur IA branché (étape 4) : Web Worker d'inférence, un modèle par moteur (`src/core/model/models.json`) :
**WebGPU → BiRefNet_lite** (fp16/fp32), **WASM (CPU) → ormbg** (fp32, Apache-2.0, tient sous la limite
mémoire wasm32). Chargés via transformers.js (`AutoModel`/`AutoProcessor`), cache OPFS, WASM multithread
(crossOriginIsolated), en-têtes COOP/COEP/CSP en dev et preview, zéro requête externe (test réseau).
**Phase 1 faite** : un vrai masque est produit en Chromium headless (WASM) et vérifié par e2e
(`tests/e2e/wasm-inference.spec.ts` : masque ni vide ni plein, IoU vs référence ≥ 0,90 sur 3 vraies photos,
PNG transparents dans `tests/screenshots/`, copies compressées dans `docs/review/`).
**Phase 2 faite** : écran de résultat définitif — détourage pleine résolution (masque agrandi + bords
affinés par filtre guidé), curseur avant/après, fond transparent/blanc/couleur, export PNG/WebP/JPG à la
résolution d'origine, bouton "Nouvelle image". tsc, vitest (73), build et Playwright (16/16, y compris
`webgpu.spec.ts`) passent.
**Phase 3 faite** : SEO V1 EN + /fr/ — générateur statique (`seo/`), 10 pages (2 accueils + alternative
remove.bg + 3 tutoriels, en EN et FR), hreflang réciproques, sitemap.xml, robots.txt (robots d'IA
autorisés), llms.txt, JSON-LD (WebSite, WebApplication, FAQPage, BreadcrumbList, HowTo), FAQ visibles.
Lighthouse : 99–100 partout (voir Mesures). Playwright 29/29.
**Phase 4 faite** : prêt à déployer sur Cloudflare Pages + R2 — `_headers` généré (COOP/COEP/CSP,
cache), modèles et binaires `.wasm` sur un stockage externe configurable (`VITE_MODEL_BASE_URL`),
vérifié de bout en bout par `npm run test:e2e:remote` (faux R2 sur une autre origine). `DEPLOY.md` =
liste ordonnée de ce que l'utilisateur doit faire (domaine, R2, Pages, vérifications, Search Console).

## Modules
- `src/core/model/` — `models.json` (**source unique** des modèles : dépôt, révision figée, SHA-256,
  licence, et `engines` = quel modèle pour quel moteur ; lu par le navigateur ET par Node),
  `model-source.ts` (vue navigateur : `getModelForEngine`),
  `opfs-cache.ts` (cache personnalisé transformers.js backé par OPFS ; `null`/no-op si OPFS
  indisponible, jamais de plantage).
- `src/core/inference/` — `worker.ts` (Web Worker : config `env` transformers.js, choix WebGPU/WASM,
  prétraitement → `AutoProcessor`, inférence → `AutoModel`, post-traitement sigmoid→uint8, file
  d'attente d'une inférence à la fois), `engine-selection.ts` (logique pure de choix de moteur + repli,
  testée unitairement sans navigateur), `webgpu-support.ts` (détection adaptateur + `shader-f16`,
  mise en cache du résultat), `engine-client.ts` (façade thread principal : préchargement idempotent,
  file d'attente, événements de progression), `protocol.ts` (messages typés worker ↔ page).
- `src/core/limits/device-limits.ts` — limite de pixels décodés adaptée à l'appareil (remplace
  l'ancienne limite fixe de 8000 px/côté) + réduction proportionnelle (`fitWithinPixelBudget`).
- `src/ui/result/` — `render-result.ts` (écran de résultat : décode l'image complète, lance l'inférence,
  construit le détourage pleine résolution, aperçu ≤ 1600 px, fonds, exports, "Nouvelle image" ; s'abonne
  lui-même à `image:selected`, attributs `data-*` pour les tests), `compare-slider.ts` (curseur avant/après
  générique, clavier + pointeur), `result.css`.
- `scripts/model-manifest.mjs` / `scripts/fetch-model.mjs` — téléchargement des poids + config de tous
  les modèles utilisés par un moteur dans `public/models/<repoId>/` (gitignoré), vérification SHA-256,
  révision HF figée (`--model=`, `--only=`, `MODEL_BASE_URL`).
- `scripts/reference-masks.mjs` — masques de référence BiRefNet_lite 1024 (onnxruntime-node) sur
  `tests/images/*.jpg` → `tests/reference/`. `scripts/bench/compare-candidates.mjs` — banc d'un modèle en
  onnxruntime-web **wasm dans Node** (même plafond 4 Go que le navigateur) : IoU/MAE vs référence, temps,
  pic mémoire, `--threads`, `--only`.
- `tests/images/` — 20 vraies photos Pexels ≤ 2000 px (sources/licences : `tests/images/SOURCES.md`).
- `docs/review/` — captures et mesures importantes, compressées et versionnées.
- `security-headers.mjs` — en-têtes de sécurité (source unique, voir Sécurité).
- `src/core/model/remote.ts` — mode stockage externe (`VITE_MODEL_BASE_URL`) : disposition
  `<base>/<repoId>/resolve/<révision>/<fichier>` (comme Hugging Face) et
  `<base>/onnxruntime-web/<version>/*.wasm`.
- `scripts/postbuild.mjs` — `_headers`, retrait de `dist/models/` et des `.wasm` bundlés en mode externe,
  contrôle de la limite 25 Mio/fichier de Cloudflare Pages (échec si `CF_PAGES=1` ou `STRICT_DEPLOY=1`).
- `scripts/model-mirror.mjs` — `r2-commands` (affiche les commandes `wrangler r2 object put`) et
  `serve` (faux R2 local avec CORS, pour `playwright.remote.config.ts` / `tests/e2e-remote/`).
- `deploy/r2-cors.json` — modèle de règle CORS du bucket R2. `DEPLOY.md` — étapes de déploiement.
- `src/core/postprocess/` — `guided-filter.ts` (filtre guidé O(N), pur, testé), `cutout.ts`
  (`buildCutout` : masque du modèle → résolution de travail ≤ 2048 px → affinage guidé → masque dans le
  canal alpha d'un canvas ; `composeCutout` : image + masque agrandi en `destination-in`, à la taille de
  l'aperçu ou de l'export ; jamais de tableau Float32 pleine résolution), `brush.ts` (gomme/restauration :
  coordonnées écran → masque, traits de pinceau, historique d'annulation par instantanés ImageBitmap),
  `crop.ts` (boîte englobante du sujet dans le masque, marge, passage masque → image, taille de sortie).
- `src/core/export/export.ts` — formats PNG/WebP/JPG, nom de fichier sûr (`<nom>-cutova.<ext>`), fond
  (transparent / blanc / couleur validée `#rrggbb`), JPG transparent → blanc, encodage OffscreenCanvas.
  Export ZIP par lot : pas encore (P1).
- `src/ui/home/` — écran d'accueil (direction C) : `render-home.ts` (composition + rebuild au
  changement de langue), `header.ts`, `hero.ts`, `before-after-demo.ts` (curseur avant/après
  accessible), `upload-card.ts` (bouton, glisser-déposer page entière, collage, 4 exemples,
  zone d'erreur `role="alert"`), `visuals.ts` (icônes/illustrations SVG maison), `events.ts`
  (événement `image:selected`), `home.css`.
- `src/core/validate-image/` — validation de fichier par signature binaire (PNG/JPEG/WebP/AVIF/GIF,
  HEIC signalé non pris en charge), taille max, dimensions max. Module testé (`tests/unit/validate-image.test.ts`).
- `src/i18n/` — dictionnaire typé (`types.ts`), locales `en` (par défaut, complet) et `fr` (complet) ;
  `pt-br`/`es`/`id` retombent sur `en` tant qu'ils n'ont pas de traduction (`index.ts` > `getDictionary`).
- `src/styles/` — design system : `fonts.css` (polices auto-hébergées, sous-ensembles latin/latin-ext),
  `tokens.css` (variables CSS clair/sombre), `base.css` (reset, typographie, focus, `.sr-only`,
  `.checkerboard`, boutons `.btn-primary`/`.btn-secondary`).
- `seo/` — `render.mjs` (gabarit unique + JSON-LD + sitemap/robots/llms, fonctions pures testées dans
  `tests/unit/seo-render.test.ts`), `build.mjs` (tourne après `vite build` : pages article/tutoriel,
  accueils `/` et `/fr/` enrichis, `sitemap.xml`, `robots.txt`, `llms.txt` dans `dist/` ; URL absolue =
  variable `SITE_URL`). `src/seo/seo-page.ts` + `seo.css` = entrée Vite des styles des pages statiques.
- `content/` — `site.json` (textes communs par langue), `home.json`, et un JSON par page (une page = une
  intention de recherche) avec ses versions `en` et `fr` (chemin, title, description, h1, sections,
  étapes, FAQ). Ajouter une page = ajouter un JSON ici.
- `public/` — favicon (robots.txt/llms.txt/sitemap sont désormais générés dans `dist/`).
- `server/` — back-end phase 2 (FastAPI + onnxruntime + SQLite), non démarré.
- `tests/unit/`, `tests/e2e/`, `tests/images/` — tests unitaires, end-to-end, images de référence.
- `scripts/bench/` — scripts de benchmark de performance d'inférence.

## Modèle & licences
- Modèle par défaut : BiRefNet_lite-ONNX (`onnx-community/BiRefNet_lite-ONNX`) — licence MIT. Deux
  fichiers servis : `onnx/model_fp16.onnx` (WebGPU avec `shader-f16`, 114,5 Mo) et `onnx/model.onnx`
  (fp32 — WebGPU sans `shader-f16`, et WASM, 224 Mo). Entrée 1024×1024, normalisation ImageNet
  (`preprocessor_config.json`). Téléchargés par `scripts/fetch-model.mjs` dans `public/models/`
  (gitignoré), vérifiés par SHA-256, revision HF figée. `MODEL_BASE_URL` configurable (env var) pour
  pointer vers un stockage dédié en prod — **les hébergeurs statiques gratuits limitent souvent la
  taille de fichier servie** (ex. Cloudflare Pages : 25 Mo/fichier sur le plan gratuit, GitHub Pages :
  limite souple ~100 Mo/fichier) : nos deux fichiers (114,5 Mo et 224 Mo) dépassent ces plafonds
  courants et devront être servis depuis un stockage dédié (S3/R2 + CDN, ou un hébergeur dont le
  plafond par fichier est assez haut) plutôt que depuis le même hébergeur statique que le reste du site.
- **Modèle WASM (CPU) : ormbg** (`onnx-community/ormbg-ONNX`, révision `034e2d88`, `onnx/model.onnx`
  fp32, 176 116 019 octets) — licence **Apache-2.0** (fiche + fiche d'origine `schirrmacher/ormbg`).
  Entrée 1024×1024, pas de normalisation (rescale seul), sortie déjà en probabilité [0,1]. Alternative
  prête dans `models.json` : IS-Net (`BritishWerewolf/IS-Net`, Apache-2.0), non utilisée.
- Option portraits : MODNet (poids ONNX, ex. `Xenova/modnet`) — licence Apache-2.0 (non intégré).
- INTERDITS : BRIA RMBG-1.4 / RMBG-2.0 (licence non commerciale), `@imgly/background-removal`
  (dépendance à écarter), et tout poids de modèle sans licence écrite noir sur blanc.
- Détail complet des vérifications : voir `LICENSES.md`.

## Sécurité
- **Source unique des en-têtes : `security-headers.mjs`** (racine), utilisée par `vite.config.ts`
  (dev/preview) ET par `scripts/postbuild.mjs`, qui écrit `dist/_headers` (Cloudflare Pages : en-têtes
  sur `/*`, `Cache-Control` long sur `/assets/*`, `no-store, no-transform` sur `/models/*`). En plus de
  COOP/COEP/CSP : `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra,
  micro, géolocalisation… refusés). CSP ajoutée : `font-src 'self'`, `form-action 'none'`. Avec un
  stockage externe des modèles, son origine est ajoutée **uniquement à `connect-src`**.
- (Historique) En dev (`vite`) et preview (`vite preview`) : plugin `vite.config.ts` > `securityHeadersPlugin`
  ajoute sur **toutes** les réponses `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`, et une CSP stricte :
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self';
  img-src 'self' blob: data:; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
  Vérifié par `curl -I` sur le document principal et sur un asset `.wasm` (`application/wasm`, mêmes
  en-têtes). En production (hébergement statique réel), ces en-têtes doivent être configurés côté
  serveur/CDN — ce plugin ne couvre que dev/preview.
- `crossOriginIsolated` vérifié dans le worker (`self.crossOriginIsolated`) : si `false`, le WASM
  retombe sur 1 thread au lieu du multithread (log d'avertissement, jamais de plantage).
- Zéro requête externe : binaires onnxruntime-web importés via le pipeline d'assets natif de Vite
  (`onnxruntime-web/ort-wasm-simd-threaded*.wasm?url`, same-origin, hashés en prod) — aucun CDN
  jsDelivr. `env.allowRemoteModels = false` + `env.allowLocalModels = true` empêchent tout repli vers
  le Hugging Face Hub : le modèle est servi uniquement depuis `public/models/` par nous.
- Test automatisé (`tests/e2e/inference.spec.ts`) : collecte toute requête (page + worker) pendant tout
  le parcours (chargement modèle + inférence) ; échoue si un hôte ≠ `localhost`/`127.0.0.1` est contacté,
  ou si une requête a un corps volumineux (signe qu'une image aurait pu être envoyée). Passe (0 violation),
  y compris sur le chemin d'échec d'inférence.

## Pages
- Accueil (`/`) : UI faite (direction C), moteur IA branché (étape 4). La carte d'envoi émet `window`
  `CustomEvent("image:selected", { detail: { file: File, source, resizeTo? } })` ; `src/ui/result/render-result.ts`
  s'y abonne et affiche l'écran de résultat (phase 2). Captures : `docs/review/phase2-result-*.webp`.

## Pages SEO
- Structure : EN à la racine, puis `/pt-br/`, `/es/`, `/id/`, `/fr/` avec balises hreflang croisées.
- V1 (statut : **faite**, EN + FR) :
  - Accueil : `/` et `/fr/`
  - `/remove-bg-alternative/` ↔ `/fr/alternative-remove-bg/`
  - `/how-to/remove-background-from-photo/` ↔ `/fr/tutoriels/supprimer-arriere-plan-photo/`
  - `/how-to/make-transparent-png/` ↔ `/fr/tutoriels/creer-png-transparent/`
  - `/how-to/change-photo-background-color/` ↔ `/fr/tutoriels/changer-couleur-fond-photo/`
- À faire : pt-br / es / id ; pages `/for/{segment}`.
- Pages SEO `/for/{segment}` prévues (textes 100 % originaux) : individuals, photographers,
  marketing, developers, ecommerce, media, car-dealerships, enterprise.

## Tables SQLite
(vide — phase 2)

## Endpoints
(vide — phase 2)

## Parité remove.bg vs nous

| Fonction | remove.bg | Cutova | Statut | Priorité |
|---|---|---|---|---|
| Détourage auto (personnes) | ✅ | WebGPU BiRefNet_lite ; WASM ormbg (IoU 0,98–1,00) | fait | P0 |
| Détourage auto (produits) | ✅ | WebGPU BiRefNet_lite ; WASM ormbg faible (IoU 0,52–0,95) | partiel (WASM) | P0 |
| Détourage auto (animaux) | ✅ | WebGPU BiRefNet_lite ; WASM ormbg variable | partiel (WASM) | P0 |
| Détourage auto (voitures) | ✅ | — | à faire | P1 |
| Détourage auto (logos) | ✅ | — | à faire | P1 |
| Fond couleur | ✅ | blanc ou couleur au choix (aperçu + export) | fait (phase 2) | P0 |
| Fond image | ✅ | — | à faire | P1 |
| Fond flou | ✅ | — | à faire | P1 |
| Pinceau magique (effacer/restaurer) = notre gomme / restauration | ✅ | gomme + restauration au pinceau, taille réglable, annuler, réinitialiser ; appliqué à l'export pleine résolution | fait | P0 |
| Recadrage / redimensionnement | ✅ | recadrage sur le sujet (+ marge) et largeur de sortie (rapport conservé, sans agrandissement) | fait | P0 |
| Formats réseaux sociaux | ✅ | — | à faire | P1 |
| Formats marketplaces (Amazon, eBay, Etsy, Vinted, Shopify) | ✅ | — | à faire | P1 |
| Lot + export ZIP | ✅ | — | à faire | P1 |
| Téléchargement HD | ✅ | PNG/WebP/JPG à la résolution d'origine, gratuit | fait (phase 2) | P0 |
| Limites fichier/résolution | 22 Mo/fichier, 50 MP max en sortie, aperçu gratuit 0,25 MP | 50 Mo/fichier, pleine résolution gratuite, objectif ≥ 50 MP sur ordinateur (limite iOS : 16,7 MP) | à faire | P0 |
| Coller une image par URL | ✅ | — | à faire | P1 (ouvre `connect-src`/`img-src` — à décider) |
| Applis ordinateur + Android | ✅ | couvertes par la PWA | à faire | P1 |
| Extension Photoshop | ✅ | — | plus tard | P2 |
| Modèles de design | ✅ | — | plus tard | P2 |
| Vidéo | ✅ | — | plus tard | P2 |
| Noter le résultat / donner l'image à l'IA | ✅ | — | **NON** (contraire à "zéro upload") | — |
| API (phase 2) | ✅ | — | à faire | P2 |
| Pleine résolution gratuite sans compte | ❌ | oui (budget de pixels selon l'appareil) | fait (phase 2) | P0 |
| Zéro upload (100 % navigateur) | ❌ | oui, vérifié par test réseau | fait | P0 |
| Ombre portée | ❌ | — | à faire | P2 |
| Contour / sticker | ❌ | — | à faire | P2 |
| Recadrage auto avec marge | ❌ | "Recadrer sur le sujet" + marge 0–30 % | fait (avec le P0 recadrage) | P1 |
| Annuler / rétablir | ❌ | — | à faire | P1 |
| Curseur avant/après | ❌ | sur l'écran de résultat (clavier + pointeur) | fait (phase 2) | P1 |
| Collage presse-papiers | ❌ | Ctrl+V sur l'accueil | fait (étape 3) | P1 |
| Glisser-déposer | ❌ | page entière | fait (étape 3) | P1 |
| PWA hors ligne | ❌ | — | à faire | P2 |
| Extension Chrome | ❌ | — | à faire | P2 |

## Mesures
- **Lighthouse 12.8.2** (mobile, Chromium headless, `vite preview` local, 2026-10-31 ;
  `docs/review/lighthouse-phase3.json`) — Performance / Accessibilité / Bonnes pratiques / SEO :
  `/` 99/100/100/100 (LCP 1,7 s, CLS 0, TBT 0 ; 83 en performance au tout premier passage à froid) ;
  `/fr/` 99/100/100/100 ; `/remove-bg-alternative/` 100/100/100/100 ;
  `/how-to/make-transparent-png/` 100/100/100/100. À refaire sur le vrai domaine après déploiement.
- Search Console / Bing sur "remove bg", "background remover", "bg remove", "remove background" : vide.
- **Benchmark d'inférence p50/p95 WebGPU vs WASM : toujours vide — à refaire avec les 20 images de
  test sur un appareil réel.** Ce qui suit est une mesure rapide (étape 4, une seule machine, un seul
  run), pas le vrai benchmark.

### Moteur IA — mesures et constats (étape 4, machine de dev : Mac, 16 Go RAM, 16 cœurs)
- **Chargement/compilation du modèle (WASM, fp32, `model.onnx`, 213,6 Mo)** : ~30–40 s entre la fin du
  téléchargement (barre à 100 %) et le début de l'inférence — c'est `InferenceSession.create()` qui
  parse/valide le graphe ONNX et alloue les tenseurs de poids en mémoire linéaire WASM, pas un temps
  réseau (le fichier est servi en local). Rechargement (cache OPFS) : le téléchargement est évité
  (0 requête `.onnx`, vérifié par test Playwright) mais la compilation de session reste à refaire
  (OPFS cache les octets du modèle, pas la session ONNX Runtime compilée).
- **Temps d'inférence (première et suivantes) : non mesurable dans cet environnement.** Sur WASM
  (fp32 et fp16 testés), `OrtRun()` échoue systématiquement avec `std::bad_alloc` (ERROR_CODE 6) avant
  la fin du calcul — confirmé indépendant de : nombre de threads (1 vs multithread), `enableCpuMemArena`/
  `enableMemPattern` (désactivés), variante wasm (`asyncify` vs sans suffixe), dtype des poids (fp32 vs
  fp16). Le modèle (BiRefNet_lite, dos Swin, entrée 1024×1024) dépasse la mémoire linéaire WASM32
  disponible dans ce bac à sable — ce n'est pas un bug de l'intégration (le code détecte l'échec et
  l'affiche clairement à l'utilisateur, jamais de plantage silencieux ni de blocage), mais une vraie
  limite à vérifier sur du matériel réel avant de considérer WASM comme un repli fiable pour ce modèle.
- **WebGPU testé avec `--enable-unsafe-webgpu --use-angle=swiftshader --use-gl=swiftshader`** (WebGPU
  logiciel, Dawn + SwiftShader — sans ces drapeaux, `navigator.gpu` est absent du Chromium headless de
  Playwright). Résultat très utile : la détection d'adaptateur, le choix fp32 (pas de `shader-f16` en
  logiciel), **et le repli automatique webgpu → wasm en cas d'échec de la première inférence** se sont
  déclenchés correctement en conditions réelles (pas seulement en test unitaire). L'échec observé est
  un `ShaderHelper` error : *"Too many storage buffers in shader. Current: 11, Max is 10"* —
  limite `maxStorageBuffersPerShaderStage` du backend logiciel SwiftShader, probablement plus haute
  sur un vrai GPU. **À retester sur du matériel GPU réel avant de tirer une conclusion sur WebGPU.**
- **[Dépassé, voir "Mémoire WASM" ci-dessous]** Le chemin WASM produit désormais un vrai masque (modèle ormbg).
- Conclusion provisoire : l'infrastructure (sélection de moteur, repli, cache OPFS, téléchargement,
  isolation réseau, affichage d'erreur) fonctionne et est testée ; mais ni WASM ni WebGPU n'ont pu
  produire un masque de bout en bout dans ce bac à sable précis (mémoire WASM insuffisante d'un côté,
  pas de GPU réel de l'autre). Priorité pour la suite : valider sur un appareil avec vrai GPU.

### Mémoire WASM — mesures (bac à sable Linux, 4 cœurs, 15 Go RAM, sans GPU, 2026-10-31)
- **Pourquoi BiRefNet_lite ne passe pas en WASM** : pic mémoire natif (onnxruntime-node, VmHWM) **7,0 Go**
  avec arena désactivée sur les 20 photos (12,2 Go avec réglages par défaut) > plafond wasm32 4 Go
  (65 536 pages). Reproduit hors navigateur (onnxruntime-web wasm dans Node → `std::bad_alloc`).
- **Référence BiRefNet_lite 1024 native** (`tests/reference/reference.json`) : création de session 4,3 s ;
  inférence médiane 33,7 s (24–43 s) sur ce CPU partagé.
- **Banc WASM 20 photos** (onnxruntime-web wasm dans Node, 1 thread ; brut :
  `docs/review/bench-wasm-20-photos.jsonl`) :

  | Modèle | IoU moyen | IoU min | MAE moy. | Inférence médiane 1 thread | Pic mémoire (processus) |
  |---|---|---|---|---|---|
  | **ormbg** (retenu) | **0,684** | 0,081 | 0,114 | 13,5 s | 1,19 Go |
  | IS-Net | 0,665 | 0,022 | 0,114 | 13,7 s | 1,52 Go |
  | MODNet (4 portraits seulement) | 0,983 | 0,974 | 0,010 | 1,5 s (entrée 512) | 0,41 Go |

  Par catégorie (ormbg) : portraits/cheveux 0,98–1,00 ; animaux 0,08–1,00 (très variable) ; produits
  0,52–0,95 ; verre 0,41–0,74 ; voitures 0,59–0,71 ; logo néon 0,80 ; signatures 0,08–0,62 ; foule 0,53.
- **Gain du multithread** (ormbg, 4 photos portraits, Node) : 1 thread ≈ 13,2 s → 4 threads ≈ 4,1 s
  (**×3,2**). Le navigateur utilise `min(hardwareConcurrency, 4)` threads si `crossOriginIsolated`.
- **Mesures Chromium headless (WASM, ormbg, 4 threads, `crossOriginIsolated` = true, run isolé ;
  `docs/review/wasm-measures-chromium.json`)** :
  - chargement du modèle (téléchargement local 168 Mo + création de session), estimé = clic→résultat −
    inférence du 1er passage : **≈ 17 s** ;
  - **1re inférence : 10,1 s** (préchauffage inclus) ; clic → résultat 27,4 s ;
  - **inférences suivantes : 3,7 s et 4,3 s** ;
  - IoU navigateur vs référence identiques au banc Node (0,985 / 0,998 / 0,953) → le prétraitement
    transformers.js du navigateur et celui du banc concordent ;
  - pic mémoire : non mesurable proprement dans Chromium headless ici (pas d'API fiable) ; en Node, le
    même binaire wasm culmine à ~1,2 Go de mémoire processus.
  - En lançant toute la suite Playwright en parallèle (2 workers), les inférences montent à 6,7–7,3 s
    (CPU partagé) : chiffres ci-dessus = run isolé.
- Test réseau zéro-requête externe : passe toujours (`tests/e2e/inference.spec.ts`).

## Décisions
- Nom de marque retenu : **Cutova**.
- Direction visuelle retenue : **direction C**. Écran d'accueil = accroche + démonstration
  avant/après à gauche, grande carte d'envoi de fichier à droite ; sur mobile, la carte d'envoi
  passe en premier (au-dessus de l'accroche).
- Palette : fond #FAFAF7 / surface #FFFFFF / texte #14161A / texte secondaire #5C6068 /
  accent #5B4BFF (survol #4A3DE0, texte sur accent #FFFFFF) / succès #0F6E56 / erreur #B3261E /
  bordure #8E8A82 en mode clair. En mode sombre, fond #111214 / surface #1A1B1E / texte #F2F2F0 /
  texte secondaire #9A9C9F / bordure #6B6D73.
- Polices : Bricolage Grotesque (titres, 500) + Inter (texte, 400/500), auto-hébergées via
  `@fontsource-variable`, sous-ensembles latin + latin-ext copiés à la main dans
  `src/styles/fonts.css` (plutôt que d'importer les CSS complets des paquets, qui incluent
  cyrillique/grec/vietnamien/math et gonfleraient le build) — zéro requête vers Google.
- Contraste WCAG 2.2 AA (`tests/unit/contrast.test.ts`) : deux couleurs ont dû être ajustées en
  mode sombre pour atteindre 4.5:1 en tant que texte — succès #0F6E56 → **#2FBE9A** (ratio 2.78–3.02
  → 7.34–7.99) et erreur #B3261E → **#FF6B5E** (ratio 2.63–2.87 → 6.16–6.71). L'accent a aussi été
  éclairci en mode sombre (#5B4BFF → **#8A7DFF**) pour rester utilisable comme texte/lien (ratio
  3.19–3.48 → 5.30–5.76), pas seulement comme remplissage de bouton.
- Revue visuelle post-implémentation : échelle de titres fluide recalée (h1 32px à h2 18px sur 360px,
  desktop inchangé), interlignes 1.1–1.15, marges de rythme vertical ajoutées, damier sombre éclairci
  (#1A1B1E/#2A2C31), token `--color-border` scindé en `--color-border-strong` (≥3:1, testé) et
  `--color-border-subtle` (décoratif).
- Validation de fichiers (`src/core/validate-image/`) : taille max **50 Mo** (imposée). Le type est
  détecté uniquement par signature binaire (jamais par le nom/extension) ; HEIC est reconnu et signalé
  "non pris en charge" plutôt que rejeté comme format inconnu. Si le navigateur ne parvient pas à
  décoder un fichier dont la signature est pourtant valide (fichier corrompu), l'erreur est remontée
  comme message générique plutôt que de planter silencieusement.
- **(Étape 4) Limite de dimensions remplacée** : l'ancienne limite fixe de 8000 px/côté est remplacée
  par `src/core/limits/device-limits.ts` > `getMaxDecodedPixels()`, un budget en **nombre total de
  pixels**, adapté à l'appareil : **16 777 216 px (4096×4096)** sur iOS/iPadOS Safari (limite de canvas
  documentée de ce navigateur ; iPadOS 13+ se présente comme "Macintosh" mais est détecté via
  `navigator.maxTouchPoints > 1`), **50 000 000 px (50 MP)** ailleurs (cohérent avec la décision "≥ 50 MP
  si la mémoire le permet" ci-dessous). Au-delà du budget mais sous un plafond absolu de sécurité
  (500 MP, anti bombe de décompression) : `validateImage` **n'échoue plus** — elle renvoie
  `{ ok: true, resizeTo }` et l'UI affiche un message non bloquant ("image réduite à W×H"). Au-delà du
  plafond absolu : rejet (`dimensions-too-large`), seul cas restant où ce code d'erreur est utilisé.
  Pour l'aperçu provisoire (étape 4), la décodage réel se fait directement à 1024×1024 via
  `createImageBitmap(file, { resizeWidth, resizeHeight })`, qui ne matérialise jamais un bitmap pleine
  résolution — le budget de pixels ci-dessus ne protège donc, pour l'instant, que l'information affichée
  à l'utilisateur ; il deviendra réellement contraignant à l'étape 5 (export pleine résolution, qui devra
  décoder l'image à sa taille réelle).
- Images d'exemple et illustration avant/après : silhouettes simples en SVG/canvas maison
  (personne, basket, chat, voiture pour les 4 exemples ; silhouette avec mèches de cheveux pour la
  démo avant/après) — **à remplacer par de vraies photos libres de droits** dès qu'une source est
  validée.
- Revue visuelle de l'accueil (2e passe) : colonnes desktop alignées en haut (`align-items: start`),
  colonne gauche élargie (1.15fr/0.85fr) et clamp du h1 plafonné à 2.75rem pour tenir sur 2 lignes à
  1280px ; en-tête avec sélecteur de langue compact (icône globe + code à 2 lettres, `<select>`
  natif conservé) et bouton "Tools" avec chevron ; carte d'envoi = une seule bordure pointillée
  (toute la carte est la zone de dépôt) avec icône d'envoi au-dessus du bouton ; démo avant/après
  avec poignée ronde glissable au pointeur (souris/tactile) directement sur l'image, `<input
  type="range">` conservé en superposition invisible pour le clavier, badges Avant/Après dans les
  coins, `accent-color` + couleurs d'accent partout (plus de bleu navigateur).
- i18n : dictionnaire typé, aucune phrase codée en dur dans l'UI. `en` et `fr` complets ; `pt-br`,
  `es`, `id` scaffoldés dans le type `Locale` mais retombent sur `en` (traductions à faire).
- remove.bg ferme le 01/12/2026 à 09:00 CET.
- Limite pixels ordinateur ≥ 50 MP si la mémoire le permet.
- **(Étape 4) Fichiers du modèle retenus** : le dépôt `onnx-community/BiRefNet_lite-ONNX` ne contient
  que deux variantes (`onnx/model.onnx` fp32, 224 005 088 octets ; `onnx/model_fp16.onnx`, 114 538 221
  octets) — pas de variante quantifiée (`_quantized`/`_q4`...). `AutoModel.from_pretrained` avec
  `dtype: 'auto'` choisirait `q8` sur device `wasm` (`DEFAULT_DEVICE_DTYPE_MAPPING`), un fichier
  inexistant ici → on fixe donc explicitement `dtype` nous-mêmes selon le device plutôt que de laisser
  `'auto'` (voir `src/core/inference/engine-selection.ts`) : `fp16` sur WebGPU si `shader-f16`, sinon
  `fp32` (WebGPU sans `shader-f16`, et toujours sur WASM — le CPU n'accélère pas le fp16). Révision HF
  figée (`de15b22b...`) plutôt que `main`, pour que la vérification SHA-256 de
  `scripts/fetch-model.mjs` ait un sens stable. Modèle téléchargé localement (gitignoré) pour les tests
  de cette étape : fp32 complet, fp16 complet (les deux vérifiés par SHA-256).
- **(Étape 4) `env.useWasmCache = false`** : transformers.js propose par défaut un chargement "en
  cache" du binaire WASM lui-même (distinct de notre cache OPFS du modèle), qui fait transiter le
  `.mjs` par un `Blob` avant de l'importer dynamiquement. Ce chemin suppose `apis.IS_CHROME_AVAILABLE`
  (présence de `window.chrome`), absent du Chromium "pur" de Playwright → l'import du `Blob` y échouait
  avec `"no available backend found"`. Désactivé ; onnxruntime-web charge alors le WASM nativement
  depuis nos URLs bundlées (déjà même-origine, déjà cache HTTP). Non revérifié sur un vrai Chrome, mais
  sans risque fonctionnel puisque c'était une optimisation facultative.
- **(Étape 4) Choix de la variante wasm `asyncify` vs sans suffixe** : `.asyncify` instrumente tout le
  module pour permettre de suspendre/reprendre l'exécution (nécessaire à l'EP `webgpu`) mais alourdit la
  mémoire ; on ne la charge donc que si `navigator.gpu` existe dans ce navigateur (sinon la variante sans
  suffixe, plus légère, suffit pour l'EP `wasm` seul — généralisation de l'heuristique "Safari < 26 sans
  WebGPU" que transformers.js utilise par défaut). N'a pas suffi à éviter le `std::bad_alloc` observé
  (voir Mesures) mais reste le bon choix par défaut indépendamment de ce problème.
- **(Étape 4) Binaires onnxruntime-web non commités** : importés dans `worker.ts` via le suffixe `?url`
  de Vite (`onnxruntime-web/ort-wasm-simd-threaded*.wasm?url`), qui les fait passer par le pipeline
  d'assets natif (même-origine, hash de contenu en prod) sans middleware ni copie manuelle. Seules les
  variantes `asyncify` et sans suffixe sont importées (celles que transformers.js v4 sélectionne
  réellement) ; `.jsep`/`.jspi` ne sont jamais référencées, donc jamais bundlées (~43 Mo évités).
- **(Étape 4) `onnxruntime-web` ajouté comme dépendance directe** (figée, sans `^`) : `worker.ts`
  importe ses fichiers par chemin exact, ce n'est plus un simple détail d'implémentation de
  `@huggingface/transformers`. Version `1.31.0-dev...` : versions `-dev`, à surveiller (voir LICENSES.md).

- **(Mémoire WASM) Décision : WASM → ormbg ; WebGPU garde BiRefNet_lite.** Options évaluées :
  a. wasm64 — écartée (aucun build wasm64 dans `onnxruntime-web@1.31.0-dev.20260914`) ;
  b. résolution réduite — écartée (entrée du modèle statique `[1,3,1024,1024]`) ;
  c. modèle plus léger — règle fixée : **meilleur IoU moyen sur 20 vraies photos, à condition de tenir
  sous 4 Go** → ormbg (0,684) devant IS-Net (0,665) ; MODNet hors course (portraits seulement, 0,983 sur
  les 4 portraits). Voir le tableau dans Mesures.
  **Limite connue, à garder en tête** : ormbg est excellent sur les personnes (0,98–1,00) mais faible sur
  les objets, verres, signatures et scènes chargées (IoU parfois < 0,1). Sur un appareil sans WebGPU, la
  qualité sera donc nettement inférieure à BiRefNet pour ces catégories. Pistes futures : modèle WASM
  dédié par catégorie, ou BiRefNet à résolution réduite si un export ONNX à entrée dynamique avec licence
  claire existe.
- **(Mémoire WASM) Un seul endroit à changer** : `src/core/model/models.json` > `engines.wasm`
  (ou `engines.webgpu`). `fetch-model.mjs` télécharge automatiquement les modèles référencés ; le worker
  détecte seul le nom d'entrée/sortie et si la sortie est en logits (sigmoid) ou déjà en [0,1].
- **(Mémoire WASM) Mobile sans WebGPU (iOS Safari < 26 : pas de Memory64, peu de mémoire)** : c'est le
  chemin ormbg (pic ~1,2 Go en wasm32) — à valider sur un vrai iPhone ; MODNet (0,41 Go, 25 Mo) reste un
  repli possible pour les portraits si la mémoire ne suffit pas.
- **(Mémoire WASM) Photos de test** : Unsplash, Pexels et Wikimedia sont bloqués dans ce bac à sable ;
  20 photos **Pexels** récupérées via le miroir HF `ujin-song/pexels-image-60k` qui conserve l'identifiant
  Pexels de chaque photo (licence Pexels ; liens d'origine dans `tests/images/SOURCES.md`, à revérifier à
  la main).
- **(Mémoire WASM) `/models/` servi en `Cache-Control: no-store, no-transform`** (dev/preview :
  `vite.config.ts`) : le modèle est déjà persisté dans OPFS ; le cache HTTP en gardait une 2e copie et
  Chromium échouait (`ERR_CACHE_WRITE_FAILURE`) car transformers.js lit le fichier deux fois en parallèle
  (un GET "existe-t-il ?" dont le corps n'est jamais lu, puis le vrai GET). Le serveur `vite preview`
  compresse quand même en gzip (pas de `Content-Length` → pas de pourcentage de progression en local) :
  sans effet en production (à régler dans `_headers`, phase 4).
- **(Mémoire WASM) Playwright** : `cdn.playwright.dev` est bloqué ici (impossible d'installer le Chromium
  de la version 1.64.1). Variable optionnelle `PLAYWRIGHT_CHROMIUM_PATH` (config + `webgpu.spec.ts`) :
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` fait tourner les 12 tests ici ;
  sans la variable, comportement standard.
- **(Mémoire WASM) Panneau de résultat** : attributs `data-state`/`data-run`/`data-engine`/`data-elapsed-ms`
  (sans effet visuel) pour que les tests lisent le bon résultat (un test lisait l'état "done" du passage
  précédent).

- **(Phase 2) Affinage des bords = filtre guidé** (He et al.) plutôt qu'un simple flou/seuil : garde les
  mèches de cheveux et les poils, recolle le masque basse résolution aux vrais contours. Calculé à une
  résolution de travail ≤ 2048 px (rayon 2–8 px, ε = 1e-3), puis agrandi par le canvas : coût mémoire
  borné (~4 MP × quelques Float32) même pour une photo de 50 MP. Mesuré : +0,6 s sur une photo 2000×1332
  (Chromium headless, CPU).
- **(Phase 2) Aperçu ≤ 1600 px, export à la résolution d'origine** (ou réduite au budget de pixels de
  l'appareil, transmise via `image:selected` > `resizeTo`). JPG + fond transparent → fond blanc (avec une
  note visible). Qualité WebP/JPG 0,92. Nom de fichier `<nom d'origine>-cutova.<ext>`.
- **(Phase 2) Bug corrigé** : `.result-panel { display: flex }` annulait l'attribut `hidden` → un panneau
  de résultat vide était visible sur l'accueil. Règle `.result-panel[hidden] { display: none }`.
- **(Phase 2) Libellé du curseur de résultat** différent de celui de la démo ("Compare original and
  result" / "Comparer l'original et le résultat") : deux curseurs de même nom accessible sur la page.

- **(Phase 3) Générateur après `vite build`** (et non pages Vite multiples) : un seul gabarit, contenu
  en JSON, CSS haché lu dans le manifeste Vite. Les accueils réutilisent `dist/index.html` de
  l'application (même bundle pour `/` et `/fr/`, langue fixée par `<html data-locale>`).
- **(Phase 3) Slugs FR traduits** (`/fr/alternative-remove-bg/`, `/fr/tutoriels/...`) plutôt que de
  copier les slugs anglais : meilleurs pour la recherche en français ; les paires sont reliées par
  hreflang (même `id` de contenu).
- **(Phase 3) Sélecteur de langue** de l'application : sur une page publiée, il navigue vers l'URL de la
  langue (`/` ↔ `/fr/`) ; pour pt-br/es/id (pas encore de page), re-rendu sur place.
- **(Phase 3) Repli statique dans `#app`** (h1 + accroche de l'application, remplacés par le rendu JS) et
  sections statiques sous l'application (Comment ça marche, Pourquoi, FAQ, liens vers les guides) :
  lisibles par les robots qui n'exécutent pas JavaScript. CLS mesuré : 0.
- **(Phase 3) Pas de date de fermeture de remove.bg sur les pages publiques** : l'info est dans
  Décisions mais sans source publique à citer ; comparatif limité aux limites listées dans Parité, avec
  mention de marque ("non affilié"). À ajouter avec un lien source si on veut l'utiliser.
- **(Phase 3) robots.txt** : tout autorisé (`/models/` exclu : ce ne sont pas des pages) + autorisation
  explicite des robots d'IA (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User,
  Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended,
  CCBot, Meta-ExternalAgent, Amazonbot, DuckAssistBot, MistralAI-User).
- **(Phase 3) `SITE_URL`** : domaine pas encore choisi → les URL absolues (canonical, hreflang, sitemap)
  valent `http://localhost:4173` par défaut, avec un avertissement au build. **À définir au déploiement**
  (DEPLOY.md).
- **(Phase 3) Bug corrigé** : les boutons de l'écran de résultat n'avaient pas la classe `.btn` (forme
  pilule, padding) ; `.skip-link` déplacé dans `base.css` (partagé par toutes les pages).

- **(Phase 4) Hébergement : Cloudflare Pages (site) + R2 (modèles)** : gratuit pour le site, R2 sans
  frais de sortie. Le binaire `ort-wasm-simd-threaded.asyncify.wasm` (25,6 Mio) dépasse la limite de
  25 Mio/fichier de Pages : il part sur R2 avec le `.wasm` simple et les modèles.
- **(Phase 4) Les `.mjs` d'onnxruntime-web restent sur le site** : servis depuis R2, onnxruntime-web les
  importe via une URL `blob:` que la CSP refuse (constaté en test). Plutôt que d'ajouter `blob:` à
  `script-src`, seuls les `.wasm` (téléchargés par fetch, jamais exécutés comme script) viennent de R2 :
  la CSP n'autorise R2 qu'en `connect-src`.
- **(Phase 4) Disposition R2 = disposition Hugging Face** (`<repoId>/resolve/<révision>/…`) :
  transformers.js la lit nativement (`env.remoteHost` + `remotePathTemplate`), `fetch-model.mjs` peut
  l'utiliser comme miroir (`MODEL_BASE_URL`), et la révision dans le chemin rend chaque fichier
  immuable (cache CDN d'un an sans risque).
- **(Phase 4) Les copies `.wasm` émises par Vite** (URL par défaut codée dans onnxruntime-web, impossible
  à éviter au bundle) sont supprimées de `dist/` en mode externe : jamais chargées, car le worker fixe
  toujours `wasmPaths` avant de créer une session.
- **(Phase 4) Bug de test évité** : `VITE_MODEL_BASE_URL=x cmd1 && cmd2` ne passe la variable qu'à
  `cmd1` ; le serveur de preview n'avait pas la bonne CSP. Corrigé avec l'option `env` de Playwright.

- **(P0 gomme/restauration) Le masque retouché vit à la résolution de travail** (≤ 2048 px, canvas
  alpha) et l'export recompose image d'origine + masque agrandi au moment du téléchargement : un coup de
  pinceau ne coûte qu'un redessin de l'aperçu, et l'export reste en pleine résolution. Gomme =
  `destination-out`, restauration = peinture opaque (restaure l'image d'origine, pas un masque
  "intelligent"). Annulation : jusqu'à 20 instantanés. En mode retouche, le curseur avant/après est
  désactivé et le résultat occupe tout le cadre. Pinceau à la souris/au doigt uniquement (pas
  d'équivalent clavier : action de dessin, limite connue).

- **(P0 recadrage) Recadrage = boîte englobante du masque** (alpha > 16) + marge en % du plus grand côté
  du sujet, calculée sur le masque retouché (la gomme change donc le cadre). Redimensionnement = largeur
  de sortie, rapport conservé, **jamais d'agrandissement** (aucun détail ajouté ; un champ vide = taille
  de la région). L'aperçu montre le cadre (zone extérieure assombrie, trait pointillé) ; l'export
  compose directement la région à la taille demandée (pas d'image pleine taille intermédiaire).

## Prochaine étape
P0 du tableau de parité : tous faits. Suite : P1 dans l'ordre du tableau (détourage voitures/logos à
évaluer, fond image, fond flou, formats réseaux sociaux / marketplaces, lot + ZIP, annuler/rétablir
global…). Toujours à valider sur matériel réel : WebGPU (BiRefNet_lite) et WASM sur iPhone ; déploiement
réel (`DEPLOY.md`).
