/**
 * Identifiant du modèle. Doit rester synchronisé avec `scripts/model-manifest.mjs`
 * (dupliqué plutôt qu'importé : ce fichier est bundlé par Vite/TS, l'autre tourne sous
 * Node pour le téléchargement — les mélanger complique la résolution de module pour un
 * gain nul, la valeur ne change quasiment jamais).
 *
 * C'est aussi l'identifiant transmis à `AutoModel.from_pretrained` / `AutoProcessor.from_pretrained`.
 * Avec `env.allowRemoteModels = false` et `env.allowLocalModels = true`, transformers.js résout
 * ces fichiers sous `${env.localModelPath}${MODEL_REPO_ID}/...`, soit
 * `/models/onnx-community/BiRefNet_lite-ONNX/`, exactement l'arborescence écrite par
 * `scripts/fetch-model.mjs` dans `public/models/`.
 */
export const MODEL_REPO_ID = "onnx-community/BiRefNet_lite-ONNX";

/** Taille d'entrée attendue par `preprocessor_config.json` (voir context.md > Modèle). */
export const MODEL_INPUT_SIZE = 1024;
