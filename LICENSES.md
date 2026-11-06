# Licences — Cutova

Vérification effectuée le 2026-10-31 (ré-vérifiée le 2026-10-31 pour le moteur d'inférence). Source
pour chaque ligne : registre npm (`npm view <pkg> license`) ou métadonnées de la fiche modèle sur
Hugging Face.

| Dépendance / Modèle | Version | Licence | Source | Vérifié le |
|---|---|---|---|---|
| onnx-community/BiRefNet_lite-ONNX (`onnx/model.onnx`, fp32) | — (poids, pas de version semver) | MIT | https://huggingface.co/onnx-community/BiRefNet_lite-ONNX (page modèle : "License: mit") | 2026-10-31 |
| onnx-community/BiRefNet_lite-ONNX (`onnx/model_fp16.onnx`) | — (poids, pas de version semver) | MIT | https://huggingface.co/onnx-community/BiRefNet_lite-ONNX (page modèle : "License: mit") | 2026-10-31 |
| onnx-community/ormbg-ONNX (`onnx/model.onnx`, fp32) — **modèle du moteur WASM** (révision `034e2d88`) | — (poids, pas de version semver) | Apache-2.0 | https://huggingface.co/onnx-community/ormbg-ONNX (en-tête de fiche `license: apache-2.0`) ; modèle d'origine https://huggingface.co/schirrmacher/ormbg (`license: apache-2.0`) | 2026-10-31 |
| BritishWerewolf/IS-Net (`onnx/model.onnx`, fp32) — alternative WASM listée dans `models.json`, **non utilisée** (révision `9783722d`) | — (poids, pas de version semver) | Apache-2.0 | https://huggingface.co/BritishWerewolf/IS-Net (fiche : "This model is licensed under the Apache License 2.0 to match the original IS-Net model") | 2026-10-31 |
| MODNet — poids ONNX (ex. `Xenova/modnet`) | — (poids, pas de version semver) | Apache-2.0 | https://huggingface.co/Xenova/modnet (metadata `license: apache-2.0`) ; dépôt original https://github.com/ZHKKKe/MODNet | 2026-10-31 |
| @huggingface/transformers | 4.3.2 | Apache-2.0 | npm registry (`npm view`) ; https://www.npmjs.com/package/@huggingface/transformers | 2026-10-31 |
| @fontsource-variable/bricolage-grotesque (police Bricolage Grotesque) | 5.3.0 | OFL-1.1 | npm registry (`npm view`) ; metadata du paquet (`license.type: OFL-1.1`) | 2026-10-31 |
| @fontsource-variable/inter (police Inter) | 5.3.0 | OFL-1.1 | npm registry (`npm view`) ; metadata du paquet (`license.type: OFL-1.1`) | 2026-10-31 |
| onnxruntime-web (dépendance directe depuis l'étape 4 : `worker.ts` importe ses binaires wasm) | 1.31.0-dev.20260914-8d85527a0 | MIT | npm registry (`npm view`) | 2026-10-31 |
| vite | 8.3.5 | MIT | npm registry (`npm view`) | 2026-10-31 |
| typescript | 7.0.2 | Apache-2.0 | npm registry (`npm view`) | 2026-10-31 |
| vitest | 5.0.5 | MIT | npm registry (`npm view`) | 2026-10-31 |
| onnxruntime-node (scripts de référence/banc uniquement, dépendance transitive de @huggingface/transformers, jamais servie au navigateur) | 1.30.0 | MIT | npm registry | 2026-10-31 |
| sharp (scripts et tests uniquement, transitif) | voir package-lock | Apache-2.0 | npm registry | 2026-10-31 |
| @playwright/test | 1.64.1 | Apache-2.0 | npm registry (`npm view`) | 2026-10-31 |
| @axe-core/playwright (tests d'accessibilité, dev uniquement) | 4.14.0 | MPL-2.0 | npm registry (`npm view`) | 2026-10-31 |

## Données de test (non distribuées sur le site)
| Contenu | Licence | Source | Vérifié le |
|---|---|---|---|
| 20 photos `tests/images/*.jpg` | Licence Pexels (usage gratuit, commercial inclus, sans attribution) | Pexels, via le miroir HF `ujin-song/pexels-image-60k` (rév. `714c2603`) ; détail par photo et réserve de revérification : `tests/images/SOURCES.md` | 2026-10-31 |

## Interdits
- **BRIA RMBG-1.4 / RMBG-2.0** — licence non commerciale (usage commercial soumis à accord payant avec BRIA AI). Interdit sans accord écrit.
- **@imgly/background-removal** — licence commerciale IMG.LY, à ne pas intégrer.
- Tout poids de modèle dont la licence n'est pas écrite noir sur blanc sur la page source (fiche modèle, dépôt, ou fichier LICENSE).
- Toute dépendance **GPL ou AGPL** sans accord écrit préalable, quelle que soit la version.

## Règle
Aucune dépendance GPL/AGPL n'entre dans le projet sans accord écrit explicite. En l'absence de mention de
licence écrite noir sur blanc pour un modèle ou une dépendance, elle doit être marquée **NON VÉRIFIÉE** ici
et signalée avant toute utilisation en production.

## Note
`onnxruntime-web` était une dépendance transitive de `@huggingface/transformers` ; elle est maintenant
déclarée directement dans `package.json` (version figée, sans `^`) car `src/core/inference/worker.ts`
importe ses binaires `.wasm`/`.mjs` par leur chemin exact (`onnxruntime-web/ort-wasm-simd-threaded*`).
Sa version résolue actuelle est une version de développement (`-dev`) ; à surveiller lors du passage à une
version stable avant la mise en production.
