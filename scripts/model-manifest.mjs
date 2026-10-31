/**
 * Source unique pour la liste des fichiers du modèle. Importé à la fois par
 * `scripts/fetch-model.mjs` (Node, téléchargement + vérification SHA-256) et par
 * `src/core/model/model-source.ts` (navigateur, résolution des chemins locaux).
 * Révision figée (plutôt que "main") pour que la vérification SHA-256 ait un sens :
 * voir context.md > Décisions.
 */

export const MODEL_REPO_ID = "onnx-community/BiRefNet_lite-ONNX";
export const MODEL_REVISION = "de15b22ba131738a16dff04aab8bdf8dc32e3ac1";

/** Les deux seules variantes présentes dans le dépôt (vérifié le 2026-10-31). */
export const MODEL_WEIGHT_FILES = [
  {
    dtype: "fp32",
    path: "onnx/model.onnx",
    sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
    size: 224005088,
  },
  {
    dtype: "fp16",
    path: "onnx/model_fp16.onnx",
    sha256: "d39b897ceb16ae654c1731f3dba0cf9b368d9cae74b5a57459b455cc8bfec402",
    size: 114538221,
  },
];

/** Petits fichiers de config, non versionnés par hash (contenu stable, taille négligeable). */
export const MODEL_AUX_FILES = ["config.json", "preprocessor_config.json"];
