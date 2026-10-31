# Cutova — context.md

## État actuel
Projet initialisé : squelette Vite + TypeScript strict, arborescence de dossiers créée, aucun code
de fonctionnalité ni d'interface. Build et typecheck passent. Prêt pour l'étape 2 (directions visuelles).

## Modules
- `src/core/model/` — chargement du modèle ONNX, cache OPFS, progression de téléchargement.
- `src/core/inference/` — Web Worker d'inférence (WebGPU en priorité, repli WASM multithread).
- `src/core/postprocess/` — agrandissement du masque à la résolution d'origine, lissage des bords.
- `src/core/export/` — export PNG/WebP, fond blanc ou couleur, export ZIP par lot.
- `src/ui/` — interface utilisateur de l'outil de détourage.
- `src/styles/` — tokens CSS du design system (couleurs, typographie, espacements).
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

## Prochaine étape
Étape 2 : directions visuelles, en attente de validation.
