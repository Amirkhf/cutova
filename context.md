# Cutova — context.md

## État actuel
Design system posé (tokens, polices, base CSS, styleguide de contrôle, test de contraste WCAG).
Écran d'accueil (direction C) implémenté en TypeScript vanilla, sans framework : UI complète
(en-tête, accroche, démo avant/après, carte d'envoi avec bouton/glisser-déposer/collage/exemples),
i18n EN/FR, validation de fichiers par signature binaire, accessibilité clavier + axe (0 violation).
Moteur IA branché (étape 4) : Web Worker d'inférence (WebGPU → WASM), modèle BiRefNet_lite chargé
via transformers.js (`AutoModel`/`AutoProcessor`), cache OPFS, en-têtes COOP/COEP/CSP en dev et preview,
zéro requête externe (vérifié par test réseau). Écran de résultat **provisoire** (aperçu 1024×1024
sur damier + temps de traitement) branché sur `image:selected`. Limite de pixels adaptée à l'appareil
(remplace l'ancienne limite fixe de 8000 px). Build, typecheck et vitest passent ; Playwright passe
(9/9) mais la case WASM "masque reçu" ne peut pas être vérifiée de bout en bout dans cet environnement
de test précis — voir Mesures ci-dessous, c'est un constat important à lire avant de considérer l'étape
comme pleinement acquise.

## Modules
- `src/core/model/` — `model-source.ts` (identifiant du dépôt HF + taille d'entrée du modèle),
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
- `src/ui/result/render-result.ts` — panneau de résultat **provisoire** (aperçu 1024×1024 sur damier,
  temps de traitement, badge "provisoire") ; s'abonne lui-même à `image:selected`, l'accueil ne le
  connaît pas.
- `scripts/model-manifest.mjs` / `scripts/fetch-model.mjs` — téléchargement des poids + config dans
  `public/models/` (gitignoré) avec vérification SHA-256, revision HF figée.
- `src/core/postprocess/` — agrandissement du masque à la résolution d'origine, lissage des bords
  (étape 5, pas encore implémenté).
- `src/core/export/` — export PNG/WebP, fond blanc ou couleur, export ZIP par lot (étape 5, pas
  encore implémenté).
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
- `seo/` — générateur de pages statiques SEO à partir d'un gabarit unique.
- `content/` — données structurées des pages SEO (une page = une intention de recherche).
- `public/` — fichiers statiques racine (robots.txt, llms.txt à venir).
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
- Option portraits : MODNet (poids ONNX, ex. `Xenova/modnet`) — licence Apache-2.0.
- INTERDITS : BRIA RMBG-1.4 / RMBG-2.0 (licence non commerciale), `@imgly/background-removal`
  (dépendance à écarter), et tout poids de modèle sans licence écrite noir sur blanc.
- Détail complet des vérifications : voir `LICENSES.md`.

## Sécurité
- En dev (`vite`) et preview (`vite preview`) : plugin `vite.config.ts` > `securityHeadersPlugin`
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
  `CustomEvent("image:selected", { detail: { file: File, source } })` ; `src/ui/result/render-result.ts`
  s'y abonne et affiche un aperçu **provisoire** (1024×1024, masque composité sur damier, temps de
  traitement). Pipeline pleine résolution + exports : étape 5.

## Pages SEO
- Structure : EN à la racine, puis `/pt-br/`, `/es/`, `/id/`, `/fr/` avec balises hreflang croisées.
- V1 prioritaire (statut : à faire) :
  - Page d'accueil
  - `/remove-bg-alternative`
  - 3 pages `/how-to/`
- Pages SEO `/for/{segment}` prévues (textes 100 % originaux) : individuals, photographers,
  marketing, developers, ecommerce, media, car-dealerships, enterprise.

## Tables SQLite
(vide — phase 2)

## Endpoints
(vide — phase 2)

## Parité remove.bg vs nous

| Fonction | remove.bg | Cutova | Statut | Priorité |
|---|---|---|---|---|
| Détourage auto (personnes) | ✅ | — | à faire | P0 |
| Détourage auto (produits) | ✅ | — | à faire | P0 |
| Détourage auto (animaux) | ✅ | — | à faire | P0 |
| Détourage auto (voitures) | ✅ | — | à faire | P1 |
| Détourage auto (logos) | ✅ | — | à faire | P1 |
| Fond couleur | ✅ | — | à faire | P0 |
| Fond image | ✅ | — | à faire | P1 |
| Fond flou | ✅ | — | à faire | P1 |
| Pinceau magique (effacer/restaurer) = notre gomme / restauration | ✅ | — | à faire | P0 |
| Recadrage / redimensionnement | ✅ | — | à faire | P0 |
| Formats réseaux sociaux | ✅ | — | à faire | P1 |
| Formats marketplaces (Amazon, eBay, Etsy, Vinted, Shopify) | ✅ | — | à faire | P1 |
| Lot + export ZIP | ✅ | — | à faire | P1 |
| Téléchargement HD | ✅ | — | à faire | P0 |
| Limites fichier/résolution | 22 Mo/fichier, 50 MP max en sortie, aperçu gratuit 0,25 MP | 50 Mo/fichier, pleine résolution gratuite, objectif ≥ 50 MP sur ordinateur (limite iOS : 16,7 MP) | à faire | P0 |
| Coller une image par URL | ✅ | — | à faire | P1 (ouvre `connect-src`/`img-src` — à décider) |
| Applis ordinateur + Android | ✅ | couvertes par la PWA | à faire | P1 |
| Extension Photoshop | ✅ | — | plus tard | P2 |
| Modèles de design | ✅ | — | plus tard | P2 |
| Vidéo | ✅ | — | plus tard | P2 |
| Noter le résultat / donner l'image à l'IA | ✅ | — | **NON** (contraire à "zéro upload") | — |
| API (phase 2) | ✅ | — | à faire | P2 |
| Pleine résolution gratuite sans compte | ❌ | — | à faire | P0 |
| Zéro upload (100 % navigateur) | ❌ | — | à faire | P0 |
| Ombre portée | ❌ | — | à faire | P2 |
| Contour / sticker | ❌ | — | à faire | P2 |
| Recadrage auto avec marge | ❌ | — | à faire | P1 |
| Annuler / rétablir | ❌ | — | à faire | P1 |
| Curseur avant/après | ❌ | — | à faire | P1 |
| Collage presse-papiers | ❌ | — | à faire | P1 |
| Glisser-déposer | ❌ | — | à faire | P1 |
| PWA hors ligne | ❌ | — | à faire | P2 |
| Extension Chrome | ❌ | — | à faire | P2 |

## Mesures
- Lighthouse (Performance / SEO / Accessibilité) : vide.
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
- Conclusion provisoire : l'infrastructure (sélection de moteur, repli, cache OPFS, téléchargement,
  isolation réseau, affichage d'erreur) fonctionne et est testée ; mais ni WASM ni WebGPU n'ont pu
  produire un masque de bout en bout dans ce bac à sable précis (mémoire WASM insuffisante d'un côté,
  pas de GPU réel de l'autre). Priorité pour la suite : valider sur un appareil avec vrai GPU.

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

## Prochaine étape
Étape 5 : pipeline pleine résolution (agrandissement du masque, lissage des bords) + écran résultat + exports.
