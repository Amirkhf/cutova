# Cutova — context.md

## État actuel
Design system posé (tokens, polices, base CSS, styleguide de contrôle, test de contraste WCAG).
Écran d'accueil (direction C) implémenté en TypeScript vanilla, sans framework : UI complète
(en-tête, accroche, démo avant/après, carte d'envoi avec bouton/glisser-déposer/collage/exemples),
i18n EN/FR, validation de fichiers par signature binaire, accessibilité clavier + axe (0 violation).
Le moteur IA n'est pas branché : l'accueil émet un événement `image:selected` (File) que l'étape
suivante consommera. Build, typecheck, vitest et Playwright passent.

## Modules
- `src/core/model/` — chargement du modèle ONNX, cache OPFS, progression de téléchargement.
- `src/core/inference/` — Web Worker d'inférence (WebGPU en priorité, repli WASM multithread).
- `src/core/postprocess/` — agrandissement du masque à la résolution d'origine, lissage des bords.
- `src/core/export/` — export PNG/WebP, fond blanc ou couleur, export ZIP par lot.
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
- Modèle par défaut : BiRefNet_lite-ONNX (`onnx-community/BiRefNet_lite-ONNX`, fichier `model_fp16.onnx`) — licence MIT.
- Option portraits : MODNet (poids ONNX, ex. `Xenova/modnet`) — licence Apache-2.0.
- INTERDITS : BRIA RMBG-1.4 / RMBG-2.0 (licence non commerciale), `@imgly/background-removal`
  (dépendance à écarter), et tout poids de modèle sans licence écrite noir sur blanc.
- Détail complet des vérifications : voir `LICENSES.md`.

## Sécurité
- Pages de l'outil : en-têtes `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`, CSP stricte, zéro script tiers chargé sur ces pages.
- Test automatisé à écrire : vérifier qu'aucune requête réseau ne contient l'image de l'utilisateur
  (le traitement doit rester 100 % local au navigateur).

## Pages
- Accueil (`/`) : UI faite (direction C), moteur IA à brancher à l'étape 4. La carte d'envoi émet
  `window` `CustomEvent("image:selected", { detail: { file: File, source } })` ; aucun traitement
  d'image n'a lieu pour l'instant.

## Pages SEO
- Structure : EN à la racine, puis `/pt-br/`, `/es/`, `/id/`, `/fr/` avec balises hreflang croisées.
- V1 prioritaire (statut : à faire) :
  - Page d'accueil
  - `/remove-bg-alternative`
  - 3 pages `/how-to/`

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
| Gomme / restauration | ✅ | — | à faire | P0 |
| Recadrage / redimensionnement | ✅ | — | à faire | P0 |
| Formats réseaux sociaux | ✅ | — | à faire | P1 |
| Formats marketplaces (Amazon, eBay, Etsy, Vinted, Shopify) | ✅ | — | à faire | P1 |
| Lot + export ZIP | ✅ | — | à faire | P1 |
| Téléchargement HD | ✅ | — | à faire | P0 |
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
- Benchmark d'inférence p50/p95 WebGPU vs WASM : vide, objectif < 2 s en WebGPU.
- Search Console / Bing sur "remove bg", "background remover", "bg remove", "remove background" : vide.

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
- Validation de fichiers (`src/core/validate-image/`) : taille max **50 Mo** (imposée). Dimensions
  max fixées à **8000 px par côté** — au-delà, un buffer RGBA dépasse ~250 Mo et approche la limite
  de taille de texture de nombreux GPU (souvent 8192 px), pertinent pour l'inférence WebGPU à venir.
  Le type est détecté uniquement par signature binaire (jamais par le nom/extension) ; HEIC est
  reconnu et signalé "non pris en charge" plutôt que rejeté comme format inconnu. Si le navigateur
  ne parvient pas à décoder un fichier dont la signature est pourtant valide (fichier corrompu),
  l'erreur est remontée comme message générique plutôt que de planter silencieusement.
- Images d'exemple et illustration avant/après : formes géométriques simples en SVG/canvas maison
  (cercle, carré, triangle, hexagone) — **à remplacer par de vraies photos libres de droits** dès
  qu'une source est validée.
- i18n : dictionnaire typé, aucune phrase codée en dur dans l'UI. `en` et `fr` complets ; `pt-br`,
  `es`, `id` scaffoldés dans le type `Locale` mais retombent sur `en` (traductions à faire).

## Prochaine étape
Étape 4 : moteur IA (Web Worker, BiRefNet_lite, WebGPU/WASM, cache OPFS).
