# Licences — Cutova

Vérification effectuée le 2026-10-31. Source pour chaque ligne : registre npm (`npm view <pkg> license`)
ou métadonnées de la fiche modèle sur Hugging Face.

| Dépendance / Modèle | Version | Licence | Source | Vérifié le |
|---|---|---|---|---|
| onnx-community/BiRefNet_lite-ONNX (`model_fp16.onnx`) | — (poids, pas de version semver) | MIT | https://huggingface.co/onnx-community/BiRefNet_lite-ONNX (metadata `license: mit`) | 2026-10-31 |
| MODNet — poids ONNX (ex. `Xenova/modnet`) | — (poids, pas de version semver) | Apache-2.0 | https://huggingface.co/Xenova/modnet (metadata `license: apache-2.0`) ; dépôt original https://github.com/ZHKKKe/MODNet | 2026-10-31 |
| @huggingface/transformers | 4.3.2 | Apache-2.0 | npm registry (`npm view`) ; https://www.npmjs.com/package/@huggingface/transformers | 2026-10-31 |
| @fontsource-variable/bricolage-grotesque (police Bricolage Grotesque) | 5.3.0 | OFL-1.1 | npm registry (`npm view`) ; metadata du paquet (`license.type: OFL-1.1`) | 2026-10-31 |
| @fontsource-variable/inter (police Inter) | 5.3.0 | OFL-1.1 | npm registry (`npm view`) ; metadata du paquet (`license.type: OFL-1.1`) | 2026-10-31 |
| onnxruntime-web (dépendance transitive) | 1.31.0-dev.20260914-8d85527a0 | MIT | npm registry (`npm view`) | 2026-10-31 |
| vite | 8.3.5 | MIT | npm registry (`npm view`) | 2026-10-31 |
| typescript | 7.0.2 | Apache-2.0 | npm registry (`npm view`) | 2026-10-31 |
| vitest | 5.0.5 | MIT | npm registry (`npm view`) | 2026-10-31 |
| @playwright/test | 1.64.1 | Apache-2.0 | npm registry (`npm view`) | 2026-10-31 |

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
`onnxruntime-web` est une dépendance transitive de `@huggingface/transformers` (non installée directement).
Sa version résolue actuelle est une version de développement (`-dev`) ; à surveiller lors du passage à une
version stable avant la mise en production.
